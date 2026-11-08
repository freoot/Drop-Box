package server

import (
	"testing"
)

// 主池前缀归一：cn:/global: 同名裸名合并为单条目（cn 保留字段、区域标记进
// owned_by），global-only 条目剥壳保留；extra 撞名合并进主池裸名条目。
func TestUnifiedModelListPrefixMerge(t *testing.T) {
	h := &Handler{}
	data := []map[string]any{
		{"id": "cn:glm-5.3", "owned_by": "workbuddy", "credits": "x0.11"},
		{"id": "global:glm-5.3", "owned_by": "workbuddy"},
		{"id": "global:gpt-5.5", "owned_by": "workbuddy"},
		{"id": "cn:deepseek-v4.1-flash", "owned_by": "workbuddy"},
	}
	extras := [][]map[string]any{
		{
			{"id": "glm-5.3", "owned_by": "trae-solo"},
			{"id": "deepseek-v4.1-flash", "owned_by": "opencode", "free": true, "note": "免费（上游名 deepseek-v4.1-flash-free）"},
		},
	}
	out := h.unifiedModelList(data, extras...)
	ids := map[string]map[string]any{}
	for _, e := range out {
		id, _ := e["id"].(string)
		ids[id] = e
	}
	// 前缀条目全部剥壳，cn:/global: 同名只剩一条裸名。
	for _, pfx := range []string{"cn:", "global:"} {
		for id := range ids {
			if len(id) >= len(pfx) && id[:len(pfx)] == pfx {
				t.Fatalf("对外列表不应再有前缀条目 %s", id)
			}
		}
	}
	glm := ids["glm-5.3"]
	if glm == nil {
		t.Fatal("glm-5.3 missing")
	}
	// cn 字段保留 + 区域标记齐活 + extra 来源合并 + free/note 并入。
	if glm["credits"] != "x0.11" {
		t.Errorf("cn 字段应保留，credits=%v", glm["credits"])
	}
	if ob, _ := glm["owned_by"].(string); ob != "trae-solo+workbuddy-cn+workbuddy-global" {
		t.Errorf("owned_by=%v, want trae-solo+workbuddy-cn+workbuddy-global", glm["owned_by"])
	}
	if glm["free"] == true {
		t.Errorf("glm-5.3 的 extra 无 free 标记，不应误并入: %v", glm["free"])
	}
	ds := ids["deepseek-v4.1-flash"]
	if ds == nil {
		t.Fatal("deepseek-v4.1-flash missing")
	}
	if ds["free"] != true {
		t.Errorf("free 应随 extra 并入 cn 孪生: %v", ds["free"])
	}
	if note, _ := ds["note"].(string); note == "" {
		t.Errorf("note 应随 extra 并入 cn 孪生")
	}
	gpt := ids["gpt-5.5"]
	if gpt == nil {
		t.Fatal("global-only gpt-5.5 应剥壳保留")
	}
	if ob, _ := gpt["owned_by"].(string); ob != "workbuddy-global" {
		t.Errorf("gpt-5.5 owned_by=%v, want workbuddy-global", gpt["owned_by"])
	}
	if n := len(out); n != 3 {
		t.Errorf("合并后应剩 3 条（glm-5.3/gpt-5.5/deepseek-v4.1-flash），got %d: %v", n, out)
	}
}

// 域级粘住：同 key 稳定同域，key 之间允许不同；域值只可能是 cn/global。
func TestStickyRealmPick(t *testing.T) {
	h := &Handler{}
	first := h.stickyRealmPick("key-a")
	if first != "cn" && first != "global" {
		t.Fatalf("realm=%q 越界", first)
	}
	for i := 0; i < 10; i++ {
		if got := h.stickyRealmPick("key-a"); got != first {
			t.Fatalf("同 key 第 %d 次粘住漂移：%s → %s", i, first, got)
		}
	}
	// 空 key 走 anon 兜底，同样要稳定。
	if got := h.stickyRealmPick(""); got != h.stickyRealmPick("") {
		t.Fatalf("空 key 粘住不稳定")
	}
}

// GlobalEnabled=false（逃生门关）时域选择恒为 cn，零上游调用。
func TestPickWorkbuddyRealmDisabled(t *testing.T) {
	h := &Handler{}
	for _, bare := range []string{"glm-5.3", "gpt-5.5"} {
		if got := h.pickWorkbuddyRealm(bare, "k"); got != "cn" {
			t.Fatalf("GlobalEnabled=false 时 %s 应恒 cn，got %s", bare, got)
		}
	}
}
