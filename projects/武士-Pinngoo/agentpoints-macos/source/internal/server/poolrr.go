// 跨池选池（sticky RR）：同名裸模型命中多个健康池时「随机挑一个 + 会话粘住」，
// 把调用摊开到各池，同时让同一会话连续多轮落回同一池以保住上游 prompt 缓存。
// 粘性键：API Key（无鉴权时退化为首条消息——agent 的 system prompt 逐轮稳定）。
// 显式前缀（zcode/ trae/ autoclaw/ qoder/ opencode/ cn: global:）与单候选请求
// 不参与轮询，保持原链路/强制指定语义。某池运行时不健康走原「跨池兜底」
// 重写转发（markRelay），接力不受轮询约束。
package server

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"math/rand"
	"net/http"
	"strings"
	"time"

	"github.com/linguo2625469/workbuddy2api-panel/internal/session"
)

// stickyTTL 粘性条目空闲过期时间；stickyCap 条目数上限（防长尾膨胀）。
const (
	stickyTTL = 30 * time.Minute
	stickyCap = 2048
)

// stickyEntry 会话 → 受理池的粘性记录。
type stickyEntry struct {
	realm    string
	lastSeen time.Time
}

// poolDecision 单请求的选池结果（挂在 request context，指针共享以便 relay 原地置位）。
type poolDecision struct {
	realm string // zcode / trae / autoclaw / qoder / opencode / workbuddy
	relay bool   // true = 已进入跨池接力，后续池一律放行
}

// poolChoiceKey context 键。
type poolChoiceKey struct{}

// maybeRotatePool 计算本次请求的受理池并写入 context。候选判定（known+healthy
// 双条件，与各 Route 受理口径一致）后：粘性命中且仍在候选内 → 沿用；否则随机
// 挑一个并记录。候选 <2 或非裸名模型时不轮询（decision 不写入，chosenFor 恒 true）。
func (h *Handler) maybeRotatePool(r *http.Request) *http.Request {
	body, err := io.ReadAll(io.LimitReader(r.Body, traePeekLimitMB<<20))
	if err != nil {
		_ = r.Body.Close()
		r.Body = io.NopCloser(bytes.NewReader(nil))
		return r
	}
	_ = r.Body.Close()
	r.Body = io.NopCloser(bytes.NewReader(body))
	var peek struct {
		Model    string            `json:"model"`
		Messages []json.RawMessage `json:"messages"`
	}
	if json.Unmarshal(body, &peek) != nil {
		return r // 非 JSON：主链路自有 400 处理
	}
	model := strings.TrimSpace(peek.Model)
	if model == "" || model == "auto" || strings.Contains(model, "/") ||
		strings.HasPrefix(model, "cn:") || strings.HasPrefix(model, "global:") {
		return r // 显式指定/主链路专有名：不轮询
	}
	// 候选池（链序），known+healthy 双条件与各 Route 的受理口径一致。
	var cands []string
	if h.cfg.ZcodeChat != nil && h.cfg.ZcodeKnownModel != nil && h.cfg.ZcodeKnownModel(model) &&
		(h.cfg.ZcodeHealthy == nil || h.cfg.ZcodeHealthy()) {
		cands = append(cands, "zcode")
	}
	if h.cfg.TraeChat != nil && h.cfg.TraeKnownModel != nil && h.cfg.TraeKnownModel(model) &&
		(h.cfg.TraeHealthy == nil || h.cfg.TraeHealthy()) {
		cands = append(cands, "trae")
	}
	if h.cfg.AutoclawChat != nil && h.cfg.AutoclawKnownModel != nil && h.cfg.AutoclawKnownModel(model) &&
		(h.cfg.AutoclawHealthy == nil || h.cfg.AutoclawHealthy()) {
		cands = append(cands, "autoclaw")
	}
	if h.cfg.QoderChat != nil && h.cfg.QoderKnownModel != nil && h.cfg.QoderKnownModel(model) &&
		(h.cfg.QoderHealthy == nil || h.cfg.QoderHealthy()) {
		cands = append(cands, "qoder")
	}
	if h.cfg.OpenCodeChat != nil && h.cfg.OpenCodeKnownModel != nil && h.cfg.OpenCodeKnownModel(model) &&
		(h.cfg.OpenCodeHealthy == nil || h.cfg.OpenCodeHealthy()) {
		cands = append(cands, "opencode") // 免费池入轮询（桥接开销大但零额度消耗）
	}
	if _, ok := h.cnModelID(model); ok {
		cands = append(cands, "workbuddy")
	}
	if len(cands) < 2 {
		return r // 单候选/无候选：维持原链路语义
	}
	realm := h.stickyPick(stickyKeyOf(r, peek.Messages), cands)
	dec := &poolDecision{realm: realm}
	return r.WithContext(context.WithValue(r.Context(), poolChoiceKey{}, dec))
}

// stickyKeyOf 推导会话粘性键：优先 API Key（不同调用方天然隔离）；无鉴权时
// 用首条消息（agent 的 system prompt 逐轮稳定，足以标识同一 agent 会话）。
func stickyKeyOf(r *http.Request, msgs []json.RawMessage) string {
	h := sha256.New()
	if ak := strings.TrimSpace(r.Header.Get("Authorization")); ak != "" {
		h.Write([]byte("ak:" + ak))
	} else if len(msgs) > 0 {
		h.Write([]byte("msg:"))
		h.Write(msgs[0]) // 首条消息原文（通常为 system prompt）
	} else {
		h.Write([]byte("anon"))
	}
	return hex.EncodeToString(h.Sum(nil))[:24]
}

// stickyPick 粘性命中（条目在候选内且未过期）→ 沿用原池；否则随机挑一个并
// 记录。顺带做惰性过期清理与容量上限控制。
func (h *Handler) stickyPick(key string, cands []string) string {
	now := time.Now()
	h.rotMu.Lock()
	defer h.rotMu.Unlock()
	if h.stickyPool == nil {
		h.stickyPool = map[string]stickyEntry{}
	}
	if e, ok := h.stickyPool[key]; ok && now.Sub(e.lastSeen) < stickyTTL {
		for _, c := range cands {
			if c == e.realm {
				e.lastSeen = now
				h.stickyPool[key] = e
				return e.realm
			}
		}
		// 原池本轮不在候选（不健康/不认该模型）→ 重新随机
	}
	realm := cands[rand.Intn(len(cands))] //nolint:gosec // 选池无需密码学随机
	h.stickyPool[key] = stickyEntry{realm: realm, lastSeen: now}
	// 惰性清理：过期条目删除；超上限时按 lastSeen 淘汰最旧的一批。
	if len(h.stickyPool) > stickyCap {
		type kv struct {
			k string
			t time.Time
		}
		alive := make([]kv, 0, len(h.stickyPool))
		for k, e := range h.stickyPool {
			if now.Sub(e.lastSeen) >= stickyTTL {
				delete(h.stickyPool, k)
				continue
			}
			alive = append(alive, kv{k, e.lastSeen})
		}
		if len(h.stickyPool) > stickyCap {
			for i := 0; i < stickyCap/4 && i < len(alive); i++ { // 淘汰 1/4
				min := i
				for j := i + 1; j < len(alive); j++ {
					if alive[j].t.Before(alive[min].t) {
						min = j
					}
				}
				alive[i], alive[min] = alive[min], alive[i]
				delete(h.stickyPool, alive[i].k)
			}
		}
	}
	return realm
}

// chosenFor 本池是否本次请求的受理池。无轮询决策（未启用轮询）或 relay
// 模式 → 一律 true（保持原兜底语义）。
func chosenFor(r *http.Request, realm string) bool {
	if dec, _ := r.Context().Value(poolChoiceKey{}).(*poolDecision); dec != nil {
		return dec.relay || dec.realm == realm
	}
	return true
}

// markRelay 进入跨池接力（某池不健康时的重写转发）：置 relay 后，后续池
// 不再受轮询约束，见者有份按原链路兜底。
func markRelay(r *http.Request) {
	if dec, _ := r.Context().Value(poolChoiceKey{}).(*poolDecision); dec != nil {
		dec.relay = true
	}
}

// rewriteBareToCN 轮询选中主链路时，把裸名重写为 cn:<规范名> 交给主 handler。
// global 目录也认同名模型时经域级随机粘住（realmrr.go）选域，可重写为 global:。
func (h *Handler) rewriteBareToCN(r *http.Request) (*http.Request, bool) {
	body, err := io.ReadAll(io.LimitReader(r.Body, traePeekLimitMB<<20))
	if err != nil {
		_ = r.Body.Close()
		r.Body = io.NopCloser(bytes.NewReader(nil))
		return r, false
	}
	_ = r.Body.Close()
	var obj map[string]any
	if json.Unmarshal(body, &obj) != nil {
		r.Body = io.NopCloser(bytes.NewReader(body))
		return r, false
	}
	m, _ := obj["model"].(string)
	bare := strings.TrimSpace(m)
	if realm := h.pickWorkbuddyRealm(bare, session.ExtractKey(body)); realm == "global" {
		if gid, ok := h.globalModelID(bare); ok {
			obj["model"] = "global:" + gid
			if nb, merr := json.Marshal(obj); merr == nil {
				r.Body = io.NopCloser(bytes.NewReader(nb))
				r.ContentLength = int64(len(nb)) // body 重写后同步长度（见 zcodeRoute 注释）
				return r, true
			}
		}
	}
	cnID, ok := h.cnModelID(bare)
	if !ok {
		r.Body = io.NopCloser(bytes.NewReader(body))
		return r, false
	}
	obj["model"] = "cn:" + cnID
	nb, merr := json.Marshal(obj)
	if merr != nil {
		r.Body = io.NopCloser(bytes.NewReader(body))
		return r, false
	}
	r.Body = io.NopCloser(bytes.NewReader(nb))
	r.ContentLength = int64(len(nb)) // body 重写后同步长度（见 zcodeRoute 注释）
	return r, true
}
