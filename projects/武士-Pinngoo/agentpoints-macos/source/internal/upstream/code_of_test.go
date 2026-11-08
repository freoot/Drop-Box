package upstream

import "testing"

// 灰度渠道校验（workbuddy-manager issue #193/#201 移植）：
// 上游对部分账号灰度启用 X-Conversation-ID 必填校验，实测响应是 HTTP 400 +
// `{"code":11-128,"msg":"conversation id missing",...}` —— 且 code 的值**没加引号**
// （非法 JSON）。分类必须归 ErrAccountFault（软冷却轮换），不能落通用 4xx「只换号
// 不罚」；CodeOf 必须能从非法 JSON 里把码照实报出来。

func TestCodeOf(t *testing.T) {
	cases := []struct {
		name string
		body string
		want string
	}{
		{"非法 JSON 无引号码", `{"code":11-128,"msg":"conversation id missing"}`, "11-128"},
		{"紧凑数字码", `{"code":11140,"msg":"request illegal"}`, "11140"},
		{"带空格", `{"code": 11128, "msg":"x"}`, "11128"},
		{"字符串码", `{"code":"6004"}`, "6004"},
		{"无码", `{"msg":"something broke"}`, ""},
		{"非 JSON", `<html>gateway error</html>`, ""},
		{"空体", "", ""},
	}
	for _, c := range cases {
		if got := CodeOf(c.body); got != c.want {
			t.Errorf("%s: CodeOf(%q) = %q want %q", c.name, c.body, got, c.want)
		}
	}
}

func TestClassifyConversationIDMissingIsAccountFault(t *testing.T) {
	// 上游灰度实测形态：HTTP 400 + 非法 JSON（code 值没加引号）。
	body := `{"code":11-128,"msg":"conversation id missing","requestId":"x","displayMsg":{"zh":"请求被拦截，请重新发送"}}`
	if got := Classify(400, body); got != ErrAccountFault {
		t.Fatalf("灰度渠道校验应归 ErrAccountFault（软冷却轮换），got %v", got)
	}
	// 大小写变体也要命中（marker 匹配是大小写不敏感的）。
	if got := Classify(400, `{"code":"11-128","msg":"Conversation ID Missing"}`); got != ErrAccountFault {
		t.Fatalf("大小写变体应命中 accountFault marker，got %v", got)
	}
	// 不误伤：普通 400 文案仍走原分类（blocked by security policy → ErrContentBlocked）。
	if got := Classify(400, `{"code":11128,"msg":"blocked by security policy"}`); got != ErrContentBlocked {
		t.Fatalf("内容拦截分类不应被灰度 marker 波及，got %v", got)
	}
}
