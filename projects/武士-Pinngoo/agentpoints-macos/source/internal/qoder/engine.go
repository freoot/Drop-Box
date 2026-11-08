package qoder

// Engine：Qoder（通义灵码同源 COSY 协议）上游的 Go 原生实现。
// PAT 凭证池 / jobToken 会话生命周期 / 动态模型目录 / chat 分流与
// 额度查询全部进程内运行。对外暴露 Handler（/v1/chat/completions、
// /v1/models、/status、/api/pat、/healthz），主网关经 qoderRoute 分流、
// /qoder/ 前缀挂载管理面。

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Config 引擎配置（主网关 config qoder 段）。
type Config struct {
	// AuthDir 凭证目录（qoder-*.json，内含 PAT）。
	AuthDir string
	// StateDir 状态目录（额度快照缓存）。
	StateDir string
	// MaxRotate 单请求最多换号次数。
	MaxRotate int
	// TimeoutSeconds 短 RPC 超时。
	TimeoutSeconds float64
	// MaxConcurrency 单 PAT 并发上限（超出本地排队，10605 防护）。
	MaxConcurrency int
}

// Engine 引擎实例。
type Engine struct {
	cfg      Config
	shortCLI *http.Client

	mu       sync.Mutex
	accounts []*Account
	status   map[string]*acctStatus // key: PAT 前 12 位 / dev:<uid>

	devMu   sync.Mutex
	devices map[string]*deviceSession // 待完成的设备授权会话（sid → session）

	catalogMu  sync.Mutex
	catalog    *ModelCatalog
	catalogAt  time.Time
	catalogErr time.Time

	modelsMu    sync.Mutex
	modelsCache []map[string]any
	modelsAt    time.Time
}

// acctStatus 池内状态（内存态，重启复位；签到 claim 幂等，复位后重签无害）。
type acctStatus struct {
	Disabled      bool      `json:"disabled"`
	Reason        string    `json:"reason,omitempty"`
	CooldownUntil time.Time `json:"cooldown_until,omitempty"`
	ErrStreak     int       `json:"err_streak,omitempty"`
	Quota         *quotaView `json:"quota,omitempty"`
	QuotaAt       time.Time `json:"-"`
	LastCheckin   string    `json:"last_checkin,omitempty"` // "2006-01-02 15:04:05"
	StreakDays    int64     `json:"streak_days,omitempty"`
	// CheckinStatus 上游「每日签到」活动状态原样留存（CLAIMABLE/CLAIMED/DISABLED/…）。
	// 有了它面板才能把「官方未开放」和「没签」区分开——两者都表现为 last_checkin 为空，
	// 早期只有 last_checkin 一个信号时，未开放账号会永远显示「未签」并拉低今日签到比例。
	CheckinStatus string `json:"checkin_status,omitempty"`
}

// quotaView 额度快照（面板展示用）。
type quotaView struct {
	PlanTotal      float64 `json:"plan_total"`
	PlanUsed       float64 `json:"plan_used"`
	PlanRemaining  float64 `json:"plan_remaining"`
	AddOnRemaining float64 `json:"addon_remaining,omitempty"`
	OrgRemaining   float64 `json:"org_remaining,omitempty"`
	Exceeded       bool    `json:"exceeded"`
	ResetAt        int64   `json:"reset_at,omitempty"`
	UserType       string  `json:"user_type,omitempty"`
	Plan           string  `json:"plan,omitempty"`
}

// ---- Account ----

// Account 单个凭证 + 会话生命周期。
//
// 两种凭证形态：
//   - PAT 账号（pt- 开头）：走 COSY 会话，可用于 chat；
//   - 设备授权账号（浏览器授权）：只有 openapi access_token，仅供签到/额度。
type Account struct {
	mu           sync.Mutex
	PAT          string
	Name         string
	MachineID    string
	MachineToken string
	MachineType  string
	FilePath     string

	// 设备授权凭证明细（PAT 账号为空）。
	AccessToken   string
	DeviceRefresh string
	deviceExpMs   int64

	sess          *sessionContext
	uid           string
	userType      string
	refreshToken  string
	securityOauth string
	expireTimeMs  int64
	refreshedAt   time.Time
	bootstrapped  bool
	refreshMu     sync.Mutex
	chatSlots     chan struct{}

	// 请求级累计（内存态，重启清零）。ok/fail 由 chatRequest 出口更新；
	// 在途直接取 len(chatSlots)（并发闸即在途），无需单独计数。
	statMu       sync.Mutex
	okTotal      int64
	failTotal    int64
	lastSuccess  time.Time
	// 账号级用量（内存态；面板「用量」列，口径与 workbuddy 池一致）。
	totalTokens   int64
	lastLatencyMs int64
	lastTPS       float64
	hasTPS        bool

	// openapi 明文 bearer（签到/额度用，独立于 COSY 会话）。
	bearerTok   string
	bearerExpMs int64
}

// NoteChatResult 请求级成功/失败累计（面板账号表「成功/失败」列）。
func (a *Account) NoteChatResult(ok bool) {
	a.statMu.Lock()
	defer a.statMu.Unlock()
	if ok {
		a.okTotal++
		a.lastSuccess = time.Now()
	} else {
		a.failTotal++
	}
}

// ChatStats 面板读取：成功/失败/在途/最近成功。
func (a *Account) ChatStats() (ok, fail int64, inflight int, last time.Time) {
	a.statMu.Lock()
	defer a.statMu.Unlock()
	if a.chatSlots != nil {
		inflight = len(a.chatSlots)
	}
	return a.okTotal, a.failTotal, inflight, a.lastSuccess
}

// NoteUsage 记录一次成功请求的 token 与延迟/吞吐（面板「用量」列）。
// total>0 才累计；completion<=0 时吞吐置空（前端显示 —）。
func (a *Account) NoteUsage(total, completion, latencyMs int64) {
	a.statMu.Lock()
	defer a.statMu.Unlock()
	if total > 0 {
		a.totalTokens += total
	}
	if latencyMs < 1 {
		latencyMs = 1
	}
	a.lastLatencyMs = latencyMs
	if completion > 0 {
		a.lastTPS = float64(completion) * 1000 / float64(latencyMs)
		a.hasTPS = true
	} else {
		a.hasTPS = false
	}
}

// UsageStats 面板读取：累计 token / 最近延迟 / 最近吞吐。
func (a *Account) UsageStats() (total, latencyMs int64, tps float64, hasTPS bool) {
	a.statMu.Lock()
	defer a.statMu.Unlock()
	return a.totalTokens, a.lastLatencyMs, a.lastTPS, a.hasTPS
}

func (a *Account) key() string {
	if a.PAT != "" {
		if len(a.PAT) >= 12 {
			return a.PAT[:12]
		}
		return a.PAT
	}
	if a.uid != "" {
		return "dev:" + a.uid
	}
	return "dev:" + a.AccessToken
}

// isDevice 是否为设备授权账号（无 PAT，仅供签到/额度）。
func (a *Account) isDevice() bool { return a.PAT == "" && a.AccessToken != "" }

func (a *Account) refreshTokenVal() string {
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.refreshToken
}

func (a *Account) securityOauthVal() string {
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.securityOauth
}

func (a *Account) needsRefresh() bool {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.sess == nil {
		return true
	}
	if a.expireTimeMs == 0 {
		return time.Since(a.refreshedAt) > 30*time.Minute
	}
	return time.Now().UnixMilli() > a.expireTimeMs-2*3600*1000
}

// save 凭证落盘（PAT 或 设备授权 token + machine 身份）。
func (a *Account) save() error {
	if a.FilePath == "" {
		return nil
	}
	a.mu.Lock()
	doc := map[string]string{
		"name":          a.Name,
		"machine_id":    a.MachineID,
		"machine_token": a.MachineToken,
		"machine_type":  a.MachineType,
		"uid":           a.uid,
	}
	for k, v := range map[string]string{
		"pat":           a.PAT,
		"access_token":  a.AccessToken,
		"refresh_token": a.DeviceRefresh,
	} {
		if v != "" {
			doc[k] = v
		}
	}
	if a.deviceExpMs > 0 {
		doc["expires_at"] = strconv.FormatInt(a.deviceExpMs, 10)
	}
	a.mu.Unlock()
	raw, err := marshalNoEscape(doc)
	if err != nil {
		return err
	}
	return os.WriteFile(a.FilePath, raw, 0o600)
}

// applyJobToken 由 jobToken 响应重建签名会话。
func (e *Engine) applyJobToken(a *Account, jt map[string]interface{}, userType string) {
	a.mu.Lock()
	defer a.mu.Unlock()
	name, _ := jt["name"].(string)
	id, _ := jt["id"].(string)
	if userType == "" {
		userType, _ = jt["userType"].(string)
	}
	if userType == "" {
		userType = "personal_standard"
	}
	securityOauth, _ := jt["securityOauthToken"].(string)
	refreshToken, _ := jt["refreshToken"].(string)
	ident := authIdentity{
		Name:               name,
		Aid:                id,
		UID:                id,
		UserType:           userType,
		SecurityOauthToken: securityOauth,
		RefreshToken:       refreshToken,
	}
	sess, err := newSession(ident, a.MachineID, a.MachineToken, a.MachineType)
	if err != nil {
		log.Printf("qoder %s: build session: %v", a.displayName(), err)
		return
	}
	a.sess = sess
	a.uid = id
	a.userType = userType
	a.refreshToken = refreshToken
	a.securityOauth = securityOauth
	a.expireTimeMs = toInt64(jt["expireTime"])
	a.refreshedAt = time.Now()
	a.bootstrapped = true
}

func (a *Account) displayName() string {
	if a.Name != "" {
		return a.Name
	}
	if len(a.PAT) > 10 {
		return a.PAT[:10] + "…"
	}
	return "qoder"
}

// refresh 续期（refreshToken 失败回落 PAT 重换）。
func (e *Engine) refresh(a *Account, force bool) error {
	a.refreshMu.Lock()
	defer a.refreshMu.Unlock()
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(e.cfg.TimeoutSeconds*float64(time.Second)))
	defer cancel()
	jt, err := refreshJobToken(ctx, e.shortCLI, a)
	if err != nil {
		if !force {
			return err
		}
		jt, err = exchangeJobToken(ctx, e.shortCLI, a)
		if err != nil {
			return err
		}
	}
	// userType 先于会话构造解析（签入 bearer 载荷，事后不可改）。
	ut, _ := a.muBootstrapUserType(jt)
	if ut == "" {
		if id := toString(jt["id"]); id != "" {
			if u, serr := fetchUserStatus(ctx, e.shortCLI, a, id); serr == nil && u != "" {
				ut = u
			}
		}
		if ut == "" {
			ut = a.cachedUserType()
		}
	}
	e.applyJobToken(a, jt, ut)
	return nil
}

// muBootstrapUserType 从 jobToken 响应取层级（可能缺失）。
func (a *Account) muBootstrapUserType(jt map[string]interface{}) (string, bool) {
	if ut, ok := jt["userType"].(string); ok && ut != "" {
		return ut, true
	}
	return "", false
}

func (a *Account) cachedUserType() string {
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.userType
}

// ensureFreshSession 会话保活（bootstrap / 主动续期）。
func (e *Engine) ensureFreshSession(a *Account) error {
	if a.bootstrapped && !a.needsRefresh() {
		return nil
	}
	a.refreshMu.Lock()
	defer a.refreshMu.Unlock()
	if a.bootstrapped && !a.needsRefresh() {
		return nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(e.cfg.TimeoutSeconds*float64(time.Second)))
	defer cancel()
	jt, err := exchangeJobToken(ctx, e.shortCLI, a)
	if err != nil {
		return err
	}
	ut := ""
	if id := toString(jt["id"]); id != "" {
		if u, serr := fetchUserStatus(ctx, e.shortCLI, a, id); serr == nil {
			ut = u
		}
	}
	e.applyJobToken(a, jt, ut)
	return nil
}

// forceRefresh 凭证被拒后的自救（refreshToken → PAT 兜底）。
func (e *Engine) forceRefresh(a *Account) error { return e.refresh(a, true) }

// ---- 模型目录 ----

// ModelCaps 单模型能力。
type ModelCaps struct {
	IsReasoning     bool
	MaxOutputTokens int
}

// ModelCatalog 模型目录。
type ModelCatalog struct {
	ModelMap     map[string]string
	VisionModels map[string]bool
	Caps         map[string]*ModelCaps
	DefaultName  string
}

const defaultMaxOutputTokens = 32000
const preferredDefaultKey = "qmodel_latest"

// DefaultModelMap 兜底目录（catalog-v7）。
var DefaultModelMap = map[string]string{
	"Qwen3.8-Max":       "qmodel_38max",
	"Qwen3.8-Flash":     "qfmodel",
	"Qwen3.7-Max":       "qmodel_latest",
	"Qwen3.7-Plus":      "qmodel",
	"Qwen3.7-Flash":     "q37fmodel",
	"DeepSeek-V4-Pro":   "dmodel",
	"DeepSeek-Flash":    "dfmodel",
	"GLM-5.3":           "gmodel",
	"GLM-5.3-Flash":     "gfmodel",
	"GLM-5.2":           "gm51model",
	"Kimi-K3":           "kmodel_latest",
	"Kimi-K2.8-Preview": "kmodel",
	"MiniMax-M2.7":      "mmodel",
}

func defaultCatalog() *ModelCatalog {
	mm := map[string]string{}
	for k, v := range DefaultModelMap {
		mm[k] = v
	}
	return &ModelCatalog{ModelMap: mm, VisionModels: map[string]bool{}, Caps: map[string]*ModelCaps{},
		DefaultName: nameForKey(mm, preferredDefaultKey)}
}

func nameForKey(modelMap map[string]string, key string) string {
	for name, k := range modelMap {
		if k == key {
			return name
		}
	}
	keys := make([]string, 0, len(modelMap))
	for k := range modelMap {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, want := range []string{"flash", "lite", "plus"} {
		for _, k := range keys {
			if strings.Contains(strings.ToLower(k), want) {
				return k
			}
		}
	}
	if len(keys) > 0 {
		return keys[0]
	}
	return ""
}

func reasoningCapability(m map[string]interface{}) bool {
	if tc, ok := m["thinking_config"]; ok {
		if tcMap, isMap := tc.(map[string]interface{}); isMap {
			enabled, present := tcMap["enabled"]
			return present && enabled != nil
		}
		if tc != nil {
			return true
		}
	}
	if v, present := m["is_reasoning"]; present {
		return enableFlag(v)
	}
	return true
}

func enableFlag(v interface{}) bool {
	switch x := v.(type) {
	case bool:
		return x
	case string:
		return !(x == "false" || x == "0" || x == "False" || x == "FALSE")
	case float64:
		return x != 0
	case nil:
		return true
	}
	return true
}

func positiveInt(v interface{}) (int, bool) {
	switch x := v.(type) {
	case float64:
		if n := int(x); float64(n) == x && n > 0 {
			return n, true
		}
	case string:
		var n int
		if _, err := fmt.Sscanf(strings.TrimSpace(x), "%d", &n); err == nil && n > 0 {
			return n, true
		}
	}
	return 0, false
}

// extractCatalog 解析 model/list 响应（chat scene）。
func extractCatalog(raw map[string]interface{}) *ModelCatalog {
	if raw == nil {
		return nil
	}
	sceneRaw, ok := raw["chat"]
	if !ok {
		return nil
	}
	sceneList, ok := sceneRaw.([]interface{})
	if !ok {
		return nil
	}
	modelMap := map[string]string{}
	vision := map[string]bool{}
	caps := map[string]*ModelCaps{}
	for _, item := range sceneList {
		m, ok := item.(map[string]interface{})
		if !ok {
			continue
		}
		if enableVal, has := m["enable"]; has && !enableFlag(enableVal) {
			continue
		}
		key, _ := m["key"].(string)
		name, _ := m["display_name"].(string)
		if key == "" || name == "" || key == "auto" {
			continue
		}
		modelMap[name] = key
		if isVL, ok := m["is_vl"].(bool); ok && isVL {
			vision[name] = true
		}
		maxOut, ok := positiveInt(m["max_output_tokens"])
		if !ok {
			maxOut = defaultMaxOutputTokens
		}
		caps[key] = &ModelCaps{IsReasoning: reasoningCapability(m), MaxOutputTokens: maxOut}
	}
	if len(modelMap) == 0 {
		return nil
	}
	return &ModelCatalog{ModelMap: modelMap, VisionModels: vision, Caps: caps,
		DefaultName: nameForKey(modelMap, preferredDefaultKey)}
}

func (c *ModelCatalog) maxOutputTokens(key string) int {
	if caps, ok := c.Caps[key]; ok && caps.MaxOutputTokens > 0 {
		return caps.MaxOutputTokens
	}
	return defaultMaxOutputTokens
}

func (c *ModelCatalog) reasoningDefault(key string) bool {
	if caps, ok := c.Caps[key]; ok {
		return caps.IsReasoning
	}
	return true
}

func (c *ModelCatalog) keys() []string {
	keys := make([]string, 0, len(c.ModelMap))
	for k := range c.ModelMap {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}

// resolveModel 显示名 → (display, qoder key)。精确命中优先；未命中时大小写
// 不敏感兜底（跨池轮询会以裸名/小写形式路由进来，如 glm-5.3-flash → GLM-5.3-Flash）。
func (c *ModelCatalog) resolveModel(model string) (string, string, error) {
	if model != "" {
		if key := c.ModelMap[model]; key != "" {
			return model, key, nil
		}
		for name, key := range c.ModelMap {
			if strings.EqualFold(name, model) {
				return name, key, nil
			}
		}
		return "", "", fmt.Errorf("Unsupported model '%s'. Supported: %s", model, strings.Join(c.keys(), ", "))
	}
	name := c.DefaultName
	if name == "" {
		for k := range c.ModelMap {
			name = k
			break
		}
	}
	return name, c.ModelMap[name], nil
}

// getCatalog 目录获取（10min TTL + 单飞 + 兜底）。
func (e *Engine) getCatalog(ctx context.Context) *ModelCatalog {
	e.catalogMu.Lock()
	if e.catalog != nil && time.Since(e.catalogAt) < 10*time.Minute {
		cat := e.catalog
		e.catalogMu.Unlock()
		return cat
	}
	e.catalogMu.Unlock()

	var fetched *ModelCatalog
	accounts := e.chatAccounts()
	if len(accounts) > 0 {
		a := accounts[0]
		if err := e.ensureFreshSession(a); err == nil {
			a.mu.Lock()
			sess := a.sess
			a.mu.Unlock()
			raw, err := fetchModelCatalog(ctx, e.shortCLI, sess)
			if err == nil {
				fetched = extractCatalog(raw)
			} else {
				log.Printf("qoder model/list: %v (fallback)", err)
			}
		} else {
			log.Printf("qoder model/list session: %v (fallback)", err)
		}
	}
	cat := fetched
	if cat == nil {
		cat = defaultCatalog()
	}
	e.catalogMu.Lock()
	e.catalog = cat
	e.catalogAt = time.Now()
	e.catalogMu.Unlock()
	return cat
}

// ---- 引擎 ----

// NewEngine 构造引擎（加载凭证目录）。
func NewEngine(cfg Config) *Engine {
	if cfg.MaxRotate <= 0 {
		cfg.MaxRotate = 3
	}
	if cfg.TimeoutSeconds <= 0 {
		cfg.TimeoutSeconds = 30
	}
	if cfg.MaxConcurrency <= 0 {
		cfg.MaxConcurrency = 1
	}
	e := &Engine{
		cfg:      cfg,
		shortCLI: newHTTPClient(time.Duration(cfg.TimeoutSeconds * float64(time.Second))),
		status:   map[string]*acctStatus{},
		devices:  map[string]*deviceSession{},
	}
	e.rescan()
	go e.maintainNow() // 启动即拉一次会话/额度（异步，不阻塞监听）
	go e.maintainLoop()
	return e
}

func (e *Engine) rescan() {
	entries, err := os.ReadDir(e.cfg.AuthDir)
	if err != nil {
		return
	}
	// 复用上一代的同文件实例：Account 上挂着会话状态（bootstrapped / uid / jobToken /
	// 设备授权过期时间）。若 rescan 一律新建对象，「落盘 → rescan → 引导」这条路径
	// （导入 PAT、设备授权收尾）就会把引导结果写进一个已不在池里的孤儿对象——表现为
	// 刚导入的账号一直停在「引导中」、uid 为空，要等下一轮 maintain 才自愈。
	prev := map[string]*Account{}
	e.mu.Lock()
	for _, a := range e.accounts {
		if b := filepath.Base(a.FilePath); b != "" {
			prev[b] = a
		}
	}
	e.mu.Unlock()

	loaded := []*Account{}
	for _, ent := range entries {
		if ent.IsDir() || !strings.HasPrefix(ent.Name(), "qoder-") || !strings.HasSuffix(ent.Name(), ".json") {
			continue
		}
		fp := filepath.Join(e.cfg.AuthDir, ent.Name())
		raw, err := os.ReadFile(fp)
		if err != nil {
			continue
		}
		var doc map[string]string
		if json.Unmarshal(raw, &doc) != nil {
			continue
		}
		pat := strings.TrimSpace(doc["pat"])
		access := strings.TrimSpace(doc["access_token"])
		if pat == "" && access == "" {
			continue
		}
		acc := &Account{
			PAT:           pat,
			AccessToken:   access,
			DeviceRefresh: strings.TrimSpace(doc["refresh_token"]),
			Name:          doc["name"],
			MachineID:     doc["machine_id"],
			MachineToken:  doc["machine_token"],
			MachineType:   doc["machine_type"],
			FilePath:      fp,
			chatSlots:     make(chan struct{}, e.cfg.MaxConcurrency),
		}
		if acc.MachineID == "" {
			acc.MachineID = newUUID()
		}
		if acc.MachineToken == "" {
			acc.MachineToken = strings.ReplaceAll(newUUID()+newUUID(), "-", "")
			if len(acc.MachineToken) > 50 {
				acc.MachineToken = acc.MachineToken[:50]
			}
		}
		if acc.MachineType == "" {
			acc.MachineType = newUUID()[:18]
		}
		acc.uid = strings.TrimSpace(doc["uid"])
		if v := strings.TrimSpace(doc["expires_at"]); v != "" {
			if n, err := strconv.ParseInt(v, 10, 64); err == nil {
				acc.deviceExpMs = n
			}
		}
		// 同一文件、同一凭证 ⇒ 沿用旧实例（保住内存里的会话状态）；
		// 凭证变了（换号/重新授权）则用新对象，避免继承过期会话。
		if old, ok := prev[ent.Name()]; ok {
			old.mu.Lock()
			same := old.PAT == acc.PAT && old.AccessToken == acc.AccessToken
			if same {
				old.Name = acc.Name
				old.MachineID = acc.MachineID
				old.MachineToken = acc.MachineToken
				old.MachineType = acc.MachineType
				if old.uid == "" {
					old.uid = acc.uid
				}
				if old.deviceExpMs == 0 {
					old.deviceExpMs = acc.deviceExpMs
				}
				if old.DeviceRefresh == "" {
					old.DeviceRefresh = acc.DeviceRefresh
				}
			}
			old.mu.Unlock()
			if same {
				loaded = append(loaded, old)
				continue
			}
		}
		loaded = append(loaded, acc)
	}
	e.mu.Lock()
	e.accounts = loaded
	e.mu.Unlock()
}

// findByPAT 取回池内与 PAT 对应的实例（rescan 之后确保操作对象仍在池中）。
func (e *Engine) findByPAT(pat string) *Account {
	for _, a := range e.allAccounts() {
		if a.PAT != "" && a.PAT == pat {
			return a
		}
	}
	return nil
}

// findByUID 取回池内与 uid 对应的实例（设备授权收尾用）。
func (e *Engine) findByUID(uid string) *Account {
	for _, a := range e.allAccounts() {
		if a.uid != "" && a.uid == uid {
			return a
		}
	}
	return nil
}

func (e *Engine) allAccounts() []*Account {
	e.mu.Lock()
	defer e.mu.Unlock()
	out := make([]*Account, len(e.accounts))
	copy(out, e.accounts)
	return out
}

func (e *Engine) healthyAccounts() []*Account {
	out := []*Account{}
	now := time.Now()
	for _, a := range e.allAccounts() {
		st := e.st(a.key())
		if st.Disabled || now.Before(st.CooldownUntil) {
			continue
		}
		out = append(out, a)
	}
	return out
}

// chatAccounts 可参与 chat 的账号（必须有 PAT）。
// 设备授权账号只有 openapi token，走不了 COSY 会话，只供签到/额度。
func (e *Engine) chatAccounts() []*Account {
	out := []*Account{}
	now := time.Now()
	for _, a := range e.allAccounts() {
		if a.PAT == "" {
			continue
		}
		st := e.st(a.key())
		if st.Disabled || now.Before(st.CooldownUntil) {
			continue
		}
		out = append(out, a)
	}
	return out
}

// ChatHealthy 是否有可参与 chat 的账号。
func (e *Engine) ChatHealthy() bool { return len(e.chatAccounts()) > 0 }

func (e *Engine) st(key string) *acctStatus {
	e.mu.Lock()
	defer e.mu.Unlock()
	s, ok := e.status[key]
	if !ok {
		s = &acctStatus{}
		e.status[key] = s
	}
	return s
}

// Healthy 是否有可用账号。
func (e *Engine) Healthy() bool { return len(e.healthyAccounts()) > 0 }

func (e *Engine) maintainLoop() {
	for {
		time.Sleep(10 * time.Minute)
		func() {
			defer func() { _ = recover() }()
			e.maintainNow()
		}()
	}
}

// maintainNow 重扫凭证 + 会话保活 + 额度刷新 + 每日签到（本地按天去重）。
func (e *Engine) maintainNow() {
	e.rescan()
	for _, a := range e.allAccounts() {
		if a.PAT == "" {
			// 设备授权账号：没有 COSY 会话，只需刷新额度快照。
			e.refreshQuota(a)
			continue
		}
		if err := e.ensureFreshSession(a); err != nil {
			if ae, ok := err.(*AuthError); ok {
				log.Printf("qoder maintain %s: PAT rejected (HTTP %d)", a.displayName(), ae.StatusCode)
				continue
			}
			log.Printf("qoder maintain %s: %v", a.displayName(), err)
		}
		e.refreshQuota(a)
	}
	// 每日签到：maintain 10 分钟一轮，CheckinOne 内部按天去重，未到新周期零请求。
	go func() {
		defer func() { _ = recover() }()
		e.CheckinAll()
	}()
}

// refreshQuota 额度快照刷新（OpenAPI 权威口径）。
func (e *Engine) refreshQuota(a *Account) {
	// COSY 会话的 securityOauthToken 优先；设备授权账号直接用 access_token
	// （两者都是 openapi 明文 Bearer，同一鉴权口径）。
	bearer := a.securityOauthVal()
	if bearer == "" {
		a.mu.Lock()
		bearer = a.AccessToken
		a.mu.Unlock()
	}
	if bearer == "" {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	raw, err := fetchQuotaUsage(ctx, e.shortCLI, bearer)
	if err != nil {
		return
	}
	q := &quotaView{Exceeded: false}
	if uq, ok := raw["userQuota"].(map[string]interface{}); ok {
		q.PlanTotal = toFloat(uq["total"])
		q.PlanUsed = toFloat(uq["used"])
		q.PlanRemaining = toFloat(uq["remaining"])
	}
	if aq, ok := raw["addOnQuota"].(map[string]interface{}); ok {
		q.AddOnRemaining = toFloat(aq["remaining"])
	}
	if oq, ok := raw["orgResourcePackage"].(map[string]interface{}); ok {
		avail, _ := oq["available"].(bool)
		if avail {
			q.OrgRemaining = toFloat(oq["remaining"])
		}
	}
	q.Exceeded, _ = raw["isQuotaExceeded"].(bool)
	if exp := toInt64(raw["expiresAt"]); exp > 0 && exp < 4102444800000 {
		q.ResetAt = exp
	}
	if ut, ok := raw["userType"].(string); ok {
		q.UserType = ut
	}
	st := e.st(a.key())
	st.Quota = q
	st.QuotaAt = time.Now()
}

// ---- 模型面 ----

// Models /v1/models 条目（1h 缓存 + 兜底）。
func (e *Engine) Models() []map[string]any {
	e.modelsMu.Lock()
	if len(e.modelsCache) > 0 && time.Since(e.modelsAt) < time.Hour {
		out := e.modelsCache
		e.modelsMu.Unlock()
		return out
	}
	e.modelsMu.Unlock()
	cat := e.getCatalog(context.Background())
	out := []map[string]any{}
	for _, name := range cat.keys() {
		out = append(out, map[string]any{
			"id":             name,
			"object":         "model",
			"created":        1787000000,
			"owned_by":       "qoder",
			"context_length": 128000,
			"description":    "qoder",
		})
	}
	if len(out) > 0 {
		e.modelsMu.Lock()
		e.modelsCache = out
		e.modelsAt = time.Now()
		e.modelsMu.Unlock()
	}
	return out
}

// KnownSet 已知模型集合。
func (e *Engine) KnownSet() map[string]bool {
	set := map[string]bool{}
	for _, m := range e.Models() {
		if id, _ := m["id"].(string); id != "" {
			set[id] = true
			set[strings.ToLower(id)] = true
		}
	}
	for name := range DefaultModelMap {
		set[name] = true
		set[strings.ToLower(name)] = true
	}
	return set
}

// KnownModel 模型名判定（精确/小写）。
func (e *Engine) KnownModel(model string) bool {
	set := e.KnownSet()
	return set[model] || set[strings.ToLower(model)]
}
