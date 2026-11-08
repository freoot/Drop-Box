package server

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/linguo2625469/workbuddy2api-panel/internal/auth"
	"github.com/linguo2625469/workbuddy2api-panel/internal/pool"
	"github.com/linguo2625469/workbuddy2api-panel/internal/upstream"
)

// TestApplyErrorPolicyConversationIDMissingCools 灰度渠道校验（workbuddy-manager
// issue #193/#201 移植）handler 侧策略回归：上游实测形态 HTTP 400 + code 11-128
// （code 值没加引号的非法 JSON）。出站已补会话头族（session.ConversationIDForHeaders），
// 仍撞上说明该账号被灰度到了别的口径 —— 这时**不能**像以前那样归到通用 4xx「只换号
// 不罚号」：那会让坏号留在池里"显示健康、每次被选中都失败"。也不硬禁用：灰度随时
// 可能放开，禁用会让用户白重新登录。
func TestApplyErrorPolicyConversationIDMissingCools(t *testing.T) {
	p := pool.New("")
	p.Add(&auth.Auth{UID: "u1"})
	h := NewHandler(Config{Pool: p, SoftCooldown: 600 * time.Second})

	// 上游实测形态：HTTP 400 + code 11-128，且 code 的值**没加引号**（非法 JSON）。
	// 理由里的码必须照实取到 —— 这条用例同时钉住 CodeOf 对非法 JSON 的容忍。
	h.applyErrorPolicy("u1", upstream.ErrAccountFault,
		`{"code":11-128,"msg":"conversation id missing","requestId":"x","displayMsg":{"zh":"请求被拦截，请重新发送"}}`,
		"glm-5.2", &upstream.Error{Kind: upstream.ErrAccountFault, Status: 400, Msg: "conversation id missing"})
	st, _ := p.Status("u1")
	if st.Disabled {
		t.Fatalf("渠道校验不应硬禁用（灰度可能放开，禁用等于让用户白重登）: %+v", st)
	}
	if !st.Cooling || st.CoolKind != "soft_rate" {
		t.Fatalf("应 soft_rate 软冷却（挪出池子但可自愈）: %+v", st)
	}
	if !strings.Contains(st.Reason, "11-128") {
		t.Errorf("冷却理由应带真实码，否则排障按错码去搜: %q", st.Reason)
	}
	if strings.Contains(st.Reason, "11140") {
		t.Errorf("理由里不该出现写死的 11140（issue #201 缺陷 1）: %q", st.Reason)
	}
}

// TestChatConversationIDDerivedWhenClientOmitsIt 端到端回归（workbuddy-manager
// issue #193 灰度移植）：OpenAI 兼容客户端的请求体里没有 conversationId 也没有
// metadata 键 → 出站仍必须带 X-Conversation-ID（同会话稳定值），否则被灰度渠道
// 校验命中的账号每次出站都判 11-128。
func TestChatConversationIDDerivedWhenClientOmitsIt(t *testing.T) {
	var sawConvID, sawConvReqID string
	up := newFakeUpstream(t, func(authz string) (int, string, bool) {
		return 200, sseOK, true
	})
	// 在 transport 里截获出站头（newFakeUpstream 的 behavior 只给 authz，这里
	// 复用其 client 再包一层）。
	up.HTTP = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		sawConvID = r.Header.Get("X-Conversation-ID")
		sawConvReqID = r.Header.Get("X-Conversation-Request-ID")
		return &http.Response{
			StatusCode: 200,
			Header:     http.Header{"Content-Type": []string{"text/event-stream"}},
			Body:       io.NopCloser(strings.NewReader(sseOK)),
		}, nil
	})}
	p := testPoolWith(&auth.Auth{UID: "u1", AccessToken: "at-u1", ExpiresAt: 9999999999})
	p.SetCredits("u1", 1000, 0)
	h := NewHandler(Config{Pool: p, Upstream: up})
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest("POST", "/v1/chat/completions",
		strings.NewReader(`{"model":"glm-5.2","messages":[{"role":"user","content":"你好"}]}`)))
	if rec.Code != http.StatusOK {
		t.Fatalf("code=%d body=%s", rec.Code, rec.Body.String())
	}
	if sawConvID == "" {
		t.Fatal("客户端没给 conversationId 时出站也必须带 X-Conversation-ID（灰度渠道校验必查头）")
	}
	if len(sawConvID) != 32 {
		t.Errorf("派生 conversationID 应为 32 hex，got %q", sawConvID)
	}
	if sawConvReqID == "" {
		t.Error("X-Conversation-Request-ID 聚合主键必须必发")
	}
}
