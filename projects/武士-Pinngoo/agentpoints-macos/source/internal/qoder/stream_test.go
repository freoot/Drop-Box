package qoder

import (
	"encoding/json"
	"strings"
	"testing"
)

// TestAggregateNonStreamKeepsContent 回归：非流式聚合必须真的把内容聚合出来。
//
// 背景（真实事故）：chunk 在产出前已经由 extractDelta 把「网关信封」转过一次，
// 而 aggregateNonStream 又拿同一个信封解析器去解**OpenAI chunk**——信封解析器只认
// 顶层 "body" 字符串，于是在 OpenAI chunk 上永远得到空增量：content 空、
// reasoning 空、usage 全 0、finish_reason 靠默认值凑成 stop。上游一切正常，
// 客户端却收到空回复，排查成本极高。
func TestAggregateNonStreamKeepsContent(t *testing.T) {
	lw := &listWriter{}
	var usageObj *usage
	acc := newStreamAccumulator("chatcmpl-t", 1, "Qwen3.7-Max", false, lw.writeChunk)

	// 与网关实际下发一致的帧序列（信封形态 + Qwen 独立 usage 帧）。
	frames := []string{
		`{"body":"{\"choices\":[{\"delta\":{\"content\":\"\",\"reasoning_content\":\"\",\"role\":\"assistant\"},\"index\":0}],\"model\":\"auto\"}"}`,
		`{"body":"{\"choices\":[{\"delta\":{\"content\":\"\",\"reasoning_content\":\"想一下\"},\"index\":0}]}"}`,
		`{"body":"{\"choices\":[{\"delta\":{\"content\":\"收到\",\"reasoning_content\":\"\"},\"index\":0}]}"}`,
		`{"body":"{\"choices\":[{\"delta\":{\"content\":\"\",\"reasoning_content\":\"\"},\"finish_reason\":\"stop\",\"index\":0}]}"}`,
		`{"body":"{\"choices\":[],\"usage\":{\"prompt_tokens\":14,\"completion_tokens\":19,\"total_tokens\":33,\"credits\":0.0189,\"billable\":true}}"}`,
	}
	for _, f := range frames {
		d := extractDelta(f)
		if d.Usage != nil {
			usageObj = d.Usage
		}
		if !d.isEmpty() {
			acc.accept(d)
		}
	}
	acc.flush()
	if len(lw.snapshot()) == 0 {
		t.Fatal("累加器没有产出任何 chunk")
	}

	resp := aggregateNonStream(lw.snapshot(), "chatcmpl-t", 1, "Qwen3.7-Max", false, usageObj)
	raw, err := marshalNoEscape(resp)
	if err != nil {
		t.Fatal(err)
	}
	got := string(raw)
	for _, want := range []string{
		`"content":"收到"`,
		`"reasoning_content":"想一下"`,
		`"finish_reason":"stop"`,
		`"prompt_tokens":14`,
		`"completion_tokens":19`,
	} {
		if !strings.Contains(got, want) {
			t.Errorf("非流式聚合缺少 %s\n得到：%s", want, got)
		}
	}
}

// TestParseOpenAIChunkNotEnvelope OpenAI chunk 解析器与网关信封解析器必须互不混淆：
// 拿信封帧喂 parseOpenAIChunk、拿 OpenAI chunk 喂 extractDelta，都应得到空增量。
func TestParseOpenAIChunkNotEnvelope(t *testing.T) {
	envelope := `{"body":"{\"choices\":[{\"delta\":{\"content\":\"X\"}}]}"}`
	if d := parseOpenAIChunk(envelope); d.Content != "" {
		t.Errorf("信封帧不该被 OpenAI chunk 解析器读出内容：%q", d.Content)
	}
	chunkRaw, _ := json.Marshal(map[string]interface{}{
		"choices": []interface{}{map[string]interface{}{
			"delta": map[string]interface{}{"content": "X"},
		}},
	})
	if d := extractDelta(string(chunkRaw)); d.Content != "" {
		t.Errorf("OpenAI chunk 不该被信封解析器读出内容：%q", d.Content)
	}
	if d := parseOpenAIChunk(string(chunkRaw)); d.Content != "X" {
		t.Errorf("OpenAI chunk 解析器应读出 X，得到 %q", d.Content)
	}
}
