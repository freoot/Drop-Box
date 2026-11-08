package autoclaw

// 账号池状态机（移植自 bridge.py Pool/Entry）：积分加权选号、冷却/停用、
// 连续错误记账，状态落 state.<region>.json 文件（跨重启保留）。

import (
	"encoding/json"
	"fmt"
	"math/rand"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"time"
)

type entry struct {
	auth         *Auth
	points       int
	successCount int
	errCount     int
	failTotal    int // 累计失败（errCount 是「连续错误」会清零，面板「失败」列要累计口径）
	inFlight     int // 当前在途请求数（chat 选号后占用，出口释放）
	lastErr      time.Time
	lastSuccess  time.Time
	// 账号级用量（内存态，重启清零；面板「用量」列）。
	totalTokens   int64
	lastLatencyMs int64
	lastTPS       float64
	hasTPS        bool
	coolKind      string
	until         time.Time
	disabled      bool
	reason        string
	lastUsed      time.Time
}

func (e *entry) healthy(now time.Time) bool {
	if e.disabled {
		return false
	}
	if !e.until.IsZero() && now.Before(e.until) {
		return false
	}
	return true
}

// Pool 单区域账号池。
type Pool struct {
	region    string
	stateFile string

	mu    sync.Mutex
	byUID map[string]*entry
}

func newPool(region, stateFile string) *Pool {
	p := &Pool{region: region, stateFile: stateFile, byUID: map[string]*entry{}}
	p.loadState()
	return p
}

// loadState 恢复状态文件（积分/停用/冷却；凭证本体在 auths/ 目录，sync 时挂回）。
func (p *Pool) loadState() {
	raw, err := os.ReadFile(p.stateFile)
	if err != nil {
		return
	}
	var sf struct {
		Accounts map[string]json.RawMessage `json:"accounts"`
	}
	if json.Unmarshal(raw, &sf) != nil {
		return
	}
	for uid, rawAcc := range sf.Accounts {
		var s struct {
			Region       string      `json:"region"`
			Points       int         `json:"points"`
			Disabled     bool        `json:"disabled"`
			Reason       string      `json:"reason"`
			Until        any         `json:"until"`
			CoolKind     string      `json:"cool_kind"`
			SuccessCount int         `json:"success_count"`
			ErrCount     int         `json:"err_count"`
		}
		if json.Unmarshal(rawAcc, &s) != nil {
			continue
		}
		if s.Region != "" && s.Region != p.region {
			continue
		}
		until := parseUntil(s.Until)
		p.byUID[uid] = &entry{
			auth:         &Auth{UserID: uid, Region: p.region},
			points:       s.Points,
			disabled:     s.Disabled,
			reason:       s.Reason,
			until:        until,
			coolKind:     s.CoolKind,
			successCount: s.SuccessCount,
			errCount:     s.ErrCount,
		}
	}
}

// parseUntil 兼容 Python 版写的两种格式：unix 浮点 / RFC3339 字符串。
func parseUntil(v any) time.Time {
	switch t := v.(type) {
	case float64:
		if t <= 0 {
			return time.Time{}
		}
		sec := int64(t)
		ns := int64((t - float64(sec)) * 1e9)
		return time.Unix(sec, ns)
	case string:
		if len(t) < 4 || t[:4] == "0001" {
			return time.Time{}
		}
		for _, layout := range []string{"2006-01-02T15:04:05", time.RFC3339} {
			if tt, err := time.ParseInLocation(layout, t[:19], time.Local); err == nil {
				return tt
			}
		}
	}
	return time.Time{}
}

func (p *Pool) flushLocked() {
	if p.stateFile == "" {
		return
	}
	accounts := map[string]map[string]any{}
	for uid, e := range p.byUID {
		accounts[uid] = map[string]any{
			"region":        p.region,
			"points":        e.points,
			"disabled":      e.disabled,
			"reason":        e.reason,
			"until":         floatOf(e.until),
			"cool_kind":     e.coolKind,
			"success_count": e.successCount,
			"err_count":     e.errCount,
		}
	}
	if err := os.MkdirAll(filepath.Dir(p.stateFile), 0o755); err != nil {
		return
	}
	raw, err := json.MarshalIndent(map[string]any{"accounts": accounts}, "", "  ")
	if err != nil {
		return
	}
	tmp := p.stateFile + ".tmp"
	if os.WriteFile(tmp, raw, 0o644) == nil {
		_ = os.Rename(tmp, p.stateFile)
	}
}

func floatOf(t time.Time) float64 {
	if t.IsZero() {
		return 0
	}
	return float64(t.Unix()) + float64(t.Nanosecond())/1e9
}

// sync 目录扫描结果并入池（新增挂入、消失剪除；保留已有 entry 状态）。
func (p *Pool) sync(auths []*Auth) {
	p.mu.Lock()
	defer p.mu.Unlock()
	seen := map[string]bool{}
	for _, a := range auths {
		seen[a.UserID] = true
		if e, ok := p.byUID[a.UserID]; ok {
			e.auth = a
		} else {
			p.byUID[a.UserID] = &entry{auth: a}
		}
	}
	for uid := range p.byUID {
		if !seen[uid] {
			delete(p.byUID, uid)
		}
	}
	p.flushLocked()
}

// pick 选一个可用账号：积分降序取前 5，按积分加权随机（0.1s 内用过的降权）。
func (p *Pool) pick(tried map[string]bool) *Auth {
	p.mu.Lock()
	defer p.mu.Unlock()
	now := time.Now()
	cands := make([]*entry, 0, len(p.byUID))
	for uid, e := range p.byUID {
		if tried[uid] || !e.healthy(now) {
			continue
		}
		cands = append(cands, e)
	}
	if len(cands) == 0 {
		return nil
	}
	sort.Slice(cands, func(i, j int) bool {
		if cands[i].points != cands[j].points {
			return cands[i].points > cands[j].points
		}
		return cands[i].auth.UserID < cands[j].auth.UserID
	})
	if len(cands) > 5 {
		cands = cands[:5]
	}
	eligible := make([]*entry, 0, len(cands))
	for _, e := range cands {
		if now.Sub(e.lastUsed) >= 100*time.Millisecond {
			eligible = append(eligible, e)
		}
	}
	var chosen *entry
	if len(eligible) == 0 {
		chosen = cands[0]
		for _, e := range cands[1:] {
			if e.lastUsed.Before(chosen.lastUsed) {
				chosen = e
			}
		}
	} else {
		total := 0
		for _, e := range eligible {
			total += e.points
		}
		if total <= 0 {
			chosen = eligible[rand.Intn(len(eligible))]
		} else {
			r := rand.Intn(total)
			acc := 0
			chosen = eligible[len(eligible)-1]
			for _, e := range eligible {
				acc += e.points
				if r < acc {
					chosen = e
					break
				}
			}
		}
	}
	chosen.lastUsed = time.Now()
	return chosen.auth
}

func (p *Pool) setPoints(uid string, points int) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if e, ok := p.byUID[uid]; ok {
		e.points = points
		p.flushLocked()
	}
}

func (p *Pool) cooldown(uid, kind string, seconds float64, reason string) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if e, ok := p.byUID[uid]; ok {
		e.until = time.Now().Add(time.Duration(seconds * float64(time.Second)))
		e.coolKind = kind
		e.reason = reason
		e.errCount = 0
		p.flushLocked()
	}
}

func (p *Pool) disable(uid, reason string) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if e, ok := p.byUID[uid]; ok {
		e.disabled = true
		e.reason = reason
		p.flushLocked()
	}
}

func (p *Pool) reenable(uid string) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if e, ok := p.byUID[uid]; ok {
		e.disabled = false
		e.until = time.Time{}
		e.coolKind = ""
		e.reason = ""
		e.errCount = 0
		p.flushLocked()
	}
}

// reenableIfPoints 更新积分；未停用账号顺带清冷却（签到/余额刷新解冻）。
func (p *Pool) reenableIfPoints(uid string, points int) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if e, ok := p.byUID[uid]; ok {
		e.points = points
		if !e.disabled {
			e.until = time.Time{}
			e.coolKind = ""
			e.reason = ""
			e.errCount = 0
		}
		p.flushLocked()
	}
}

func (p *Pool) noteError(uid string, threshold int, seconds float64) {
	p.mu.Lock()
	defer p.mu.Unlock()
	e, ok := p.byUID[uid]
	if !ok {
		return
	}
	e.errCount++
	e.failTotal++
	e.lastErr = time.Now()
	if e.errCount >= threshold {
		e.until = time.Now().Add(time.Duration(seconds * float64(time.Second)))
		e.coolKind = "error_threshold"
		e.reason = "consecutive errors"
		e.errCount = 0
	}
	p.flushLocked()
}

func (p *Pool) noteSuccess(uid string) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if e, ok := p.byUID[uid]; ok {
		e.successCount++
		e.lastSuccess = time.Now()
		e.errCount = 0
		p.flushLocked()
	}
}

// noteUsage 记录一次成功请求的 token 与延迟/吞吐（面板「用量」列）。
// total>0 才累计 token；completion<=0 时吞吐置空（前端显示 —）。
func (p *Pool) noteUsage(uid string, total, completion, latencyMs int64) {
	p.mu.Lock()
	defer p.mu.Unlock()
	e, ok := p.byUID[uid]
	if !ok {
		return
	}
	if total > 0 {
		e.totalTokens += total
	}
	if latencyMs < 1 {
		latencyMs = 1
	}
	e.lastLatencyMs = latencyMs
	if completion > 0 {
		e.lastTPS = float64(completion) * 1000 / float64(latencyMs)
		e.hasTPS = true
	} else {
		e.hasTPS = false
	}
}

// holdUID 在途占用：chat 选定账号后调用，返回释放回调（幂等；unknown uid no-op）。
func (p *Pool) holdUID(uid string) (release func()) {
	p.mu.Lock()
	if e, ok := p.byUID[uid]; ok {
		e.inFlight++
	}
	p.mu.Unlock()
	var once sync.Once
	return func() {
		once.Do(func() {
			p.mu.Lock()
			defer p.mu.Unlock()
			if e, ok := p.byUID[uid]; ok {
				e.inFlight--
				if e.inFlight < 0 {
					e.inFlight = 0
				}
			}
		})
	}
}

type poolCounts struct {
	Total, Healthy, Cooling, Disabled int
}

func (p *Pool) counts() poolCounts {
	p.mu.Lock()
	defer p.mu.Unlock()
	now := time.Now()
	c := poolCounts{Total: len(p.byUID)}
	for _, e := range p.byUID {
		switch {
		case e.disabled:
			c.Disabled++
		case !e.until.IsZero() && now.Before(e.until):
			c.Cooling++
		default:
			c.Healthy++
		}
	}
	return c
}

// StatusRow 面板状态行（与 Python status_list 字段一致）。
type StatusRow struct {
	UID             string `json:"uid"`
	Region          string `json:"region"`
	Nickname        string `json:"nickname"`
	Points          int    `json:"points"`
	Cooling         bool   `json:"cooling"`
	CoolKind        string `json:"cool_kind"`
	CoolRemainingSec int64  `json:"cool_remaining_sec"`
	Reason          string `json:"reason"`
	Disabled        bool   `json:"disabled"`
	SuccessCount    int    `json:"success_count"`
	ErrCount        int    `json:"err_count"`
	FailTotal       int    `json:"fail_total"`
	InFlight        int    `json:"in_flight"`
	TotalTokens     int64  `json:"total_tokens,omitempty"`
	LastLatencyMs   int64  `json:"last_latency_ms,omitempty"`
	LastTokensPerSecond *float64 `json:"last_tokens_per_second,omitempty"`
	LastSuccess     string `json:"last_success,omitempty"`
}

func (p *Pool) statusList() []StatusRow {
	p.mu.Lock()
	defer p.mu.Unlock()
	now := time.Now()
	uids := make([]string, 0, len(p.byUID))
	for uid := range p.byUID {
		uids = append(uids, uid)
	}
	sort.Strings(uids)
	out := make([]StatusRow, 0, len(uids))
	for _, uid := range uids {
		e := p.byUID[uid]
		cooling := !e.until.IsZero() && now.Before(e.until) && !e.disabled
		row := StatusRow{
			UID:          uid,
			Region:       p.region,
			Nickname:     e.auth.UserName,
			Points:       e.points,
			Cooling:      cooling,
			Reason:       e.reason,
			Disabled:     e.disabled,
			SuccessCount: e.successCount,
			ErrCount:     e.errCount,
		}
		if cooling {
			row.CoolKind = e.coolKind
			row.CoolRemainingSec = int64(e.until.Sub(now).Seconds())
			if row.CoolRemainingSec < 0 {
				row.CoolRemainingSec = 0
			}
		}
		row.FailTotal = e.failTotal
		row.InFlight = e.inFlight
		row.TotalTokens = e.totalTokens
		row.LastLatencyMs = e.lastLatencyMs
		if e.hasTPS {
			tps := e.lastTPS
			row.LastTokensPerSecond = &tps
		}
		if !e.lastSuccess.IsZero() {
			row.LastSuccess = e.lastSuccess.Format(time.RFC3339)
		}
		out = append(out, row)
	}
	return out
}

func (p *Pool) authByUID(uid string) *Auth {
	p.mu.Lock()
	defer p.mu.Unlock()
	if e, ok := p.byUID[uid]; ok {
		return e.auth
	}
	return nil
}

func (p *Pool) hasUID(uid string) bool {
	p.mu.Lock()
	defer p.mu.Unlock()
	_, ok := p.byUID[uid]
	return ok
}

var _ = fmt.Sprintf // keep fmt
