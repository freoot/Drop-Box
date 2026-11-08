// Package server 暴露 OpenAI 兼容 HTTP 接口，内部驱动 pool 挑号 + upstream 转发。
package server

import (
	"crypto/subtle"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/linguo2625469/workbuddy2api-panel/internal/relaymetrics"
	"github.com/linguo2625469/workbuddy2api-panel/internal/trae/pool"
	"github.com/linguo2625469/workbuddy2api-panel/internal/trae/upstream"
)

// Config handler 依赖。
type Config struct {
	Pool         *pool.Pool
	Upstream     *upstream.Client
	APIKey       string        // 空 = 不鉴权
	AuthDir      string        // auths/ 目录，用于 import/delete 落盘 trae-*.json
	MaxRotate    int           // 单请求最多换号次数，默认 3
	PlanCooldown time.Duration // 1005 冷却，默认 12h
	SoftCooldown time.Duration // 429 冷却，默认 60s
	ErrThreshold int           // 连续错误阈值，默认 3
	ErrCooldown  time.Duration // 错误冷却，默认 10m
	RefreshSkew  time.Duration // token 预刷新窗口，默认 24h
	DefaultModel string        // 默认 glm-5.2

	// Sched 调度器桥接（可选，由 scheduler.Scheduler 实现）：
	// 挂 /admin/api/schedule* 三个接口，供主面板展示排程与手动触发。
	Sched SchedulerBridge

	// UsageFile trae 用量记录落盘路径（如 data/trae-usage.json）；空 = 不记录。
	UsageFile string
}

// SchedulerBridge trae 定时任务桥接（解耦 scheduler 包，避免测试需要真实调度器）。
type SchedulerBridge interface {
	Status() map[string]any
	RunCheckinNow()
	RunRefreshNow()
}

// maxBodyBytes 请求体大小上限（8MB），超过返回 413。
const maxBodyBytes = 8 << 20

// Handler 主路由。
type Handler struct {
	cfg Config
	mux *http.ServeMux
	// usage trae 请求用量记录（nil = 未启用，不记录）。
	usage *usageStore

	// Web 登录 pending 态：pendingID → 登录进行中的临时上下文。
	// 回调 /authorize 捕获后标记成功；面板轮询 result 取结果。
	loginMu sync.Mutex
	logins  map[string]*pendingLogin
}

// NewHandler 构建 handler。
func NewHandler(cfg Config) *Handler {
	if cfg.MaxRotate <= 0 {
		cfg.MaxRotate = 3
	}
	if cfg.PlanCooldown <= 0 {
		cfg.PlanCooldown = 12 * time.Hour
	}
	if cfg.SoftCooldown <= 0 {
		cfg.SoftCooldown = 60 * time.Second
	}
	if cfg.ErrThreshold <= 0 {
		cfg.ErrThreshold = 3
	}
	if cfg.ErrCooldown <= 0 {
		cfg.ErrCooldown = 10 * time.Minute
	}
	if cfg.RefreshSkew <= 0 {
		cfg.RefreshSkew = 24 * time.Hour
	}
	if cfg.DefaultModel == "" {
		cfg.DefaultModel = upstream.DefaultConfigName
	}
	h := &Handler{cfg: cfg, mux: http.NewServeMux(), logins: map[string]*pendingLogin{}}
	h.usage = NewUsageStore(cfg.UsageFile)
	h.mux.HandleFunc("POST /v1/chat/completions", h.withAuth(h.chatCompletions))
	h.mux.HandleFunc("GET /v1/models", h.withAuth(h.models))
	h.mux.HandleFunc("GET /status", h.withAuth(h.status))
	h.mux.HandleFunc("GET /healthz", h.healthz)
	// 管理面板：本地面板
	// 读接口无鉴权（局域网内只读）；写接口（accounts 写/login/refresh/authorize）
	// 经 withAdminAuth 校验 Bearer = TW2A_API_KEY（见 §4 安全设计）。
	h.mux.HandleFunc("GET /admin", h.adminPage)
	h.mux.HandleFunc("GET /admin/api/credits", h.adminCredits)
	// 账号 CRUD
	h.mux.HandleFunc("GET /admin/api/accounts", h.adminAccounts)
	h.mux.HandleFunc("POST /admin/api/accounts/import", h.withAdminAuth(h.adminImportAccount))
	h.mux.HandleFunc("DELETE /admin/api/accounts/{uid}", h.withAdminAuth(h.adminDeleteAccount))
	h.mux.HandleFunc("PATCH /admin/api/accounts/{uid}", h.withAdminAuth(h.adminPatchAccount))
	h.mux.HandleFunc("POST /admin/api/accounts/{uid}/refresh", h.withAdminAuth(h.adminRefreshAccount))
	h.mux.HandleFunc("GET /admin/api/accounts/{uid}/json", h.adminAccountJSON)
	// Web 登录闭环
	h.mux.HandleFunc("POST /admin/api/login", h.withAdminAuth(h.adminLoginStart))
	h.mux.HandleFunc("GET /admin/api/login/result", h.adminLoginResult)
	h.mux.HandleFunc("POST /admin/api/login/cancel", h.withAdminAuth(h.adminLoginCancel))
	// TRAE 回调落点（/authorize）：无需 Bearer（TRAE 浏览器 302 不带 key），
	// 仅捕获 query 写 pending 队列，不直接落盘 token。
	h.mux.HandleFunc("GET /authorize", h.authorizeCallback)
	// 定时任务（签到 / Token 刷新）：装配了调度器才挂载
	if cfg.Sched != nil {
		h.mux.HandleFunc("GET /admin/api/schedule", h.adminSchedule)
		h.mux.HandleFunc("POST /admin/api/schedule/checkin", h.withAdminAuth(h.adminScheduleCheckin))
		h.mux.HandleFunc("POST /admin/api/schedule/refresh", h.withAdminAuth(h.adminScheduleRefresh))
	}
	// 用量记录查询（面板「用量」页 Trae 区块数据源）
	h.mux.HandleFunc("GET /admin/api/usage", h.adminUsage)
	return h
}

// withAdminAuth 校验写操作的 Bearer API Key（常量时间比较，复用 withAuth 逻辑）。
// APIKey 为空时（未配置 TW2A_API_KEY）退化为不鉴权——本地无 key 场景仍可用，
// 但生产强烈建议配 key（见 PLAN §4）。
func (h *Handler) withAdminAuth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if h.cfg.APIKey == "" {
			next(w, r)
			return
		}
		authz := r.Header.Get("Authorization")
		const prefix = "Bearer "
		if len(authz) < len(prefix) || !strings.EqualFold(authz[:len(prefix)], prefix) {
			writeOpenAIError(w, http.StatusUnauthorized, "invalid_api_key", "missing or invalid API key")
			return
		}
		key := authz[len(prefix):]
		if subtle.ConstantTimeCompare([]byte(key), []byte(h.cfg.APIKey)) != 1 {
			writeOpenAIError(w, http.StatusUnauthorized, "invalid_api_key", "missing or invalid API key")
			return
		}
		next(w, r)
	}
}

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	h.mux.ServeHTTP(w, r)
}

func (h *Handler) withAuth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if h.cfg.APIKey != "" {
			authz := r.Header.Get("Authorization")
			const prefix = "Bearer "
			if len(authz) < len(prefix) || !strings.EqualFold(authz[:len(prefix)], prefix) {
				writeOpenAIError(w, http.StatusUnauthorized, "invalid_api_key", "missing or invalid API key")
				return
			}
			key := authz[len(prefix):]
			// 常量时间比较，防时序攻击（本地代理但按规范）。
			if subtle.ConstantTimeCompare([]byte(key), []byte(h.cfg.APIKey)) != 1 {
				writeOpenAIError(w, http.StatusUnauthorized, "invalid_api_key", "missing or invalid API key")
				return
			}
		}
		next(w, r)
	}
}

func (h *Handler) healthz(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte("ok"))
}

func (h *Handler) status(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"accounts": h.cfg.Pool.List(),
	})
}

// ---------------------------------------------------------------------------
// 模型映射
// ---------------------------------------------------------------------------

// mapModel 将客户端传入的 model 映射为 config_name（SPEC §4.5）：
//
//	"glm-5.2"（config_name）        → 直接转发
//	"glm-5.2__dev"（内部名）        → 去掉后缀映射回 config_name
//	"auto" / ""                     → 默认模型
//	其他未知                        → 400
func (h *Handler) mapModel(model string) (string, error) {
	model = strings.TrimSpace(model)
	if model == "" || model == "auto" {
		return h.cfg.DefaultModel, nil
	}
	// 去掉内部名后缀（__dev / __max 等）
	base := model
	if i := strings.Index(model, "__"); i >= 0 {
		base = model[:i]
	}
	// 大小写不敏感归一到目录精确 config_name（对外统一小写后入站均为小写，
	// 而 Doubao-Seed-2.1-Turbo 等上游名带大写，须在这里还原）。
	if id := h.canonicalModel(base); id != "" {
		return id, nil
	}
	// 宽松匹配：下划线 → 横线，大小写不敏感（deepseek_v4_pro → DeepSeek-V4-Pro）
	norm := normalizeModelName(base)
	if id := h.canonicalModel(norm); id != "" {
		return id, nil
	}
	return "", fmt.Errorf("unknown model %q", model)
}

// normalizeModelName 将下划线命名的内部名归一化为 config_name 风格（横线分隔）。
func normalizeModelName(s string) string {
	parts := strings.Split(s, "_")
	for i, p := range parts {
		if p == "" {
			continue
		}
		parts[i] = strings.ToUpper(p[:1]) + strings.ToLower(p[1:])
	}
	return strings.Join(parts, "-")
}

// knownModel 判断 model 是否在动态/静态模型表中（大小写不敏感）。
func (h *Handler) knownModel(model string) bool {
	return h.canonicalModel(model) != ""
}

// canonicalModel 把 model 大小写不敏感地归一到目录精确 config_name；
// 未命中返回 ""。
func (h *Handler) canonicalModel(model string) string {
	for _, m := range h.modelList() {
		if id, _ := m["id"].(string); id == model {
			return id
		}
	}
	for _, m := range h.modelList() {
		if id, _ := m["id"].(string); strings.EqualFold(id, model) {
			return id
		}
	}
	return ""
}

// 静态 SOLO 模型表（SPEC P3：32 个 config_name，来自逆向报告；动态拉取失败时回退）。
var staticModels = []map[string]any{
	{"id": "Doubao-Seed-2.1-Pro", "object": "model", "created": 1753600000, "owned_by": "trae-solo", "context_length": 131072},
	{"id": "seed-code-pro-0430", "object": "model", "created": 1753600000, "owned_by": "trae-solo", "context_length": 131072},
	{"id": "Doubao-Seed-2.1-Turbo", "object": "model", "created": 1753600000, "owned_by": "trae-solo", "context_length": 131072},
	{"id": "Doubao-Seed-2.0-Code", "object": "model", "created": 1753600000, "owned_by": "trae-solo", "context_length": 131072},
	{"id": "DeepSeek-V4-Flash-Official", "object": "model", "created": 1753600000, "owned_by": "trae-solo", "context_length": 131072},
	{"id": "browser_use_subagent", "object": "model", "created": 1753600000, "owned_by": "trae-solo", "context_length": 131072},
	{"id": "glm-5.2", "object": "model", "created": 1753600000, "owned_by": "trae-solo", "context_length": 131072},
	{"id": "glm-5-turbo", "object": "model", "created": 1753600000, "owned_by": "trae-solo", "context_length": 131072},
	{"id": "glm-5", "object": "model", "created": 1753600000, "owned_by": "trae-solo", "context_length": 131072},
	{"id": "DeepSeek-V4-Pro", "object": "model", "created": 1753600000, "owned_by": "trae-solo", "context_length": 131072},
	{"id": "DeepSeek-V4-Flash", "object": "model", "created": 1753600000, "owned_by": "trae-solo", "context_length": 131072},
	{"id": "kimi-k3", "object": "model", "created": 1753600000, "owned_by": "trae-solo", "context_length": 131072},
	{"id": "kimi-k2.7-code", "object": "model", "created": 1753600000, "owned_by": "trae-solo", "context_length": 131072},
	{"id": "kimi-k2.6", "object": "model", "created": 1753600000, "owned_by": "trae-solo", "context_length": 131072},
	{"id": "minimax-m3", "object": "model", "created": 1753600000, "owned_by": "trae-solo", "context_length": 131072},
	{"id": "qwen-3.7-plus", "object": "model", "created": 1753600000, "owned_by": "trae-solo", "context_length": 131072},
	{"id": "sagitta", "object": "model", "created": 1753600000, "owned_by": "trae-solo", "context_length": 131072},
	{"id": "aquila", "object": "model", "created": 1753600000, "owned_by": "trae-solo", "context_length": 131072},
	{"id": "custom_model_gemini", "object": "model", "created": 1753600000, "owned_by": "trae-solo", "context_length": 131072},
	{"id": "custom_model_placeholder", "object": "model", "created": 1753600000, "owned_by": "trae-solo", "context_length": 131072},
	{"id": "custom_model_1M_text", "object": "model", "created": 1753600000, "owned_by": "trae-solo", "context_length": 131072},
	{"id": "custom_model_1M", "object": "model", "created": 1753600000, "owned_by": "trae-solo", "context_length": 131072},
	{"id": "custom_model_kimi", "object": "model", "created": 1753600000, "owned_by": "trae-solo", "context_length": 131072},
	{"id": "custom_model_claude", "object": "model", "created": 1753600000, "owned_by": "trae-solo", "context_length": 131072},
	{"id": "custom_model_gpt-5", "object": "model", "created": 1753600000, "owned_by": "trae-solo", "context_length": 131072},
	{"id": "custom_model_no-fc", "object": "model", "created": 1753600000, "owned_by": "trae-solo", "context_length": 131072},
	{"id": "custom_model_deepseek_chat", "object": "model", "created": 1753600000, "owned_by": "trae-solo", "context_length": 131072},
	{"id": "custom_model_deepseek_reasoner", "object": "model", "created": 1753600000, "owned_by": "trae-solo", "context_length": 131072},
	{"id": "custom_model_deepseek_v4", "object": "model", "created": 1753600000, "owned_by": "trae-solo", "context_length": 131072},
	{"id": "explore_sub_agent_v13", "object": "model", "created": 1753600000, "owned_by": "trae-solo", "context_length": 131072},
	{"id": "explore_sub_agent_v2", "object": "model", "created": 1753600000, "owned_by": "trae-solo", "context_length": 131072},
	{"id": "summary", "object": "model", "created": 1753600000, "owned_by": "trae-solo", "context_length": 131072},
}

// dynamicModelsCache 动态模型缓存（成功 1h / 失败负缓存 5min）。
var dynamicModelsCache struct {
	sync.RWMutex
	ids      []upstream.ModelInfo
	fetched  time.Time
	lastFail time.Time
}

const (
	dynamicModelsTTL        = time.Hour
	modelsFetchFailCooldown = 5 * time.Minute
)

func (h *Handler) models(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"object": "list",
		"data":   h.modelList(),
	})
}

// modelList 动态获取模型列表并包装成 OpenAI 格式；失败回退静态表。
func (h *Handler) modelList() []map[string]any {
	if infos := h.fetchDynamicModels(); len(infos) > 0 {
		out := make([]map[string]any, 0, len(infos))
		for _, mi := range infos {
			entry := map[string]any{
				"id":             mi.ID,
				"object":         "model",
				"created":        1753600000,
				"owned_by":       "trae-solo",
				"context_length": mi.ContextWindow,
			}
			if mi.Name != "" {
				entry["name"] = mi.Name
			}
			// 上游不下发上下文长度时兜底 128K（any(int64) 与字面量 0 直接 == 永不相等，
			// 动态类型 int64 ≠ int，必须断言后比较）
			if v, _ := entry["context_length"].(int64); v == 0 {
				entry["context_length"] = int64(131072)
			}
			out = append(out, entry)
		}
		return out
	}
	return staticModels
}

// fetchDynamicModels 从池中任一健康账号拉模型列表（get_detail_param），缓存 1h。
func (h *Handler) fetchDynamicModels() []upstream.ModelInfo {
	dynamicModelsCache.RLock()
	if len(dynamicModelsCache.ids) > 0 && time.Since(dynamicModelsCache.fetched) < dynamicModelsTTL {
		out := dynamicModelsCache.ids
		dynamicModelsCache.RUnlock()
		return out
	}
	if !dynamicModelsCache.lastFail.IsZero() && time.Since(dynamicModelsCache.lastFail) < modelsFetchFailCooldown {
		dynamicModelsCache.RUnlock()
		return nil
	}
	dynamicModelsCache.RUnlock()

	acct := h.cfg.Pool.Pick()
	if acct == nil {
		return nil
	}
	infos, err := h.cfg.Upstream.FetchModels(acct)
	if err != nil || len(infos) == 0 {
		dynamicModelsCache.Lock()
		dynamicModelsCache.lastFail = time.Now()
		dynamicModelsCache.Unlock()
		return nil
	}
	dynamicModelsCache.Lock()
	dynamicModelsCache.ids = infos
	dynamicModelsCache.fetched = time.Now()
	dynamicModelsCache.lastFail = time.Time{}
	dynamicModelsCache.Unlock()
	return infos
}

// ---------------------------------------------------------------------------
// chat
// ---------------------------------------------------------------------------

// setModelInBody 将 body 中 model 字段替换为 configName，并返回改写后的 body。
func setModelInBody(body []byte, configName string) []byte {
	var obj map[string]any
	if err := json.Unmarshal(body, &obj); err != nil {
		return body
	}
	obj["model"] = configName
	out, err := json.Marshal(obj)
	if err != nil {
		return body
	}
	return out
}

func (h *Handler) chatCompletions(w http.ResponseWriter, r *http.Request) {
	// 池级运行态指标（面板「成功/失败/在途」卡）：流式按 NoteSuccess 口径、
	// 非流式以成功返回 JSON 计成功。
	okDone := false
	rmDone := relaymetrics.Enter("trae")
	defer func() { rmDone(okDone) }()
	body, err := io.ReadAll(io.LimitReader(r.Body, maxBodyBytes+1))
	if err != nil {
		writeOpenAIError(w, http.StatusBadRequest, "invalid_request", "read body: "+err.Error())
		return
	}
	if len(body) > maxBodyBytes {
		writeOpenAIError(w, http.StatusRequestEntityTooLarge, "request_too_large", "request body exceeds 8MB limit")
		return
	}
	var peek struct {
		Stream bool   `json:"stream"`
		Model  string `json:"model"`
	}
	_ = json.Unmarshal(body, &peek)

	configName, err := h.mapModel(peek.Model)
	if err != nil {
		writeOpenAIError(w, http.StatusBadRequest, "invalid_request", err.Error())
		return
	}
	body = setModelInBody(body, configName)

	tried := map[string]bool{}
	var lastErr error
	for i := 0; i < h.cfg.MaxRotate; i++ {
		acct := h.cfg.Pool.PickExcluding(tried)
		if acct == nil {
			break
		}
		tried[acct.UID] = true

		// 在途占用（面板「在途」列）+ 失败计数（面板「失败」列）：
		// 每个失败 continue / 失败 return 走 fail()；成功 return 走 release()。
		release := h.cfg.Pool.HoldUID(acct.UID)
		fail := func() {
			h.cfg.Pool.NoteFail(acct.UID)
			release()
		}

		// token 临近过期 → 先 refresh（持锁重查，避免并发重复轮换；失败冷却换号）
		refreshed, err := h.cfg.Upstream.RefreshTokenIfNeeded(acct, h.cfg.RefreshSkew)
		if err != nil {
			lastErr = err
			var ue *upstream.Error
			if errors.As(err, &ue) && ue.Kind == upstream.ErrSessionDead {
				h.cfg.Pool.Disable(acct.UID, "refresh session dead")
			} else {
				h.cfg.Pool.Cooldown(acct.UID, pool.CoolErr, h.cfg.ErrCooldown, "refresh: "+err.Error())
			}
			fail()
			continue
		}
		if refreshed {
			_ = acct.SaveAtomic()
		}

		started := time.Now() // 上游尝试起点（延迟/吞吐记账用）
		rc, status, respBody, terr := h.cfg.Upstream.ChatStream(acct, body)
		if terr != nil {
			lastErr = terr
			h.usage.record(acct.UID, peek.Model, 0, 0, true)
			h.cfg.Pool.NoteError(acct.UID, h.cfg.ErrThreshold, h.cfg.ErrCooldown)
			fail()
			continue
		}
		if status >= 400 {
			h.usage.record(acct.UID, peek.Model, 0, 0, true)
			kind := upstream.Classify(status, string(respBody))
			switch kind {
			case upstream.ErrPlanLimit:
				h.cfg.Pool.Cooldown(acct.UID, pool.CoolPlan, h.cfg.PlanCooldown, "plan 权益不足")
				lastErr = &upstream.Error{Kind: kind, Status: status, Msg: string(respBody)}
				fail()
				continue
			case upstream.ErrSoftRate:
				h.cfg.Pool.Cooldown(acct.UID, pool.CoolSoft, h.cfg.SoftCooldown, "429 rate limit")
				lastErr = &upstream.Error{Kind: kind, Status: status, Msg: string(respBody)}
				fail()
				continue
			case upstream.ErrSessionDead:
				h.cfg.Pool.Disable(acct.UID, "session dead")
				lastErr = &upstream.Error{Kind: kind, Status: status, Msg: string(respBody)}
				fail()
				continue
			case upstream.ErrNotFound:
				// 404 短冷却不累计 errCount（防雪崩）
				h.cfg.Pool.Cooldown(acct.UID, pool.CoolSoft, h.cfg.SoftCooldown, "upstream 404")
				lastErr = &upstream.Error{Kind: kind, Status: status, Msg: string(respBody)}
				fail()
				continue
			default:
				h.cfg.Pool.NoteError(acct.UID, h.cfg.ErrThreshold, h.cfg.ErrCooldown)
				lastErr = &upstream.Error{Kind: kind, Status: status, Msg: string(respBody)}
				fail()
				continue
			}
		}
		if peek.Stream {
			h.cfg.Pool.NoteSuccess(acct.UID)
			// 流内业务错误（1005 plan/5xx 等）→ 冷却账号，错误信息注入 SSE。
			// capWriter 抓响应尾巴（≤256KB），结束后从中解析 usage 末帧记用量。
			cw := &capWriter{ResponseWriter: w}
			_ = upstream.StreamWithError(cw, rc, func(se *upstream.SOLOStreamError) {
				h.handleStreamError(acct.UID, se)
			})
			rc.Close()
			latencyMs := time.Since(started).Milliseconds()
			if p, c, ok := extractUsage(cw.tail); ok {
				h.usage.record(acct.UID, peek.Model, p, c, false)
				h.cfg.Pool.NoteUsage(acct.UID, latencyMs, c)
			} else {
				h.usage.record(acct.UID, peek.Model, 0, 0, false)
				h.cfg.Pool.NoteUsage(acct.UID, latencyMs, 0)
			}
			okDone = true
			release()
			return
		}
		resp, err := upstream.Aggregate(rc)
		rc.Close() // 已完全消费，立即释放上游连接（防轮转 continue 泄漏 body）
		if err != nil {
			// 流内业务错误（如 1005 plan 权益不足）→ 冷却账号并轮转下一账号。
			var se *upstream.SOLOStreamError
			if errors.As(err, &se) {
				lastErr = err
				h.usage.record(acct.UID, peek.Model, 0, 0, true)
				switch se.Kind() {
				case upstream.ErrPlanLimit:
					h.cfg.Pool.Cooldown(acct.UID, pool.CoolPlan, h.cfg.PlanCooldown, "plan 权益不足")
				default:
					h.cfg.Pool.NoteError(acct.UID, h.cfg.ErrThreshold, h.cfg.ErrCooldown)
				}
				fail()
				continue
			}
			writeOpenAIError(w, http.StatusBadGateway, "upstream_parse", err.Error())
			fail()
			return
		}
		h.cfg.Pool.NoteSuccess(acct.UID)
		var up, uc int64
		if um, ok := resp["usage"].(map[string]any); ok {
			if v, ok := um["prompt_tokens"].(float64); ok {
				up = int64(v)
			}
			if v, ok := um["completion_tokens"].(float64); ok {
				uc = int64(v)
			}
		}
		h.usage.record(acct.UID, peek.Model, up, uc, false)
		h.cfg.Pool.NoteUsage(acct.UID, time.Since(started).Milliseconds(), uc)
		writeJSON(w, http.StatusOK, resp)
		okDone = true
		release()
		return
	}
	msg := "all accounts unavailable (cooling/disabled)"
	if lastErr != nil {
		msg += ": " + lastErr.Error()
	}
	writeOpenAIError(w, http.StatusServiceUnavailable, "no_healthy_account", msg)
}

// handleStreamError 流式响应中的上游业务错误 → pool 冷却状态机。
// 1005 plan 权益不足 → 长冷却；其余（5xx/参数错误等）→ 累计错误冷却。
func (h *Handler) handleStreamError(uid string, se *upstream.SOLOStreamError) {
	switch se.Kind() {
	case upstream.ErrPlanLimit:
		h.cfg.Pool.Cooldown(uid, pool.CoolPlan, h.cfg.PlanCooldown, "plan 权益不足")
	default:
		h.cfg.Pool.NoteError(uid, h.cfg.ErrThreshold, h.cfg.ErrCooldown)
	}
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

func writeJSON(w http.ResponseWriter, status int, v any) {
	raw, _ := json.Marshal(v)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_, _ = w.Write(raw)
}

func writeOpenAIError(w http.ResponseWriter, status int, code, msg string) {
	writeJSON(w, status, map[string]any{
		"error": map[string]any{
			"message": msg,
			"type":    "api_error",
			"code":    code,
		},
	})
}
