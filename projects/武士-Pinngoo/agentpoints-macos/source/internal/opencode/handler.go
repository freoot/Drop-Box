// opencode 池的 HTTP 入口：OpenAI 兼容 chat + 模型目录 + 状态探测。
// 由 server.Handler 的 opencodeRoute 分流进入（裸名命中或 "opencode/" 前缀），
// 响应必须保持 OpenAI 形态 —— serveProxiedChat 靠响应尾部的 usage 记账。
package opencode

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/linguo2625469/workbuddy2api-panel/internal/relaymetrics"
)

// Handler 返回池的 HTTP 入口（/v1/chat/completions、/v1/models、/healthz、/status）。
func (e *Engine) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if e.Healthy() {
			w.Write([]byte(`{"ok":true}`))
			return
		}
		w.WriteHeader(http.StatusServiceUnavailable)
		w.Write([]byte(`{"ok":false,"error":"opencode 桌面版未运行"}`))
	})
	mux.HandleFunc("GET /v1/models", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{"object": "list", "data": e.Models()})
	})
	mux.HandleFunc("POST /v1/chat/completions", e.handleChat)
	mux.HandleFunc("GET /status", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, e.Status())
	})
	return mux
}

// chatRequest 只取本池用得到的字段（其余字段忽略：opencode 侧没有对应概念）。
type chatRequest struct {
	Model    string `json:"model"`
	Stream   bool   `json:"stream"`
	Messages []struct {
		Role    string          `json:"role"`
		Content json.RawMessage `json:"content"`
	} `json:"messages"`
}

// contentText 兼容 content 为字符串或分段数组两种形态。
func contentText(raw json.RawMessage) string {
	if len(raw) == 0 {
		return ""
	}
	var s string
	if json.Unmarshal(raw, &s) == nil {
		return s
	}
	var parts []struct {
		Type string `json:"type"`
		Text string `json:"text"`
	}
	if json.Unmarshal(raw, &parts) == nil {
		var b strings.Builder
		for _, p := range parts {
			if p.Type == "text" {
				b.WriteString(p.Text)
			}
		}
		return b.String()
	}
	return ""
}

// buildPrompt 把多轮 OpenAI 消息折叠成 opencode 的单条 user 输入。
// opencode 侧没有多轮概念（每轮都是新会话），历史必须内联进 prompt；
// 最后一轮 user 内容放最后，角色标签让模型能分清说话人。
func buildPrompt(req *chatRequest) string {
	var b strings.Builder
	n := len(req.Messages)
	for i, m := range req.Messages {
		text := strings.TrimSpace(contentText(m.Content))
		if text == "" {
			continue
		}
		last := i == n-1
		switch m.Role {
		case "system":
			b.WriteString("[系统指令]\n" + text + "\n\n")
		case "assistant":
			if !last {
				b.WriteString("[你之前的回复]\n" + text + "\n\n")
			}
		case "user":
			if !last {
				b.WriteString("[用户]\n" + text + "\n\n")
			} else {
				b.WriteString(text)
			}
		default:
			b.WriteString("[" + m.Role + "]\n" + text + "\n\n")
		}
	}
	return strings.TrimSpace(b.String())
}

func (e *Engine) handleChat(w http.ResponseWriter, r *http.Request) {
	var req chatRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid_request_error", "解析请求体失败: "+err.Error())
		return
	}
	model := strings.TrimSpace(req.Model)
	model = strings.TrimPrefix(model, "opencode/")
	if model == "" || model == "auto" {
		writeErr(w, http.StatusBadRequest, "invalid_request_error", "缺少 model")
		return
	}
	if !e.KnownModel(model) {
		writeErr(w, http.StatusNotFound, "model_not_found",
			"模型 "+model+" 不在 opencode 免费目录中（见 /opencode/v1/models）")
		return
	}
	// -free 别名还原：调用方用裸名（如 deepseek-v4.1-flash）时，实际转发
	// 目录里的 deepseek-v4.1-flash-free（见 ResolveModel）。
	if resolved, ok := e.ResolveModel(model); ok {
		model = resolved
	}
	prompt := buildPrompt(&req)
	if prompt == "" {
		writeErr(w, http.StatusBadRequest, "invalid_request_error", "messages 为空或无文本内容")
		return
	}
	if !e.Healthy() {
		writeErr(w, http.StatusServiceUnavailable, "upstream_unavailable",
			"opencode 桌面版未运行（本池桥接依赖本机 opencode 常驻）")
		return
	}

	// 池级运行态指标（面板「成功/失败/在途」卡）：Generate 出错即失败。
	rmDone := relaymetrics.Enter("opencode")
	okDone := false
	defer func() { rmDone(okDone) }()

	ctx, cancel := context.WithTimeout(r.Context(), e.cfg.Timeout+30*time.Second)
	defer cancel()
	var onDelta func(string)
	if req.Stream {
		prepareSSE(w)
		// 首帧先发 role 占位，语义对齐标准流式。
		writeChunk(w, model, "", "role", nil)
		flush(w)
		onDelta = func(delta string) { writeChunk(w, model, delta, "", nil); flush(w) }
	}
	res, err := e.Generate(ctx, model, prompt, onDelta)
	if err != nil {
		if req.Stream {
			// 已开流：按 SSE 错误帧收尾，客户端能看到原因。
			writeSSEError(w, err)
			return
		}
		writeGenerateError(w, err)
		return
	}
	okDone = true
	if req.Stream {
		writeChunk(w, model, "", "", strPtr("stop"))
		writeChunk(w, model, "", "", nil) // 收尾帧不带 finish（部分客户端校验唯一 finish）
		writeUsageChunk(w, model, res)
		writeSSE(w, "data: [DONE]\n\n")
		flush(w)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"id":      "chatcmpl-oc" + fmt.Sprint(time.Now().UnixNano()),
		"object":  "chat.completion",
		"created": time.Now().Unix(),
		"model":   model,
		"choices": []any{map[string]any{
			"index":         0,
			"message":       map[string]any{"role": "assistant", "content": res.Text},
			"finish_reason": "stop",
		}},
		"usage": map[string]any{
			"prompt_tokens":     res.PromptTokens,
			"completion_tokens": res.OutputTokens,
			"total_tokens":      res.PromptTokens + res.OutputTokens,
		},
	})
}

// ---- 响应工具 ----

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, code int, typ, msg string) {
	writeJSON(w, code, map[string]any{"error": map[string]any{
		"message": msg, "type": typ, "code": code,
	}})
}

func prepareSSE(w http.ResponseWriter) {
	h := w.Header()
	h.Set("Content-Type", "text/event-stream")
	h.Set("Cache-Control", "no-cache")
	h.Set("Connection", "keep-alive")
}

func writeSSE(w http.ResponseWriter, s string) { _, _ = w.Write([]byte(s)) }

func flush(w http.ResponseWriter) {
	if f, ok := w.(http.Flusher); ok {
		f.Flush()
	}
}

func strPtr(s string) *string { return &s }

func writeChunk(w http.ResponseWriter, model, delta, role string, finish *string) {
	m := map[string]any{
		"id":      "chatcmpl-oc" + fmt.Sprint(time.Now().UnixNano()),
		"object":  "chat.completion.chunk",
		"model":   model,
		"choices": []any{map[string]any{"index": 0, "finish_reason": finish}},
	}
	d := map[string]any{}
	if role != "" {
		d["role"] = role
	}
	if delta != "" {
		d["content"] = delta
	}
	if role != "" || delta != "" {
		m["choices"].([]any)[0].(map[string]any)["delta"] = d
	}
	b, _ := json.Marshal(m)
	writeSSE(w, "data: "+string(b)+"\n\n")
}

func writeUsageChunk(w http.ResponseWriter, model string, res GenerateResult) {
	m := map[string]any{
		"id":      "chatcmpl-oc" + fmt.Sprint(time.Now().UnixNano()),
		"object":  "chat.completion.chunk",
		"model":   model,
		"choices": []any{},
		"usage": map[string]any{
			"prompt_tokens":     res.PromptTokens,
			"completion_tokens": res.OutputTokens,
			"total_tokens":      res.PromptTokens + res.OutputTokens,
		},
	}
	b, _ := json.Marshal(m)
	writeSSE(w, "data: "+string(b)+"\n\n")
}

func writeSSEError(w http.ResponseWriter, err error) {
	msg := err.Error()
	code := "upstream_error"
	if IsFreeTierGate(err) {
		code = "free_tier_gate"
		msg = "opencode 免费层闸门拦截（其 session 桥接姿势可能已被上游收紧）"
	} else if IsUnavailable(err) {
		code = "upstream_unavailable"
	}
	b, _ := json.Marshal(map[string]any{"error": map[string]any{
		"message": msg, "type": code, "code": 502,
	}})
	writeSSE(w, "data: "+string(b)+"\n\ndata: [DONE]\n\n")
	flush(w)
}

func writeGenerateError(w http.ResponseWriter, err error) {
	if IsUnavailable(err) {
		writeErr(w, http.StatusServiceUnavailable, "upstream_unavailable", err.Error())
		return
	}
	if IsFreeTierGate(err) {
		writeErr(w, http.StatusBadGateway, "free_tier_gate", err.Error())
		return
	}
	var he *HTTPError
	if asHTTPError(err, &he) {
		writeErr(w, http.StatusBadGateway, "upstream_error", he.Error())
		return
	}
	writeErr(w, http.StatusBadGateway, "upstream_error", err.Error())
}
