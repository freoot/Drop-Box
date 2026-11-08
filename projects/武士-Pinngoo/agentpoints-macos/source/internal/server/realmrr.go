// 主池域间轮询（sticky realm）：裸名模型在 workbuddy 主池的 cn/global 两个账号域
// 之间「随机挑一个 + 会话粘住」。与跨池 stickyPool（poolrr.go）分层：池级粘住决定
// 「哪个池受理」，域级粘住决定「主池内部用哪个账号域」——两级各存各的表，互不覆盖。
// 显式 cn:/global: 前缀不走本层（钉死语义不变）。
// 域候选条件：global 探测目录认同名模型（内部 1h 缓存）+ global 域有健康可用账号。
// 已知限制：选号后域内失败不做跨域重试——可用性已前置判定，与跨池 stickyPick
// 「粘性池失败不运行时重选」同一取舍。
package server

import (
	"math/rand"
	"time"
)

// globalModelID 在 global 探测目录里找与 bare 规范化同名的模型，返回目录精确 ID
// （重写 global: 前缀时用目录拼写）。GlobalEnabled=false 或无号 → false。
func (h *Handler) globalModelID(bare string) (string, bool) {
	want := normModelName(bare)
	if want == "" || !h.cfg.GlobalEnabled {
		return "", false
	}
	ids, _ := h.fetchGlobalModels()
	for _, id := range ids {
		if normModelName(id) == want {
			return id, true
		}
	}
	return "", false
}

// pickWorkbuddyRealm 主池裸名选域。规则：
//   - 仅 global 目录认同名模型（如 gpt-5.5）→ 直接 global（不掷硬币，否则落 cn 必失败）；
//   - 两域都认 → 随机+粘住（CN 配额耗尽由 global 兜底）；
//   - global 目录不认 / global 无健康号 / 逃生门关 → 维持 cn（零回归兜底）。
func (h *Handler) pickWorkbuddyRealm(bare, stickyKey string) string {
	_, gOK := h.globalModelID(bare)
	if !gOK {
		return "cn"
	}
	if _, cOK := h.cnModelID(bare); !cOK {
		return "global"
	}
	if h.cfg.Pool == nil || len(h.cfg.Pool.AvailableUIDsForRealm("global")) == 0 {
		return "cn"
	}
	return h.stickyRealmPick(stickyKey)
}

// stickyRealmPick 域级粘住（TTL/容量语义与 poolrr stickyPick 一致，独立于
// stickyPool 存储——池级与域级粘性互不覆盖）。
func (h *Handler) stickyRealmPick(stickyKey string) string {
	if stickyKey == "" {
		stickyKey = "anon"
	}
	now := time.Now()
	h.rotMu.Lock()
	defer h.rotMu.Unlock()
	if h.stickyRealm == nil {
		h.stickyRealm = map[string]stickyEntry{}
	}
	if e, ok := h.stickyRealm[stickyKey]; ok && now.Sub(e.lastSeen) < stickyTTL {
		if e.realm == "cn" || e.realm == "global" {
			e.lastSeen = now
			h.stickyRealm[stickyKey] = e
			return e.realm
		}
	}
	realm := "cn"
	if rand.Intn(2) == 1 { //nolint:gosec // 选域无需密码学随机
		realm = "global"
	}
	h.stickyRealm[stickyKey] = stickyEntry{realm: realm, lastSeen: now}
	// 惰性清理：超上限时删掉过期条目（域候选只有两个值，无需 lastSeen 淘汰）。
	if len(h.stickyRealm) > stickyCap {
		for k, e := range h.stickyRealm {
			if now.Sub(e.lastSeen) >= stickyTTL {
				delete(h.stickyRealm, k)
			}
		}
	}
	return realm
}
