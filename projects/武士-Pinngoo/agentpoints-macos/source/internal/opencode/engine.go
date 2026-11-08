package opencode

import (
	"context"
	"sort"
	"strings"
	"sync"
	"time"
)

// providerID opencode 自带免费层在它自己目录里的 provider 标识。
const providerID = "opencode"

// defaultModels opencode 免费层内置模型名（providerID=opencode）。
// 本地服务可达时以 /api/model 的实时目录为准；不可达时用这份兜底，
// 让 KnownModel 仍能认出这些名字（否则请求会被当成未知模型丢给主池，报错会更加费解）。
var defaultModels = []string{
	"big-pickle",
	"ll-alpha-free",
	"beam-free",
	"deepseek-v4.1-flash-free",
	"glm-5.3-flash-free",
	"mimo-v2.6-flash-free",
	"longcat-2.5-preview-free",
	"muse-spark-1.3-contributor-free",
	"nemotron-3-ultra-free",
	"nemotron-3.5-lightning-free",
	"nemotron-3.5-super-vl-free",
	"space-bunny-free",
}

// catalogTTL 模型目录缓存时长。
const catalogTTL = 10 * time.Minute

// healthTTL 在线状态缓存时长（/v1/models 与面板都会问，别每个请求都探）。
const healthTTL = 20 * time.Second

// Config 引擎配置（由 cmd/server 从 config.json 的 opencode 段装配）。
type Config struct {
	// ServiceFile 宿主 opencode 状态文件的**容器内路径**（挂载进来的 service.json）。
	ServiceFile string
	// Host 容器访问宿主的主机名（缺省 host.docker.internal）。
	Host string
	// Timeout 单次生成的整体上限（缺省 300s；实测冷启动可到 75s）。
	Timeout time.Duration
	// Concurrency 并发上限（缺省 4）。每次请求都要在 opencode 侧建一个会话，
	// 并发过高会让它的 agent 排队反而变慢。
	Concurrency int
}

// Engine opencode 桥接引擎：模型目录 + 在线探测 + 一轮生成。
type Engine struct {
	cfg Config
	cli *Client
	sem chan struct{}

	mu        sync.RWMutex
	catalog   []Model
	catalogAt time.Time
	online    bool
	healthAt  time.Time
	lastErr   string
}

// New 构造引擎。
func New(cfg Config) *Engine {
	if cfg.Concurrency <= 0 {
		cfg.Concurrency = 4
	}
	if cfg.Timeout <= 0 {
		cfg.Timeout = 300 * time.Second
	}
	return &Engine{
		cfg: cfg,
		cli: NewClient(cfg.ServiceFile, cfg.Host, cfg.Timeout),
		sem: make(chan struct{}, cfg.Concurrency),
	}
}

// Client 暴露底层客户端（面板/调试用）。
func (e *Engine) Client() *Client { return e.cli }

// Installed 宿主是否装过 opencode（状态文件可读）。
func (e *Engine) Installed() bool { return e.cli.Installed() }

// ServiceFile 返回配置的状态文件路径（面板展示用）。
func (e *Engine) ServiceFile() string { return e.cfg.ServiceFile }

// refreshCatalog 拉一次实时目录；失败保留上次成功结果。
func (e *Engine) refreshCatalog(ctx context.Context) {
	ctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	models, err := e.cli.ListModels(ctx, providerID)
	if err != nil {
		e.mu.Lock()
		e.lastErr = err.Error()
		e.mu.Unlock()
		return
	}
	if len(models) == 0 {
		return
	}
	e.mu.Lock()
	e.catalog = models
	e.catalogAt = time.Now()
	e.lastErr = ""
	e.mu.Unlock()
}

// catalogModels 返回当前已知模型列表（实时目录优先，过期则后台刷新，兜底静态表）。
func (e *Engine) catalogModels(ctx context.Context) []Model {
	e.mu.RLock()
	cat, at := e.catalog, e.catalogAt
	e.mu.RUnlock()
	if len(cat) > 0 && time.Since(at) < catalogTTL {
		return cat
	}
	if len(cat) == 0 {
		// 首次或从未成功：同步拉一次（有超时保护），失败就用静态表。
		e.refreshCatalog(ctx)
		e.mu.RLock()
		cat = e.catalog
		e.mu.RUnlock()
	} else {
		// 有旧目录：异步刷新，本次仍用旧值（不阻塞请求）。
		go e.refreshCatalog(context.Background())
	}
	if len(cat) > 0 {
		return cat
	}
	out := make([]Model, 0, len(defaultModels))
	for _, id := range defaultModels {
		out = append(out, Model{ID: id, Name: id, ProviderID: providerID})
	}
	return out
}

// Models 返回可直接并入 /v1/models 的条目。
// 未装 opencode（状态文件不存在）时返回 nil —— 不挂空池。
// 对外统一去 "-free" 后缀（调用方用裸名即可，见 ResolveModel 别名转发），
// 条目带 free=true 与 note="免费" 备注上游原名；去后缀若与本目录其它
// 真实模型撞名则保留原名（不做歧义别名）。
func (e *Engine) Models() []map[string]any {
	if !e.Installed() {
		return nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), 25*time.Second)
	defer cancel()
	models := e.catalogModels(ctx)
	realIDs := make(map[string]bool, len(models))
	for _, m := range models {
		if id := strings.TrimSpace(m.ID); id != "" {
			realIDs[normalize(id)] = true
		}
	}
	out := make([]map[string]any, 0, len(models))
	for _, m := range models {
		id := strings.TrimSpace(m.ID)
		if id == "" {
			continue
		}
		exposed, free := id, false
		if strings.HasSuffix(strings.ToLower(id), "-free") {
			if bare := id[:len(id)-len("-free")]; !realIDs[normalize(bare)] {
				exposed, free = bare, true
			}
		}
		name := strings.TrimSpace(m.Name)
		if name == "" {
			name = id
		}
		entry := map[string]any{
			"id":          exposed,
			"object":      "model",
			"created":     1789000000,
			"owned_by":    providerID,
			"name":        name,
			"description": "opencode free (" + name + ")",
		}
		if free {
			entry["free"] = true
			entry["note"] = "免费（上游名 " + id + "）"
		}
		out = append(out, entry)
	}
	sort.Slice(out, func(i, j int) bool {
		return out[i]["id"].(string) < out[j]["id"].(string)
	})
	return out
}

// knownExact 名字是否直接命中目录（动态目录 + 静态兜底表，大小写不敏感）。
func (e *Engine) knownExact(name string) bool {
	want := normalize(name)
	if want == "" {
		return false
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	for _, m := range e.catalogModels(ctx) {
		if normalize(m.ID) == want {
			return true
		}
	}
	for _, id := range defaultModels {
		if normalize(id) == want {
			return true
		}
	}
	return false
}

// ResolveModel 「-free 别名」解析：裸名未直接命中目录时，尝试「裸名-free」。
// 例：deepseek-v4.1-flash → deepseek-v4.1-flash-free。返回转发用的真实模型名。
// 动机：调用方想用与其它池一致的裸名（无 -free 后缀）调 opencode 免费模型，
// 同名即可纳入跨池轮询候选（poolrr）。已有精确命中优先，名字本身以
// -free 结尾的不做二次拼接。目录不在线时同样走 defaultModels 兜底判定。
func (e *Engine) ResolveModel(name string) (string, bool) {
	if e.knownExact(name) {
		return name, true
	}
	if strings.HasSuffix(strings.ToLower(strings.TrimSpace(name)), "-free") {
		return "", false
	}
	alias := name + "-free"
	if e.knownExact(alias) {
		return alias, true
	}
	return "", false
}

// KnownModel 判断模型名是否属于 opencode 免费层（大小写不敏感）。
// 含 -free 别名（见 ResolveModel）：拿到名字就该分流到本池，让上游给
// 明确的错，而不是让请求掉进主池报一个「模型不存在」的误导错误。
func (e *Engine) KnownModel(name string) bool {
	_, ok := e.ResolveModel(name)
	return ok
}

// Healthy 本地服务是否在线（结果缓存 healthTTL）。
func (e *Engine) Healthy() bool {
	e.mu.RLock()
	at, ok := e.healthAt, e.online
	e.mu.RUnlock()
	if !at.IsZero() && time.Since(at) < healthTTL {
		return ok
	}
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	ver, err := e.cli.Version(ctx)
	up := err == nil && ver != ""
	e.mu.Lock()
	e.online = up
	e.healthAt = time.Now()
	if err != nil {
		e.lastErr = err.Error()
	} else {
		e.lastErr = ""
	}
	e.mu.Unlock()
	return up
}

// Status 面板/调试用的状态快照。
func (e *Engine) Status() map[string]any {
	e.mu.RLock()
	cat, at, lastErr := e.catalog, e.catalogAt, e.lastErr
	e.mu.RUnlock()
	ids := make([]string, 0, len(cat))
	for _, m := range cat {
		ids = append(ids, m.ID)
	}
	if len(ids) == 0 {
		ids = append(ids, defaultModels...)
	}
	sort.Strings(ids)
	st := map[string]any{
		"provider":     providerID,
		"enabled":      true,
		"installed":    e.Installed(),
		"online":       e.Healthy(),
		"service_file": e.cfg.ServiceFile,
		"base_url":     e.cli.BaseURL(),
		"models":       ids,
		"model_count":  len(ids),
		"concurrency":  e.cfg.Concurrency,
		"timeout":      e.cfg.Timeout.String(),
		"note":         "opencode 桌面版必须常驻本机；直连其免费层上游会被 403/503 闸门拦，只能走本机 session 桥接",
	}
	if !at.IsZero() {
		st["catalog_at"] = at.Format(time.RFC3339)
	}
	if lastErr != "" {
		st["last_error"] = lastErr
	}
	return st
}

// Generate 跑完一轮（带并发闸门）。onDelta 非空时按增量回调，用于伪流式。
func (e *Engine) Generate(ctx context.Context, modelID, prompt string, onDelta func(string)) (GenerateResult, error) {
	select {
	case e.sem <- struct{}{}:
		defer func() { <-e.sem }()
	case <-ctx.Done():
		return GenerateResult{}, ctx.Err()
	}
	return e.cli.Generate(ctx, modelID, prompt, onDelta)
}

// normalize 模型名规范化（小写去符号），与其他池的同名判定口径一致。
func normalize(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	var b strings.Builder
	for _, r := range s {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
		}
	}
	return b.String()
}
