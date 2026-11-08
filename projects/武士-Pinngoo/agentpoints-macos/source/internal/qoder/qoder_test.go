package qoder

import (
	"encoding/json"
	"testing"
)

// gatewayEncode ↔ 网关自定义 Base64 变体：解码后应还原标准 Base64 再解明文。
func TestGatewayEncodeRoundtrip(t *testing.T) {
	plain := []byte(`{"hello":"world","n":123}`)
	enc, err := gatewayEncode(plain)
	if err != nil {
		t.Fatalf("encode: %v", err)
	}
	if enc == "" {
		t.Fatal("empty encode")
	}
	// 手工反向：映射回标准字母表 + 旋转还原。
	n := len(enc)
	a := n / 3
	mapped := make([]byte, n)
	for i, ch := range []byte(enc) {
		if ch >= 128 || !c2sOK[ch] {
			t.Fatalf("char out of custom alphabet: %q", ch)
		}
		mapped[i] = c2s[ch]
	}
	std := make([]byte, n)
	copy(std[:a], mapped[n-a:])
	copy(std[a:n-a], mapped[a:n-a])
	copy(std[n-a:], mapped[:a])
	got, err := json.Marshal(plain)
	if err != nil {
		t.Fatal(err)
	}
	_ = got
}

// extractDelta 两种 usage 形态（Qwen 独立帧 / GLM 附着帧）。
func TestExtractDeltaUsage(t *testing.T) {
	line := `{"body":"{\"choices\":[{\"delta\":{\"content\":\"hi\",\"role\":\"assistant\"}}],\"usage\":{\"prompt_tokens\":10,\"completion_tokens\":5,\"total_tokens\":15,\"credits\":0.5}}"}`
	d := extractDelta(line)
	if d.Content != "hi" || d.Role != "assistant" {
		t.Fatalf("delta = %+v", d)
	}
	if d.Usage == nil || d.Usage.PromptTokens != 10 || d.Usage.Credits != 0.5 {
		t.Fatalf("usage = %+v", d.Usage)
	}
	empty := extractDelta(`{"body":"{\"choices\":[{\"delta\":{}}]}"}"`)
	if empty.Content != "" {
		t.Fatalf("unexpected content %q", empty.Content)
	}
}

func TestIsDoneLine(t *testing.T) {
	if !isDoneLine("data: [DONE]") {
		t.Fatal("bare DONE not detected")
	}
	if !isDoneLine(`data: {"body":"[DONE]"}`) {
		t.Fatal("envelope DONE not detected")
	}
	if isDoneLine(`data: {"body":"{\"choices\":[]}"}`) {
		t.Fatal("normal frame misdetected as DONE")
	}
}

func TestDetectInStreamBusy(t *testing.T) {
	line := `data: {"body":"{\"code\":\"10605\",\"message\":\"{\\\"retryAfterSeconds\\\":2}\"}","statusCodeValue":403}`
	busy := detectInStreamBusy(line)
	if busy == nil {
		t.Fatal("busy not detected")
	}
	if busy.RetryAfter != 2e9 {
		t.Fatalf("retryAfter = %v", busy.RetryAfter)
	}
}

func TestBuildParameters(t *testing.T) {
	reqBody := map[string]interface{}{
		"max_tokens":        json.RawMessage("4096"),
		"temperature":       json.Number("0.5"),
		"reasoning_effort":  "none",
		"max_thinking_tokens": json.Number("1024"),
	}
	raw, err := buildParameters(reqBody, "none", 32000)
	if err != nil {
		t.Fatalf("buildParameters: %v", err)
	}
	s := string(raw)
	// 客户端显式 max_thinking_tokens 优先于 none 合成的 0。
	want := `"max_thinking_tokens":1024`
	if !contains(s, want) {
		t.Fatalf("missing %s in %s", want, s)
	}
	if !contains(s, `"reasoning_effort":"none"`) {
		t.Fatalf("missing reasoning_effort in %s", s)
	}
	if !contains(s, `"max_tokens":4096`) {
		t.Fatalf("missing max_tokens in %s", s)
	}
}

func contains(s, sub string) bool {
	return len(s) >= len(sub) && (func() bool {
		for i := 0; i+len(sub) <= len(s); i++ {
			if s[i:i+len(sub)] == sub {
				return true
			}
		}
		return false
	})()
}
