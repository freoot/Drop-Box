package autoclaw

// Engine：AutoClaw 上游的 Go 原生实现（替代独立 Python 容器 autoclaw2api）。
// 账号池/状态机/签到/维护循环/三通道 chat 全部在进程内运行，
// 对外暴露与旧桥接完全一致的 HTTP 面（/v1/chat/completions、/v1/models、
// /status、/api/*、/healthz），主网关 handler 无感切换。

import (
	"crypto/md5"
	"crypto/tls"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Config 引擎配置（对应 autoclaw2api config.json + 主网关 autoclaw 段）。
type Config struct {
	// AuthDir 凭证目录（autoclaw-*.json）。
	AuthDir string
	// StateDir 状态文件目录（state.cn.json / state.global.json）。
	StateDir string
	// Mode chat 通道模式：auto / proxy / openai / relay。
	Mode string
	// MaxRotate 单请求最多换号次数。
	MaxRotate int
	// HardCooldown / SoftCooldown / ErrCooldown 冷却时长（秒）。
	HardCooldown float64
	SoftCooldown float64
	ErrCooldown  float64
	// ErrThreshold 连续错误进入冷却的阈值。
	ErrThreshold int
	// MaintenanceMinutes 维护循环间隔（分钟）。
	MaintenanceMinutes float64
	// KeepaliveMinutes 沙箱保活循环间隔（分钟，<=0 关闭）。沙箱空闲会休眠，
	// 冷唤醒首字延迟 30~120s；周期性 wake 让沙箱常热（wake 自带 10min hold）。
	KeepaliveMinutes float64
	// TimeoutSeconds 上游请求超时。
	TimeoutSeconds float64
	// UserAPIBaseOverride userapi 基址覆盖（调试用）。
	UserAPIBaseOverride string
}

// Engine 引擎实例。
type Engine struct {
	cfg   Config
	up    *upstream
	pools map[string]*Pool

	modelsMu     sync.Mutex
	modelsCache  []map[string]any
	modelsAt     time.Time
	modelsFailAt time.Time
}

// parseDur 移植 _dur："12h"/"60s"/"600"/"30m"/"1d"。
func parseDur(v any, def float64) float64 {
	if v == nil {
		return def
	}
	s := strings.TrimSpace(toString(v))
	if s == "" {
		return def
	}
	m := regexp.MustCompile(`^(\d+)\s*([smhd]?)$`).FindStringSubmatch(s)
	if m == nil {
		return def
	}
	n, _ := strconv.ParseFloat(m[1], 64)
	unit := m[2]
	if unit == "" {
		unit = "s"
	}
	mult := map[string]float64{"s": 1, "m": 60, "h": 3600, "d": 86400}[unit]
	return n * mult
}

// NewEngine 构造引擎并启动维护循环。
func NewEngine(cfg Config) *Engine {
	if cfg.Mode == "" {
		cfg.Mode = "auto"
	}
	if cfg.MaxRotate <= 0 {
		cfg.MaxRotate = 3
	}
	if cfg.HardCooldown <= 0 {
		cfg.HardCooldown = 12 * 3600
	}
	if cfg.SoftCooldown <= 0 {
		cfg.SoftCooldown = 60
	}
	if cfg.ErrThreshold <= 0 {
		cfg.ErrThreshold = 3
	}
	if cfg.ErrCooldown <= 0 {
		cfg.ErrCooldown = 600
	}
	if cfg.MaintenanceMinutes <= 0 {
		cfg.MaintenanceMinutes = 30
	}
	if cfg.KeepaliveMinutes == 0 {
		cfg.KeepaliveMinutes = 5
	}
	if cfg.TimeoutSeconds <= 0 {
		cfg.TimeoutSeconds = 120
	}
	e := &Engine{
		cfg:   cfg,
		up:    newUpstream(cfg.TimeoutSeconds, cfg.UserAPIBaseOverride),
		pools: map[string]*Pool{},
	}
	e.pools["cn"] = newPool("cn", filepath.Join(cfg.StateDir, "state.cn.json"))
	e.pools["global"] = newPool("global", filepath.Join(cfg.StateDir, "state.global.json"))
	e.rescan()
	go e.maintainLoop()
	go e.keepaliveLoop()
	return e
}

func (e *Engine) rescan() {
	for region := range e.pools {
		e.pools[region].sync(loadDir(e.cfg.AuthDir, region))
	}
}

func (e *Engine) maintainLoop() {
	interval := time.Duration(e.cfg.MaintenanceMinutes * float64(time.Minute))
	for {
		func() {
			defer func() { _ = recover() }()
			e.maintainNow()
		}()
		time.Sleep(interval)
	}
}

// maintainNow 积分刷新 + token 刷新 + session dead 自愈（移植 maintain_now）。
func (e *Engine) maintainNow() {
	e.rescan()
	for region, pool := range e.pools {
		_ = region
		for _, st := range pool.statusList() {
			if st.Disabled {
				// session dead 停用的账号自愈尝试（人工停用绝不动）。
				if strings.Contains(st.Reason, "session dead") {
					a := pool.authByUID(st.UID)
					if a != nil && strings.TrimSpace(a.RefreshToken) != "" {
						if err := e.up.refresh(a); err == nil {
							if serr := a.Save(); serr == nil {
								pts, perr := e.up.checkPoints(a)
								if perr == nil {
									pool.setPoints(st.UID, pts)
								}
								pool.reenable(st.UID)
								log.Printf("maintain %s recovered from session dead via refresh", st.UID[:minLen(st.UID, 8)])
							}
						} else {
							log.Printf("maintain %s recovery: %v", st.UID[:minLen(st.UID, 8)], err)
						}
					}
				}
				continue
			}
			a := pool.authByUID(st.UID)
			if a == nil {
				continue
			}
			if strings.TrimSpace(a.RefreshToken) != "" && a.NeedsRefresh(600) {
				if err := e.up.refresh(a); err != nil {
					if ue, ok := err.(*UpstreamError); ok && ue.Kind == "session_dead" {
						pool.disable(st.UID, "refresh session dead")
						continue
					}
					log.Printf("maintain %s refresh: %v", st.UID, err)
				} else {
					_ = a.Save()
				}
			}
			if pts, err := e.up.checkPoints(a); err == nil {
				pool.setPoints(st.UID, pts)
				pool.reenableIfPoints(st.UID, pts)
			} else {
				log.Printf("maintain %s points: %v", st.UID, err)
			}
		}
	}
}

// keepaliveLoop 沙箱保活循环：周期性对健康账号做 ensureSandbox+wake，
// 让沙箱常热（免冷唤醒 30~120s 首字延迟）。KeepaliveMinutes<=0 关闭。
func (e *Engine) keepaliveLoop() {
	minutes := e.cfg.KeepaliveMinutes
	if minutes <= 0 {
		return
	}
	interval := time.Duration(minutes * float64(time.Minute))
	for {
		time.Sleep(interval)
		func() {
			defer func() { _ = recover() }()
			e.keepaliveNow()
		}()
	}
}

// keepaliveNow 对未停用、未冷却的账号执行 prepare（cn 有效；global 区空操作）。
// 成功不动任何记账状态（保活不该抹掉真实错误计数）；session_dead 停号。
func (e *Engine) keepaliveNow() {
	for _, pool := range e.pools {
		for _, st := range pool.statusList() {
			if st.Disabled || st.Cooling {
				continue
			}
			a := pool.authByUID(st.UID)
			if a == nil || strings.TrimSpace(a.AccessToken) == "" {
				continue
			}
			if err := e.prepare(a); err != nil {
				if ue, ok := err.(*UpstreamError); ok && ue.Kind == "session_dead" {
					pool.disable(st.UID, "keepalive session dead")
					continue
				}
				log.Printf("keepalive %s: %v", st.UID[:minLen(st.UID, 8)], err)
			}
		}
	}
}

// Healthy 是否有可用账号（跨池兜底判定用）。
func (e *Engine) Healthy() bool {
	for _, pool := range e.pools {
		if pool.counts().Healthy > 0 {
			return true
		}
	}
	return false
}

// ---- 模型列表 ----

var cnStaticModels = []string{
	"openclaw", "openclaw/default", "glm-5.3-flash", "glm-5.2",
	"zai_auto", "zai_auto-fast", "zai_glm-5.3-flash", "zaicoding_glm-5.3",
	"tdpsk_deepseek-v4-flash-202605", "tdpsk_deepseek-v4-pro-202606",
}
var globalStaticModels = []string{
	"zai_auto", "zai_auto-fast", "zaicoding_glm-5.3",
	"tdpsk_deepseek-v4-flash-202605", "tdpsk_deepseek-v4-pro-202606", "zai_glm-5.3-flash",
}

// channelAlias 上游沙箱模型自带的通道前缀（zai_=智谱、zaicoding_=智谱编码、
// tdpsk_=DeepSeek 通道）→ 对外裸名。对外目录与 /v1/models 只暴露裸名（与其它池
// 同名即可纳入跨池轮询），调用时经 upstreamModel 还原上游真名。
// zai_auto / zai_auto-fast 是「自动路由」语义，剥壳会与主池 auto 撞车，保留原名。
var channelAlias = map[string]string{
	"zai_glm-5.3-flash":              "glm-5.3-flash",
	"zaicoding_glm-5.3":              "glm-5.3",
	"tdpsk_deepseek-v4-flash-202605": "deepseek-v4-flash",
	"tdpsk_deepseek-v4-pro-202606":   "deepseek-v4-pro",
}

// upstreamModel 对外裸名 → 上游沙箱真名（channelAlias 的反向表，大小写不敏感）。
func upstreamModel(model string) string {
	for real, exposed := range channelAlias {
		if strings.EqualFold(exposed, model) {
			return real
		}
	}
	return model
}

// exposedID 上游沙箱真名 → 对外裸名。
func exposedID(id string) string {
	if a, ok := channelAlias[id]; ok {
		return a
	}
	return id
}

func staticModels() []map[string]any {
	out := make([]map[string]any, 0, len(cnStaticModels)+len(globalStaticModels))
	seen := map[string]bool{}
	add := func(mid, region string) {
		id := exposedID(mid)
		if seen[id] {
			return
		}
		seen[id] = true
		e := map[string]any{"id": id, "object": "model", "created": 1787000000,
			"owned_by": "autoclaw", "context_length": 1000000, "description": region}
		if id != mid {
			e["note"] = "上游名 " + mid
		}
		out = append(out, e)
	}
	for _, m := range cnStaticModels {
		add(m, "cn")
	}
	for _, m := range globalStaticModels {
		add(m, "global")
	}
	return out
}

// Models 模型目录（1h 缓存 + 5min 失败缓存 + 静态兜底）。
func (e *Engine) Models() []map[string]any {
	e.modelsMu.Lock()
	defer e.modelsMu.Unlock()
	now := time.Now()
	if len(e.modelsCache) > 0 && now.Sub(e.modelsAt) < time.Hour {
		return e.modelsCache
	}
	if !e.modelsFailAt.IsZero() && now.Sub(e.modelsFailAt) < 5*time.Minute {
		if len(e.modelsCache) > 0 {
			return e.modelsCache
		}
		return staticModels()
	}
	var out []map[string]any
	seen := map[string]int{}   // 对外裸名 → out 下标（cn/global 跨区去重）
	cwByUp := map[string]int64{} // 上游真名 → 上下文窗口（global fetchModelConfig 提供）
	mergeRegion := func(idx int, region string) {
		d, _ := out[idx]["description"].(string)
		if d == region || strings.Contains(d, "("+region+")") ||
			strings.Contains(d, "+"+region) || strings.HasSuffix(d, "+"+region) {
			return
		}
		if d == "" {
			d = region
		} else {
			d = d + "+" + region
		}
		out[idx]["description"] = d
	}
	addModel := func(mid, region, name string) {
		if mid == "" {
			return
		}
		id := exposedID(mid)
		if idx, ok := seen[id]; ok {
			mergeRegion(idx, region)
			return
		}
		entry := map[string]any{"id": id, "object": "model", "created": 1787000000,
			"owned_by": "autoclaw", "context_length": int64(1000000), "description": region}
		if cw := cwByUp[mid]; cw > 0 {
			entry["context_length"] = cw
		}
		if name != "" {
			entry["description"] = name + " (" + region + ")"
		}
		if id != mid {
			entry["note"] = "上游名 " + mid
		}
		seen[id] = len(out)
		out = append(out, entry)
	}
	for _, region := range []string{"cn", "global"} {
		a := e.pools[region].pick(nil)
		if a == nil {
			continue
		}
		if e.prepare(a) != nil {
			continue
		}
		if region == "global" {
			for _, it := range e.up.fetchModelConfig(a) {
				if it.ID == "" {
					continue
				}
				if v := toInt64(it.ContextWindow); v > 0 {
					cwByUp[it.ID] = v
				}
				addModel(it.ID, region, it.Name)
			}
		}
		for _, mid := range e.up.fetchSandboxModels(a) {
			addModel(mid, region, "")
		}
	}
	if len(out) > 0 {
		e.modelsCache, e.modelsAt, e.modelsFailAt = out, now, time.Time{}
		return out
	}
	e.modelsFailAt = now
	if len(e.modelsCache) > 0 {
		return e.modelsCache
	}
	return staticModels()
}

// KnownSet 模型 id 集合（含上游真名兼容：对外裸名 + 通道前缀原名）。
func (e *Engine) KnownSet() map[string]bool {
	set := map[string]bool{}
	for _, m := range e.Models() {
		if id, _ := m["id"].(string); id != "" {
			set[id] = true
			set[strings.ToLower(id)] = true
		}
	}
	for real := range channelAlias {
		set[real] = true
		set[strings.ToLower(real)] = true
	}
	return set
}

// canonicalModel 把 model 大小写不敏感地归一到目录精确 id（对外裸名）。
// 对外统一小写暴露后入站均为小写，上游若要求精确大小写在这里还原；未命中原样
// 返回（上游报明确的错）。上游真名（如 zaicoding_glm-5.3）入站同样兼容：先于
// 裸名匹配，归一小写后原样放行，再由 chat 的 upstreamModel 语义直通上游。
func (e *Engine) canonicalModel(model string) string {
	if model == "" {
		return model
	}
	for _, m := range e.Models() {
		id, _ := m["id"].(string)
		if id == model && !strings.Contains(id, "/") {
			return id
		}
	}
	for _, m := range e.Models() {
		id, _ := m["id"].(string)
		if !strings.Contains(id, "/") && strings.EqualFold(id, model) {
			return id
		}
	}
	if low := strings.ToLower(model); channelAliasRealName(low) {
		return low
	}
	return model
}

// channelAliasRealName 名字是否为上游沙箱真名（通道前缀原名的精确匹配）。
func channelAliasRealName(low string) bool {
	for real := range channelAlias {
		if real == low {
			return true
		}
	}
	return false
}

// KnownCache KnownSet 的 60 秒 TTL 缓存（沿用旧桥接 API）。
type KnownCache struct {
	ttl time.Duration
	mu  chan struct{}
	set map[string]bool
	at  time.Time
}

// NewKnownCache 构造缓存。
func NewKnownCache() *KnownCache {
	return &KnownCache{ttl: 60 * time.Second, mu: make(chan struct{}, 1)}
}

func (k *KnownCache) get() (map[string]bool, bool) {
	k.mu <- struct{}{}
	defer func() { <-k.mu }()
	return k.set, k.set != nil && time.Since(k.at) < k.ttl
}

func (k *KnownCache) put(set map[string]bool) {
	k.mu <- struct{}{}
	defer func() { <-k.mu }()
	k.set, k.at = set, time.Now()
}

// KnownModel 双重匹配（精确/小写，带缓存）。
func (e *Engine) KnownModel(model string, cache *KnownCache) bool {
	if cache != nil {
		if set, ok := cache.get(); ok {
			return set[strings.ToLower(model)]
		}
		set := e.KnownSet()
		cache.put(set)
		return set[strings.ToLower(model)]
	}
	return e.KnownSet()[strings.ToLower(model)]
}

// ---- 积分流水 / 登录 ----

// creditDetail 积分流水 + 过期积分（移植 credit_detail）。
func (e *Engine) creditDetail(region string) map[string]any {
	pool := e.pools[region]
	if pool == nil {
		return map[string]any{"error": "bad region"}
	}
	a := pool.pick(nil)
	if a == nil {
		return map[string]any{"error": "no " + region + " account"}
	}
	out := map[string]any{"region": region, "uid": a.UserID, "entries": []any{}, "expiring": nil}
	if raw, err := e.up.ledgers(a, 1, 20); err == nil {
		var env struct {
			Code any `json:"code"`
			Data struct {
				Entries []map[string]any `json:"entries"`
				Total   any              `json:"total"`
			} `json:"data"`
			Msg any `json:"msg"`
		}
		if json.Unmarshal(raw, &env) == nil && toInt64(env.Code) == 0 {
			entries := make([]map[string]any, 0, len(env.Data.Entries))
			for _, en := range env.Data.Entries {
				meta, _ := en["metadata"].(map[string]any)
				row := map[string]any{
					"time":  en["occurred_at"],
					"amount": en["amount"],
					"model": "", "actual_model": "", "reason": "", "charged": "", "cap": "", "token_usage": "",
				}
				if meta != nil {
					row["model"] = orStr(meta["model"], meta["display_model"])
					row["actual_model"] = toString(meta["actual_model"])
					row["reason"] = orStr(meta["reason"], en["mutation_type"])
					row["charged"] = toString(meta["charged_amount"])
					row["cap"] = toString(meta["request_point_cap"])
					row["token_usage"] = toString(meta["token_usage"])
				} else {
					row["reason"] = toString(en["mutation_type"])
				}
				row["description"] = toString(en["description"])
				entries = append(entries, row)
			}
			out["entries"] = entries
			if env.Data.Total != nil {
				out["total"] = env.Data.Total
			} else {
				out["total"] = len(entries)
			}
		} else {
			out["error"] = fmt.Sprintf("ledgers code=%v %.100s", env.Code, toString(env.Msg))
		}
	} else {
		out["error"] = truncStr(err.Error(), 150)
	}
	if raw, err := e.up.pointsExpiring(a); err == nil {
		var env struct {
			Code any `json:"code"`
			Data map[string]any `json:"data"`
		}
		if json.Unmarshal(raw, &env) == nil && toInt64(env.Code) == 0 && env.Data != nil {
			out["expiring"] = map[string]any{
				"points": env.Data["expiring_points"],
				"total":  env.Data["total_points"],
				"days":   env.Data["expire_time_value"],
				"text":   env.Data["expiring_points_text"],
			}
		}
	}
	return out
}

func orStr(vals ...any) string {
	for _, v := range vals {
		if s := toString(v); s != "" {
			return s
		}
	}
	return ""
}

// refreshCreditsNow 全账号积分刷新（移植 refresh_credits_now）。
func (e *Engine) refreshCreditsNow() map[string]any {
	out := []map[string]any{}
	for region, pool := range e.pools {
		for _, st := range pool.statusList() {
			if st.Disabled {
				out = append(out, map[string]any{"uid": st.UID, "region": region, "points": st.Points, "error": "disabled"})
				continue
			}
			a := pool.authByUID(st.UID)
			if a == nil {
				continue
			}
			if pts, err := e.up.checkPoints(a); err == nil {
				pool.setPoints(st.UID, pts)
				pool.reenableIfPoints(st.UID, pts)
				out = append(out, map[string]any{"uid": st.UID, "region": region, "points": pts})
			} else {
				out = append(out, map[string]any{"uid": st.UID, "region": region, "points": st.Points, "error": truncStr(err.Error(), 120)})
			}
		}
	}
	return map[string]any{"accounts": out}
}

// loadOrNewDevice 登录设备 ID（.device-<phone> 文件持久化）。
func (e *Engine) loadOrNewDevice(phone string) string {
	fp := filepath.Join(e.cfg.AuthDir, ".device-"+phone)
	if raw, err := os.ReadFile(fp); err == nil {
		if s := strings.TrimSpace(string(raw)); s != "" {
			return s
		}
	}
	sum := md5.Sum([]byte(fmt.Sprintf("%s%d", phone, time.Now().UnixNano())))
	hex := fmt.Sprintf("%x", sum)
	d := fmt.Sprintf("%s-%s-%s-%s-%s", hex[0:8], hex[8:12], hex[12:16], hex[16:20], hex[20:32])
	_ = os.WriteFile(fp, []byte(d), 0o644)
	return d
}

// loginCNSendCode 手机验证码发送。
func (e *Engine) loginCNSendCode(phone string) error {
	deviceID := e.loadOrNewDevice(phone)
	return e.up.sendCode("cn", deviceID, phone)
}

// loginCN 手机验证码登录并入库。
func (e *Engine) loginCN(phone, code string) map[string]any {
	deviceID := e.loadOrNewDevice(phone)
	data, err := e.up.login("cn", deviceID, phone, code)
	if err != nil {
		return map[string]any{"error": err.Error()}
	}
	uid := toString(data.UserID)
	if data.AccessToken == "" || uid == "" {
		return map[string]any{"error": "login response missing access_token/user_id"}
	}
	a := &Auth{
		AccessToken:  data.AccessToken,
		RefreshToken: data.RefreshToken,
		ExpiresAt:    time.Now().Unix() + 28*86400,
		UserID:       uid,
		UserName:     data.UserName,
		Phone:        phone,
		DeviceID:     deviceID,
		Region:       "cn",
		FilePath:     filepath.Join(e.cfg.AuthDir, "autoclaw-"+uid+".json"),
	}
	if err := a.Save(); err != nil {
		return map[string]any{"error": err.Error()}
	}
	e.rescan()
	return map[string]any{"uid": a.UserID, "name": a.UserName, "region": "cn"}
}

// loginGlobalImportDesktop 从桌面端 ~/.openclaw-autoclaw 导入 global JWT。
func (e *Engine) loginGlobalImportDesktop() map[string]any {
	home, err := os.UserHomeDir()
	if err != nil {
		return map[string]any{"error": err.Error()}
	}
	jwt := ""
	for _, name := range []string{"request-headers.json", "openclaw.json"} {
		fp := filepath.Join(home, ".openclaw-autoclaw", name)
		raw, err := os.ReadFile(fp)
		if err != nil {
			continue
		}
		var doc map[string]any
		if json.Unmarshal(raw, &doc) != nil {
			continue
		}
		if headers, ok := doc["headers"].(map[string]any); ok {
			jwt = toString(headers["X-Authorization"])
		} else {
			models, _ := doc["models"].(map[string]any)
			providers, _ := models["providers"].(map[string]any)
			zai, _ := providers["zai"].(map[string]any)
			mlist, _ := zai["models"].([]any)
			bestIAT := int64(-1)
			for _, m := range mlist {
				mm, _ := m.(map[string]any)
				if mm == nil {
					continue
				}
				hh, _ := mm["headers"].(map[string]any)
				xa := toString(hh["X-Authorization"])
				if xa == "" {
					continue
				}
				if iat := jwtClaimInt(xa, "iat"); iat > bestIAT {
					bestIAT, jwt = iat, xa
				}
			}
		}
		if jwt != "" {
			break
		}
	}
	jwt = stripBearer(jwt)
	if jwt == "" {
		return map[string]any{"error": "desktop JWT not found (~/.openclaw-autoclaw)"}
	}
	uid := fmt.Sprintf("%v", jwtPayloadField(jwt, "user_id"))
	if uid == "" || uid == "<nil>" {
		return map[string]any{"error": "JWT missing user_id"}
	}
	exp := jwtClaimInt(jwt, "exp")
	if exp == 0 {
		exp = time.Now().Unix() + 86400
	}
	a := &Auth{
		AccessToken: "Bearer " + jwt,
		ExpiresAt:   exp,
		UserID:      uid,
		UserName:    "global-desktop",
		DeviceID:    fmt.Sprintf("%v", jwtPayloadField(jwt, "device_id")),
		Region:      "global",
		FilePath:    filepath.Join(e.cfg.AuthDir, "autoclaw-global-"+uid+".json"),
	}
	if err := a.Save(); err != nil {
		return map[string]any{"error": err.Error()}
	}
	e.rescan()
	return map[string]any{"uid": uid, "region": "global", "exp": exp}
}

// loginGlobalOAuth Google OAuth 回调登录（global）。
func (e *Engine) loginGlobalOAuth(callbackURL string) map[string]any {
	u, err := url.Parse(strings.TrimSpace(callbackURL))
	if err != nil {
		return map[string]any{"error": "callback URL parse failed: " + err.Error()}
	}
	code := u.Query().Get("code")
	state := u.Query().Get("state")
	if code == "" || state == "" {
		return map[string]any{"error": "callback URL missing code/state"}
	}
	deviceID := e.loadOrNewDevice("global-oauth")
	full := userapiBase["global"] + "/userapi/overseasv1/google-oauth-login"
	raw, err := e.up.doJSON(http.MethodPost, full, userapiHeaders(""),
		map[string]any{"source_id": "autoclaw", "device_id": deviceID, "code": code, "state": state, "platform": "web"}, true)
	if err != nil {
		return map[string]any{"error": fmt.Sprintf("oauth-login request failed: %v", err)}
	}
	var env map[string]any
	if json.Unmarshal(raw, &env) != nil {
		return map[string]any{"error": "oauth-login parse failed"}
	}
	data, _ := env["data"].(map[string]any)
	if data == nil {
		data = env
	}
	token := orStr(data["access_token"], env["access_token"])
	if token == "" {
		return map[string]any{"error": fmt.Sprintf("oauth-login no access_token"), "msg": truncStr(toString(env), 300)}
	}
	uid := fmt.Sprintf("%v", jwtPayloadField(token, "user_id"))
	if uid == "" || uid == "<nil>" {
		return map[string]any{"error": "token missing user_id"}
	}
	a := &Auth{
		AccessToken:  bearer(token),
		RefreshToken: orStr(data["refresh_token"], env["refresh_token"]),
		ExpiresAt:    time.Now().Unix() + 28*86400,
		UserID:       uid,
		UserName:     "global-oauth",
		DeviceID:     deviceID,
		Region:       "global",
		FilePath:     filepath.Join(e.cfg.AuthDir, "autoclaw-global-"+uid+".json"),
	}
	if err := a.Save(); err != nil {
		return map[string]any{"error": err.Error()}
	}
	e.rescan()
	return map[string]any{"uid": uid, "region": "global"}
}

func jwtPayloadField(token, key string) any {
	parts := strings.Split(stripBearer(token), ".")
	if len(parts) < 2 {
		return nil
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		payload, err = base64.URLEncoding.DecodeString(parts[1] + strings.Repeat("=", (4-len(parts[1])%4)%4))
		if err != nil {
			return nil
		}
	}
	var doc map[string]any
	if json.Unmarshal(payload, &doc) != nil {
		return nil
	}
	return doc[key]
}

// ---- HTTP 面（与旧 Python 版路由一致；挂载于主网关 /autoclaw/ 前缀下）----

func (e *Engine) writeJSON(w http.ResponseWriter, status int, obj any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	raw, err := json.Marshal(obj)
	if err == nil {
		_, _ = w.Write(raw)
	}
}

// Handler 全量 HTTP 面（含 chat；StripPrefix 后的路径）。
func (e *Engine) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		total, healthy := 0, 0
		for _, pool := range e.pools {
			c := pool.counts()
			total += c.Total
			healthy += c.Healthy
		}
		status := http.StatusOK
		if healthy == 0 {
			status = http.StatusServiceUnavailable
		}
		e.writeJSON(w, status, map[string]any{"healthy": healthy, "total": total})
	})
	mux.HandleFunc("GET /v1/models", func(w http.ResponseWriter, r *http.Request) {
		e.writeJSON(w, http.StatusOK, map[string]any{"object": "list", "data": e.Models()})
	})
	mux.HandleFunc("GET /status", func(w http.ResponseWriter, r *http.Request) {
		accounts := append(e.pools["cn"].statusList(), e.pools["global"].statusList()...)
		e.writeJSON(w, http.StatusOK, map[string]any{"accounts": accounts, "mode": e.cfg.Mode})
	})
	mux.HandleFunc("POST /v1/chat/completions", e.chat)
	mux.HandleFunc("GET /api/tasks", func(w http.ResponseWriter, r *http.Request) {
		region := sanitizeRegion(r.URL.Query().Get("region"), "all")
		data, err := e.checkinRun(region, true, "tasks", "")
		if err != nil {
			data = map[string]any{"error": err.Error(), "results": []any{}}
		}
		e.writeJSON(w, http.StatusOK, data)
	})
	mux.HandleFunc("POST /api/checkin", func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Region string `json:"region"`
			DryRun bool   `json:"dry_run"`
			UID    string `json:"uid"`
		}
		_ = json.NewDecoder(io.LimitReader(r.Body, 64<<10)).Decode(&body)
		region := sanitizeRegion(body.Region, "all")
		data, err := e.checkinRun(region, body.DryRun, "checkin", body.UID)
		if err != nil {
			data = map[string]any{"error": err.Error(), "results": []any{}}
		}
		e.writeJSON(w, http.StatusOK, data)
	})
	mux.HandleFunc("POST /api/maintain", func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.Copy(io.Discard, io.LimitReader(r.Body, 64<<10))
		e.maintainNow()
		e.writeJSON(w, http.StatusOK, map[string]any{"ok": true})
	})
	mux.HandleFunc("POST /api/credits/refresh", func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.Copy(io.Discard, io.LimitReader(r.Body, 64<<10))
		e.writeJSON(w, http.StatusOK, e.refreshCreditsNow())
	})
	mux.HandleFunc("GET /api/credits/detail", func(w http.ResponseWriter, r *http.Request) {
		region := sanitizeRegion(r.URL.Query().Get("region"), "cn")
		e.writeJSON(w, http.StatusOK, e.creditDetail(region))
	})
	mux.HandleFunc("POST /api/credits/detail", func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.Copy(io.Discard, io.LimitReader(r.Body, 64<<10))
		region := sanitizeRegion(r.URL.Query().Get("region"), "cn")
		e.writeJSON(w, http.StatusOK, e.creditDetail(region))
	})
	mux.HandleFunc("POST /api/accounts/toggle", func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			UID    string `json:"uid"`
			Region string `json:"region"`
			Enable bool   `json:"enable"`
		}
		_ = json.NewDecoder(io.LimitReader(r.Body, 64<<10)).Decode(&body)
		region := sanitizeRegion(body.Region, "cn")
		pool := e.pools[region]
		if body.UID == "" || !pool.hasUID(body.UID) {
			e.writeJSON(w, http.StatusOK, map[string]any{"error": "uid not found"})
			return
		}
		if body.Enable {
			pool.reenable(body.UID)
		} else {
			pool.disable(body.UID, "manual disable (panel)")
		}
		e.writeJSON(w, http.StatusOK, map[string]any{"ok": true, "uid": body.UID, "disabled": !body.Enable})
	})
	mux.HandleFunc("POST /api/accounts/delete", func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			UID    string `json:"uid"`
			Region string `json:"region"`
		}
		_ = json.NewDecoder(io.LimitReader(r.Body, 64<<10)).Decode(&body)
		regions := []string{"cn", "global"}
		if body.Region == "cn" || body.Region == "global" {
			regions = []string{body.Region}
		}
		removed := ""
		for _, rg := range regions {
			a := e.pools[rg].authByUID(body.UID)
			if a != nil && a.FilePath != "" {
				if err := os.Remove(a.FilePath); err == nil {
					removed = a.FilePath
				}
			}
		}
		if removed != "" {
			e.rescan()
			e.writeJSON(w, http.StatusOK, map[string]any{"ok": true, "uid": body.UID, "deleted": true})
			return
		}
		e.writeJSON(w, http.StatusOK, map[string]any{"error": "auth file not found for uid " + body.UID})
	})
	mux.HandleFunc("POST /api/login/cn/sendcode", func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Phone string `json:"phone"`
		}
		_ = json.NewDecoder(io.LimitReader(r.Body, 64<<10)).Decode(&body)
		if strings.TrimSpace(body.Phone) == "" {
			e.writeJSON(w, http.StatusOK, map[string]any{"error": "phone required"})
			return
		}
		if err := e.loginCNSendCode(strings.TrimSpace(body.Phone)); err != nil {
			e.writeJSON(w, http.StatusOK, map[string]any{"error": err.Error()})
			return
		}
		e.writeJSON(w, http.StatusOK, map[string]any{"ok": true, "msg": "验证码已发送"})
	})
	mux.HandleFunc("POST /api/login/cn", func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Phone string `json:"phone"`
			Code  string `json:"code"`
		}
		_ = json.NewDecoder(io.LimitReader(r.Body, 64<<10)).Decode(&body)
		e.writeJSON(w, http.StatusOK, e.loginCN(body.Phone, body.Code))
	})
	mux.HandleFunc("POST /api/login/global/import-desktop", func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.Copy(io.Discard, io.LimitReader(r.Body, 64<<10))
		e.writeJSON(w, http.StatusOK, e.loginGlobalImportDesktop())
	})
	mux.HandleFunc("POST /api/login/global/oauth", func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			CallbackURL string `json:"callback_url"`
		}
		_ = json.NewDecoder(io.LimitReader(r.Body, 64<<10)).Decode(&body)
		e.writeJSON(w, http.StatusOK, e.loginGlobalOAuth(body.CallbackURL))
	})
	return mux
}

func sanitizeRegion(v, def string) string {
	switch v {
	case "cn", "global", "all":
		return v
	}
	return def
}

// ---- 杂项 ----

func regexpFinishReason() *regexp.Regexp {
	return regexp.MustCompile(`"finish_reason"\s*:\s*"(?:stop|length|tool_calls)"`)
}

func insecureTLS() *tls.Config {
	return &tls.Config{InsecureSkipVerify: true} //nolint:gosec // 沙箱自签证书，Python 版同款语义
}

func sortInts(s []int) { sort.Ints(s) }
