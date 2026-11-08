// Package relaymetrics 按池（realm）统计请求级指标：成功 / 失败 / 在途。
//
// 与 usage 包的区别：usage 是记账口径（按时间片落桶、含 token/积分，可持久），
// 本包是**运行态口径**——从进程启动开始计数，重启清零，只回答「此刻各池什么状态」。
// 面板各池视图的「成功 / 失败 / 在途」卡与「用量」卡（来自 usage by_realm）合用。
//
// 用法（chat 入口）：
//
//	done := relaymetrics.Enter("trae") // 解析出 realm 后、真正开工前
//	ok := false                        // 失败路径保持 false
//	defer func() { done(ok) }()
//	…成功路径 ok = true
package relaymetrics

import (
	"sort"
	"sync"
	"sync/atomic"
)

type counters struct {
	inflight atomic.Int64
	ok       atomic.Int64
	fail     atomic.Int64
}

var (
	mu      sync.Mutex
	byRealm = map[string]*counters{}
)

func get(realm string) *counters {
	mu.Lock()
	defer mu.Unlock()
	c := byRealm[realm]
	if c == nil {
		c = &counters{}
		byRealm[realm] = c
	}
	return c
}

// Enter 标记一个请求进入某池，返回 done(ok) 回调（幂等，重复调用只计一次）：
// ok=true 记成功，false 记失败；同时结束该请求的在途状态。
// 返回前未调 done（如 panic）按失败收尾。
func Enter(realm string) (done func(ok bool)) {
	if realm == "" {
		realm = "unknown"
	}
	c := get(realm)
	c.inflight.Add(1)
	var ended atomic.Bool
	return func(ok bool) {
		if ended.Swap(true) {
			return
		}
		c.inflight.Add(-1)
		if ok {
			c.ok.Add(1)
		} else {
			c.fail.Add(1)
		}
	}
}

// Mark 直接记一次完成结果（无对应 Enter 的场景，如请求被入口秒拒）。
func Mark(realm string, ok bool) {
	done := Enter(realm)
	done(ok)
}

// RealmStat 一个池的运行态指标（自进程启动起累计）。
type RealmStat struct {
	Realm    string `json:"realm"`
	InFlight int64  `json:"in_flight"`
	OK       int64  `json:"ok"`
	Fail     int64  `json:"fail"`
}

// Snapshot 返回全部池的指标，按 realm 名排序（面板渲染稳定）。
func Snapshot() []RealmStat {
	mu.Lock()
	realms := make([]string, 0, len(byRealm))
	for k := range byRealm {
		realms = append(realms, k)
	}
	mu.Unlock()
	sort.Strings(realms)
	out := make([]RealmStat, 0, len(realms))
	for _, k := range realms {
		c := byRealm[k]
		out = append(out, RealmStat{Realm: k, InFlight: c.inflight.Load(), OK: c.ok.Load(), Fail: c.fail.Load()})
	}
	return out
}
