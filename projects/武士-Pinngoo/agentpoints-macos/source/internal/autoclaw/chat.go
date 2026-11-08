package autoclaw

// chat 链路（移植自 bridge.py chat/_dispatch/_stream_out/RelayConverter 等）：
// 三通道分发（proxy → sandbox-openai → relay）、OpenAI 兼容 SSE 输出、
// relay 事件流到 OpenAI chunk 的转换、非流式聚合。

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/linguo2625469/workbuddy2api-panel/internal/relaymetrics"
)

// ---- 模型名工具（移植 _peek_model/_is_agent_target/_normalize_model 等）----

func peekModel(body []byte) string {
	var obj struct {
		Model string `json:"model"`
	}
	if json.Unmarshal(body, &obj) != nil {
		return ""
	}
	return strings.TrimSpace(obj.Model)
}

func isAgentTarget(model string) bool {
	m := strings.ToLower(strings.TrimSpace(model))
	if m == "openclaw" || m == "openclaw/default" {
		return true
	}
	return strings.HasPrefix(m, "openclaw/") || strings.HasPrefix(m, "openclaw:") || strings.HasPrefix(m, "agent:")
}

// normalizeModel → (agent模型, x-openclaw-model 后端模型)。
func normalizeModel(model string) (string, string) {
	m := strings.TrimSpace(model)
	if m == "" {
		return "openclaw", ""
	}
	if isAgentTarget(m) {
		return m, ""
	}
	return "openclaw", m
}

// prepareModelBody agent 目标时把 model 统一为 openclaw（原样返回否则）。
func prepareModelBody(body []byte) []byte {
	var obj map[string]any
	if json.Unmarshal(body, &obj) != nil {
		return body
	}
	_, xm := normalizeModel(toString(obj["model"]))
	if xm == "" {
		return body
	}
	obj["model"] = "openclaw"
	out, err := json.Marshal(obj)
	if err != nil {
		return body
	}
	return out
}

// prepareProxyBody proxy 通道 body：覆盖 model、去掉 user 字段。
func prepareProxyBody(body []byte, model string) []byte {
	var obj map[string]any
	if json.Unmarshal(body, &obj) != nil {
		return body
	}
	if model != "" {
		obj["model"] = model
	}
	delete(obj, "user")
	out, err := json.Marshal(obj)
	if err != nil {
		return body
	}
	return out
}

// stripRoutePrefix global/zai_auto → zai_auto；cn/xxx → xxx；其余原样。
func stripRoutePrefix(model string) string {
	for _, p := range []string{"global/", "cn/"} {
		if strings.HasPrefix(model, p) {
			return model[len(p):]
		}
	}
	return model
}

// requestModelHeader relay send 的 x-openclaw-model 头值（agent 目标不带）。
func requestModelHeader(body []byte) string {
	m := peekModel(body)
	if m == "" || isAgentTarget(m) {
		return ""
	}
	return stripRoutePrefix(m)
}

func stripRegionPrefix(model string) string {
	low := strings.ToLower(model)
	for _, p := range []string{"global/", "cn/", "global:", "cn:"} {
		if strings.HasPrefix(low, p) {
			return model[len(p):]
		}
	}
	return model
}

func validateChatBody(body []byte) string {
	var req struct {
		Messages []json.RawMessage `json:"messages"`
	}
	if json.Unmarshal(body, &req) != nil {
		return "invalid JSON body"
	}
	if len(req.Messages) == 0 {
		return "messages must be a non-empty array"
	}
	for _, m := range req.Messages {
		var mm struct {
			Role string `json:"role"`
		}
		if json.Unmarshal(m, &mm) == nil && mm.Role == "user" {
			return ""
		}
	}
	return "messages must contain at least one user message"
}

func notEnabled(status int, body string) bool {
	if status == 404 || status == 501 {
		return true
	}
	if status == 400 {
		lower := strings.ToLower(body)
		for _, k := range []string{"chatcompletions", "endpoint", "not enabled", "disabled"} {
			if strings.Contains(lower, k) {
				return true
			}
		}
	}
	return false
}

// ---- SSE 输出 ----

type sseWriter struct {
	w  http.ResponseWriter
	fl http.Flusher
	mu sync.Mutex
}

func newSSEWriter(w http.ResponseWriter) *sseWriter {
	fl, _ := w.(http.Flusher)
	return &sseWriter{w: w, fl: fl}
}

func writeSSEHeaders(w http.ResponseWriter) {
	h := w.Header()
	h.Set("Content-Type", "text/event-stream")
	h.Set("Cache-Control", "no-cache")
	h.Set("Connection", "close")
	h.Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)
	if fl, ok := w.(http.Flusher); ok {
		fl.Flush()
	}
}

func (s *sseWriter) writeData(payload string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	fmt.Fprintf(s.w, "data: %s\n\n", payload)
	if s.fl != nil {
		s.fl.Flush()
	}
}

func (s *sseWriter) writeDone() {
	s.mu.Lock()
	defer s.mu.Unlock()
	io.WriteString(s.w, "data: [DONE]\n\n")
	if s.fl != nil {
		s.fl.Flush()
	}
}

// listWriter 非流式聚合用的内存缓冲。
type listWriter struct {
	mu    sync.Mutex
	lines []string
}

func (l *listWriter) writeData(payload string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.lines = append(l.lines, "data: "+payload+"\n")
}

func (l *listWriter) writeDone() {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.lines = append(l.lines, "data: [DONE]\n")
}

func (l *listWriter) snapshot() []string {
	l.mu.Lock()
	defer l.mu.Unlock()
	out := make([]string, len(l.lines))
	copy(out, l.lines)
	return out
}

// ---- RelayConverter：/api/events 事件流 → OpenAI chunk ----

type relayConverter struct {
	runID   string
	session string
	model   string
	out     interface {
		writeData(string)
		writeDone()
	}
	id        string
	created   int64
	lastText  string
	toolSeq   int
	seenTools map[string]bool
	done      bool
	// onUsage 上游 usage 末帧回调（账号级用量记账；nil 安全）。
	onUsage func(in, out, total int64)
}

func newRelayConverter(runID, session string, body []byte, out interface {
	writeData(string)
	writeDone()
}) *relayConverter {
	return &relayConverter{
		runID:     runID,
		session:   session,
		model:     peekModel(body),
		out:       out,
		id:        fmt.Sprintf("chatcmpl-%d", time.Now().UnixNano()),
		created:   time.Now().Unix(),
		seenTools: map[string]bool{},
	}
}

func (c *relayConverter) run(lines func(yield func(string) bool)) {
	var buf []string
	flush := func() {
		if len(buf) > 0 {
			c.handleFrame(strings.Join(buf, "\n"))
			buf = buf[:0]
		}
	}
	stop := false
	lines(func(line string) bool {
		line = strings.TrimRight(line, "\r\n")
		if line == "" {
			flush()
			if c.done {
				stop = true
				return false
			}
			return true
		}
		buf = append(buf, line)
		return true
	})
	flush()
	if !c.done {
		c.finish()
	}
	_ = stop
}

func (c *relayConverter) handleFrame(raw string) {
	if c.done {
		return
	}
	data := ""
	for _, line := range strings.Split(raw, "\n") {
		if strings.HasPrefix(line, "data:") {
			data += line[5:]
		}
	}
	if data == "" {
		return
	}
	var ev struct {
		Event   string         `json:"event"`
		Payload map[string]any `json:"payload"`
	}
	if json.Unmarshal([]byte(data), &ev) != nil {
		return
	}
	if ev.Payload == nil {
		return
	}
	c.handle(ev.Event, ev.Payload)
}

func (c *relayConverter) handle(event string, payload map[string]any) {
	runID := toString(payload["runId"])
	sk := toString(payload["sessionKey"])
	to := toString(payload["to"])
	sameRun := runID != "" && c.runID != "" && runID == c.runID
	sameSession := (sk != "" && sk == c.session) || (to != "" && to == c.session)
	if !sameRun && !(sameSession && runID == "") {
		return
	}
	switch event {
	case "agent:stream", "stream", "chat:message", "chat.delta":
		c.handleAgentStream(payload)
	case "chat":
		c.handleChat(payload)
	case "agent":
		c.handleAgent(payload)
	}
}

func (c *relayConverter) handleAgentStream(payload map[string]any) {
	if c.done {
		return
	}
	typ := toString(payload["type"])
	switch typ {
	case "error":
		c.emitError(payloadMsg(payload))
	case "done":
		c.emitUsageDone(extractUsage(payload))
	case "text":
		delta := toString(payload["delta"])
		if delta == "" {
			delta = toString(payload["text"])
		}
		c.emitText(delta)
	case "thinking":
		t := toString(payload["text"])
		if t == "" {
			t = toString(payload["delta"])
		}
		c.emitThinking(t)
	case "tool_call", "tool_use":
		name := toString(payload["name"])
		if name == "" {
			name = toString(payload["tool"])
		}
		if name != "" {
			c.emitToolUse(toString(payload["id"]), name, orInput(payload))
		}
	}
	if msg, ok := payload["message"].(map[string]any); ok {
		switch ct := msg["content"].(type) {
		case string:
			c.emitText(ct)
		case []any:
			c.emitParts(ct)
		}
	}
}

func (c *relayConverter) handleChat(payload map[string]any) {
	state := toString(payload["state"])
	if state == "error" {
		c.emitError(payloadMsg(payload))
		return
	}
	msg, _ := payload["message"].(map[string]any)
	if msg == nil {
		if state == "final" {
			if u := extractUsage(payload); u != nil {
				c.emitUsageDone(u)
			}
		}
		return
	}
	switch ct := msg["content"].(type) {
	case string:
		c.emitText(ct)
	case []any:
		c.emitParts(ct)
	}
	if tcs, ok := msg["toolCalls"].([]any); ok {
		for _, tc := range tcs {
			tcm, ok := tc.(map[string]any)
			if !ok {
				continue
			}
			name := toString(tcm["name"])
			if name == "" {
				if fn, ok := tcm["function"].(map[string]any); ok {
					name = toString(fn["name"])
				}
			}
			if name != "" {
				c.emitToolUse(toString(tcm["id"]), name, orInput(tcm))
			}
		}
	}
	if state == "final" {
		if u := extractUsage(payload["usage"]); u != nil {
			c.emitUsageDone(u)
		} else if u := extractUsage(payload); u != nil {
			c.emitUsageDone(u)
		}
	}
}

func (c *relayConverter) handleAgent(payload map[string]any) {
	stream := toString(payload["stream"])
	data, _ := payload["data"].(map[string]any)
	if data == nil {
		data = payload
	}
	switch stream {
	case "assistant":
		parts, ok := data["content"].([]any)
		if !ok {
			parts, ok = data["blocks"].([]any)
		}
		if ok {
			c.emitParts(parts)
		} else {
			t := toString(data["text"])
			if t == "" {
				t = toString(data["delta"])
			}
			c.emitText(t)
		}
	case "tool":
		if toString(data["phase"]) == "start" {
			if name := toString(data["name"]); name != "" {
				in := data["args"]
				if in == nil {
					in = data["input"]
				}
				c.emitToolUse(toString(data["toolCallId"]), name, in)
			}
		}
	case "lifecycle":
		switch toString(data["phase"]) {
		case "end":
			if u := extractUsage(data["usage"]); u != nil {
				c.emitUsageDone(u)
			} else if u := extractUsage(payload); u != nil {
				c.emitUsageDone(u)
			}
		case "error":
			c.emitError(payloadMsg(data))
		}
	case "error":
		c.emitError(payloadMsg(data))
	}
}

func (c *relayConverter) emitText(text string) {
	if text == "" || text == c.lastText {
		return
	}
	delta := text
	if strings.HasPrefix(text, c.lastText) {
		delta = text[len(c.lastText):]
	}
	c.lastText = text
	if delta != "" {
		c.chunk(map[string]any{
			"choices": []map[string]any{{"index": 0, "delta": map[string]any{"content": delta}, "finish_reason": nil}},
		})
	}
}

func (c *relayConverter) emitThinking(text string) {
	if text == "" {
		return
	}
	c.chunk(map[string]any{
		"choices": []map[string]any{{"index": 0, "delta": map[string]any{"reasoning_content": text}, "finish_reason": nil}},
	})
}

func (c *relayConverter) emitToolUse(tid, name string, input any) {
	if tid == "" {
		tid = fmt.Sprintf("%s-%d", name, c.toolSeq)
	}
	if c.seenTools[tid] {
		return
	}
	c.seenTools[tid] = true
	args := ""
	if input != nil {
		if s, ok := input.(string); ok {
			args = s
		} else if raw, err := json.Marshal(input); err == nil {
			args = string(raw)
		}
	}
	idx := c.toolSeq
	c.toolSeq++
	c.chunk(map[string]any{
		"choices": []map[string]any{{"index": 0, "delta": map[string]any{"tool_calls": []map[string]any{
			{"index": idx, "id": tid, "type": "function", "function": map[string]any{"name": name, "arguments": args}},
		}}, "finish_reason": nil}},
	})
}

func (c *relayConverter) emitUsageDone(usage map[string]any) {
	chunk := map[string]any{
		"choices": []map[string]any{{"index": 0, "delta": map[string]any{}, "finish_reason": "stop"}},
	}
	if usage != nil {
		in := usage["input"]
		if in == nil {
			in = usage["prompt_tokens"]
		}
		out := usage["output"]
		if out == nil {
			out = usage["completion_tokens"]
		}
		total := usage["total"]
		if total == nil {
			total = usage["total_tokens"]
		}
		chunk["usage"] = map[string]any{
			"prompt_tokens":     toInt64(in),
			"completion_tokens": toInt64(out),
			"total_tokens":      toInt64(total),
		}
		if c.onUsage != nil {
			c.onUsage(toInt64(in), toInt64(out), toInt64(total))
		}
	}
	c.chunk(chunk)
	c.finish()
}

func (c *relayConverter) emitError(msg string) {
	if msg != "" {
		c.emitText(msg)
	}
	c.chunk(map[string]any{
		"choices": []map[string]any{{"index": 0, "delta": map[string]any{}, "finish_reason": "stop"}},
	})
	c.finish()
}

func (c *relayConverter) emitParts(parts []any) {
	for _, p := range parts {
		pm, ok := p.(map[string]any)
		if !ok {
			continue
		}
		switch toString(pm["type"]) {
		case "text":
			c.emitText(toString(pm["text"]))
		case "thinking":
			c.emitThinking(toString(pm["thinking"]))
		case "tool_use", "toolCall":
			if name := toString(pm["name"]); name != "" {
				in := pm["input"]
				if in == nil {
					in = pm["arguments"]
				}
				c.emitToolUse(toString(pm["id"]), name, in)
			}
		}
	}
}

func (c *relayConverter) chunk(chunk map[string]any) {
	chunk["id"] = c.id
	chunk["object"] = "chat.completion.chunk"
	chunk["created"] = c.created
	chunk["model"] = c.model
	raw, err := json.Marshal(chunk)
	if err != nil {
		return
	}
	c.out.writeData(string(raw))
}

func (c *relayConverter) finish() {
	if c.done {
		return
	}
	c.done = true
	c.out.writeDone()
}

// orInput Python 的 payload.get("input", payload.get("arguments"))。
func orInput(m map[string]any) any {
	if v, ok := m["input"]; ok {
		return v
	}
	return m["arguments"]
}

// payloadMsg 移植 _payload_msg：从错误 payload 里抽可读消息。
func payloadMsg(m map[string]any) string {
	if len(m) == 0 {
		return "agent request failed (upstream error event, no detail)"
	}
	for _, k := range []string{"message", "error", "msg", "detail", "text", "delta"} {
		if v, ok := m[k].(string); ok && strings.TrimSpace(v) != "" {
			return strings.TrimSpace(v)
		}
	}
	typ := toString(m["type"])
	if typ == "" {
		typ = "error"
	}
	parts := []string{"agent request failed", typ}
	for _, k := range []string{"code", "phase", "runId"} {
		if v := toString(m[k]); v != "" {
			parts = append(parts, k+"="+v)
		}
	}
	return strings.Join(parts, " ")
}

// hasUsage / extractUsage 移植。
func hasUsage(m map[string]any) bool {
	for _, k := range []string{"input", "output", "total", "inputTokens", "outputTokens", "totalTokens",
		"prompt_tokens", "completion_tokens", "total_tokens"} {
		if _, ok := m[k]; ok {
			return true
		}
	}
	return false
}

func extractUsage(m any) map[string]any {
	mm, ok := m.(map[string]any)
	if !ok {
		return nil
	}
	if u, ok := mm["usage"].(map[string]any); ok && hasUsage(u) {
		return u
	}
	if hasUsage(mm) {
		return mm
	}
	if r, ok := mm["result"].(map[string]any); ok {
		if hasUsage(r) {
			return r
		}
		if u, ok := r["usage"].(map[string]any); ok {
			return u
		}
	}
	return nil
}

// ---- relay chat 请求构建（移植 _build_relay_chat_req / _extract_run_id）----

func contentPartsText(parts []any) string {
	sb := strings.Builder{}
	for _, p := range parts {
		pm, ok := p.(map[string]any)
		if !ok {
			continue
		}
		if toString(pm["type"]) == "text" {
			if t, ok := pm["text"].(string); ok {
				sb.WriteString(t)
			}
		}
	}
	return strings.TrimSpace(sb.String())
}

func buildRelayChatReq(body []byte) (map[string]any, error) {
	var obj struct {
		User     string `json:"user"`
		Thinking string `json:"reasoning_effort"`
		Messages []struct {
			Role    string          `json:"role"`
			Content json.RawMessage `json:"content"`
		} `json:"messages"`
	}
	if err := json.Unmarshal(body, &obj); err != nil {
		return nil, err
	}
	req := map[string]any{"sessionKey": strings.TrimSpace(obj.User), }
	if req["sessionKey"] == "" {
		req["sessionKey"] = "main"
	}
	message := ""
	for i := len(obj.Messages) - 1; i >= 0; i-- {
		m := obj.Messages[i]
		if m.Role != "user" {
			continue
		}
		var s string
		if json.Unmarshal(m.Content, &s) == nil {
			message = strings.TrimSpace(s)
			if message != "" {
				break
			}
			continue
		}
		var parts []any
		if json.Unmarshal(m.Content, &parts) == nil {
			message = contentPartsText(parts)
			if message != "" {
				break
			}
		}
	}
	if message == "" {
		return nil, fmt.Errorf("no user text message found")
	}
	req["message"] = message
	if t := strings.TrimSpace(obj.Thinking); t != "" {
		req["thinking"] = t
	}
	return req, nil
}

func extractRunID(data any) string {
	switch v := data.(type) {
	case string:
		return strings.TrimSpace(v)
	case map[string]any:
		for _, k := range []string{"runId", "run_id"} {
			if s, ok := v[k].(string); ok && strings.TrimSpace(s) != "" {
				return strings.TrimSpace(s)
			}
		}
	}
	return ""
}

// ---- relay chat：设备上线 WS + 事件流 + send ----

// openDeviceWS 设备上线注入（失败仅告警，不阻断——Python 同款语义）。
func (u *upstream) openDeviceWS(a *Auth) (func(), error) {
	a.mu.Lock()
	base := a.SandboxEndpoint
	sandboxID := a.SandboxID
	a.mu.Unlock()
	if base == "" || !strings.Contains(base, "/proxy/") {
		return nil, fmt.Errorf("no proxy endpoint")
	}
	bare := relayBaseFromProxy(base)
	token := stripBearer(a.AccessToken)
	wsURL := fmt.Sprintf("%s/v1/client/ws?device_id=%s&access_token=%s", toWSBase(bare), sandboxID, token)
	dialer := websocket.Dialer{HandshakeTimeout: 30 * time.Second, TLSClientConfig: insecureTLS()}
	conn, _, err := dialer.Dial(wsURL, nil)
	if err != nil {
		return nil, err
	}
	frame := map[string]any{
		"type":           "auth.inject",
		"token":          token,
		"clientMetadata": map[string]any{"client_type": "web"},
	}
	if a.UserID != "" {
		frame["userId"] = a.UserID
	}
	if a.UserName != "" {
		frame["userName"] = a.UserName
	}
	if err := conn.WriteJSON(frame); err != nil {
		conn.Close()
		return nil, err
	}
	deadline := time.Now().Add(25 * time.Second)
	for time.Now().Before(deadline) {
		conn.SetReadDeadline(deadline)
		var m map[string]any
		if err := conn.ReadJSON(&m); err != nil {
			conn.Close()
			return nil, fmt.Errorf("auth wait: %v", err)
		}
		switch toString(m["type"]) {
		case "auth.inject.ok":
			return func() { conn.Close() }, nil
		case "auth.inject.error":
			conn.Close()
			raw, _ := json.Marshal(m)
			return nil, fmt.Errorf("auth.inject failed: %s", string(raw))
		}
	}
	conn.Close()
	return nil, fmt.Errorf("auth.inject timeout")
}

// openRelayEvents 打开 /api/events SSE（调用方负责 Close）。
func (u *upstream) openRelayEvents(a *Auth, base string) (*http.Response, error) {
	req, err := http.NewRequest(http.MethodGet, strings.TrimRight(base, "/")+"/api/events", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "text/event-stream")
	if a.AccessToken != "" {
		req.Header.Set("Authorization", bearer(a.AccessToken))
	}
	resp, err := u.http.Do(req)
	if err != nil {
		return nil, upstreamErrf("server", 0, 0, "%v", err)
	}
	if resp.StatusCode >= 400 {
		raw, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
		resp.Body.Close()
		return nil, upstreamErrf(classify(resp.StatusCode, 0, string(raw)), resp.StatusCode, 0, "%.200s", string(raw))
	}
	return resp, nil
}

// relayStart relay 三步：WS 上线 → events → send；返回 runID、session、事件流。
func (u *upstream) relayStart(a *Auth, body []byte) (runID, session string, events *http.Response, closeWS func(), err error) {
	a.mu.Lock()
	base := a.SandboxEndpoint
	a.mu.Unlock()
	if base == "" {
		return "", "", nil, nil, upstreamErrf("client", 0, 0, "no sandbox endpoint for account %s", a.UserID)
	}
	reqObj, err := buildRelayChatReq(body)
	if err != nil {
		return "", "", nil, nil, upstreamErrf("client", 0, 0, "%v", err)
	}
	session = toString(reqObj["sessionKey"])
	if ws, werr := u.openDeviceWS(a); werr != nil {
		log.Printf("warn: device online ws: %v (fallback to http bridge)", werr)
	} else {
		closeWS = ws
	}
	events, err = u.openRelayEvents(a, base)
	if err != nil {
		if closeWS != nil {
			closeWS()
		}
		return "", "", nil, nil, err
	}
	sendBody := map[string]any{"args": []any{reqObj}}
	headers := map[string]string{
		"Accept":       "application/json, text/plain, */*",
		"Content-Type": "application/json",
	}
	if a.AccessToken != "" {
		headers["Authorization"] = bearer(a.AccessToken)
	}
	if xm := requestModelHeader(body); xm != "" {
		headers["x-openclaw-model"] = stripRoutePrefix(xm)
	}
	req, err := http.NewRequest(http.MethodPost, strings.TrimRight(base, "/")+"/api/electron/agent/send", marshalReader(sendBody))
	if err != nil {
		events.Body.Close()
		if closeWS != nil {
			closeWS()
		}
		return "", "", nil, nil, err
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	resp, err := u.http.Do(req)
	if err != nil {
		events.Body.Close()
		if closeWS != nil {
			closeWS()
		}
		return "", "", nil, nil, upstreamErrf("server", 0, 0, "%v", err)
	}
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	resp.Body.Close()
	text := string(raw)
	if resp.StatusCode >= 400 {
		events.Body.Close()
		if closeWS != nil {
			closeWS()
		}
		return "", "", nil, nil, upstreamErrf(classify(resp.StatusCode, 0, text), resp.StatusCode, 0, "%.200s", text)
	}
	var env struct {
		OK    *bool `json:"ok"`
		Code  any   `json:"code"`
		Error any   `json:"error"`
		Msg   any   `json:"msg"`
		Data  any   `json:"data"`
	}
	if json.Unmarshal(raw, &env) == nil {
		code := toInt64(env.Code)
		msg := toString(env.Error)
		if msg == "" {
			msg = toString(env.Msg)
		}
		if (env.OK != nil && !*env.OK) || (env.Code != nil && code != 0) {
			events.Body.Close()
			if closeWS != nil {
				closeWS()
			}
			return "", "", nil, nil, upstreamErrf(classify(resp.StatusCode, code, msg), resp.StatusCode, code, "%s", msg)
		}
		runID = extractRunID(env.Data)
		if runID == "" {
			runID = extractRunID(env)
		}
	}
	return runID, session, events, closeWS, nil
}

// convertRelayEvents 消费事件流并输出 OpenAI SSE（结束时关闭事件流）。
func convertRelayEvents(events *http.Response, runID, session string, body []byte, out interface {
	writeData(string)
	writeDone()
}, closeWS func(), onUsage func(in, out, total int64)) {
	defer events.Body.Close()
	if closeWS != nil {
		defer closeWS()
	}
	cv := newRelayConverter(runID, session, body, out)
	cv.onUsage = onUsage
	scanner := bufio.NewScanner(events.Body)
	scanner.Buffer(make([]byte, 0, 256*1024), 8<<20)
	var buf []string
	flush := func() {
		if len(buf) > 0 {
			cv.handleFrame(strings.Join(buf, "\n"))
			buf = buf[:0]
		}
	}
	for scanner.Scan() {
		line := strings.TrimRight(scanner.Text(), "\r\n")
		if line == "" {
			flush()
			if cv.done {
				return
			}
			continue
		}
		buf = append(buf, line)
	}
	flush()
	if !cv.done {
		cv.finish()
	}
}

// ---- SSE 泵 / 聚合（移植 _pump_sse / _aggregate_sse / _single_chunk_sse）----

var finishRe = regexpFinishReason()

// pumpSSE proxy/openai 通道的 OpenAI SSE 原样透传（补齐 [DONE]）。
func pumpSSE(resp *http.Response, out *sseWriter) {
	sawDone := false
	finished := false
	defer resp.Body.Close()
	scanner := bufio.NewScanner(resp.Body)
	scanner.Buffer(make([]byte, 0, 256*1024), 8<<20)
	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "data: [DONE]") {
			sawDone = true
			out.writeDone()
			break
		}
		if !finished && strings.Contains(line, `"finish_reason"`) && finishRe.MatchString(line) {
			finished = true
		}
		out.mu.Lock()
		fmt.Fprintf(out.w, "%s\n", line)
		if out.fl != nil {
			out.fl.Flush()
		}
		out.mu.Unlock()
		if finished {
			out.writeDone()
			sawDone = true
			break
		}
	}
	if !sawDone {
		out.writeDone()
	}
}

// aggregateSSE 把 OpenAI SSE 流聚合为单个非流式 JSON 响应。
func aggregateSSE(lines []string) map[string]any {
	var content, reasoning []string
	role := "assistant"
	finish := "stop"
	var usage map[string]any
	ident, model := "", ""
	var created any
	toolCalls := map[int]map[string]any{}
	toolOrder := []int{}
	for _, line := range lines {
		line = strings.TrimRight(line, "\r\n")
		if !strings.HasPrefix(line, "data: ") {
			continue
		}
		payload := line[6:]
		if payload == "[DONE]" {
			break
		}
		var chunk struct {
			ID      string `json:"id"`
			Model   string `json:"model"`
			Created any    `json:"created"`
			Usage   map[string]any `json:"usage"`
			Choices []struct {
				FinishReason any    `json:"finish_reason"`
				Delta        map[string]any `json:"delta"`
			} `json:"choices"`
		}
		if json.Unmarshal([]byte(payload), &chunk) != nil {
			continue
		}
		if ident == "" && chunk.ID != "" {
			ident = chunk.ID
		}
		if model == "" && chunk.Model != "" {
			model = chunk.Model
		}
		if created == nil && chunk.Created != nil {
			created = chunk.Created
		}
		if chunk.Usage != nil {
			usage = chunk.Usage
		}
		for _, ch := range chunk.Choices {
			if s := toString(ch.FinishReason); s != "" {
				finish = s
			}
			delta := ch.Delta
			if delta == nil {
				continue
			}
			if r, ok := delta["role"].(string); ok && r != "" {
				role = r
			}
			if c, ok := delta["content"].(string); ok {
				content = append(content, c)
			}
			if rc, ok := delta["reasoning_content"].(string); ok {
				reasoning = append(reasoning, rc)
			}
			if tcs, ok := delta["tool_calls"].([]any); ok {
				for _, tc := range tcs {
					tcm, ok := tc.(map[string]any)
					if !ok {
						continue
					}
					idx := int(toInt64(tcm["index"]))
					merged, ok := toolCalls[idx]
					if !ok {
						merged = map[string]any{"index": idx}
						toolCalls[idx] = merged
						toolOrder = append(toolOrder, idx)
					}
					for _, k := range []string{"id", "type"} {
						if v := toString(tcm[k]); v != "" {
							merged[k] = v
						}
					}
					fn, _ := merged["function"].(map[string]any)
					if fn == nil {
						fn = map[string]any{}
						merged["function"] = fn
					}
					df, _ := tcm["function"].(map[string]any)
					if df != nil {
						if n := toString(df["name"]); n != "" {
							fn["name"] = n
						}
						if a := toString(df["arguments"]); a != "" {
							fn["arguments"] = toString(fn["arguments"]) + a
						}
					}
				}
			}
		}
	}
	message := map[string]any{"role": role, "content": strings.Join(content, "")}
	if len(reasoning) > 0 {
		message["reasoning_content"] = strings.Join(reasoning, "")
	}
	if len(toolOrder) > 0 {
		sortInts(toolOrder)
		tcs := make([]any, 0, len(toolOrder))
		for _, i := range toolOrder {
			tcs = append(tcs, toolCalls[i])
		}
		message["tool_calls"] = tcs
	}
	var createdVal any = time.Now().Unix()
	if created != nil {
		createdVal = created
	}
	if ident == "" {
		ident = fmt.Sprintf("chatcmpl-%d", time.Now().UnixNano())
	}
	resp := map[string]any{
		"id":      ident,
		"object":  "chat.completion",
		"created": createdVal,
		"model":   model,
		"choices": []map[string]any{{"index": 0, "message": message, "finish_reason": finish}},
	}
	if usage != nil {
		resp["usage"] = usage
	}
	return resp
}

// singleChunkSSE 非流式 JSON → 单 chunk SSE（proxy/openai JSON 响应转流式）。
func singleChunkSSE(full map[string]any, out *sseWriter) {
	chunk := map[string]any{}
	for _, k := range []string{"id", "created", "model"} {
		if v, ok := full[k]; ok {
			chunk[k] = v
		}
	}
	chunk["object"] = "chat.completion.chunk"
	choices, _ := full["choices"].([]any)
	if len(choices) > 0 {
		if cm, ok := choices[0].(map[string]any); ok {
			if msg, ok := cm["message"].(map[string]any); ok {
				delta := map[string]any{}
				if v, ok := msg["role"]; ok {
					delta["role"] = v
				}
				if v, ok := msg["content"]; ok {
					delta["content"] = v
				}
				if tcs, ok := msg["tool_calls"]; ok {
					delta["tool_calls"] = tcs
				}
				chunk["choices"] = []map[string]any{{"index": 0, "delta": delta, "finish_reason": "stop"}}
			}
		}
	}
	if _, ok := chunk["choices"]; !ok {
		chunk["choices"] = []map[string]any{{"index": 0, "delta": map[string]any{}, "finish_reason": "stop"}}
	}
	if u, ok := full["usage"]; ok {
		chunk["usage"] = u
	}
	raw, err := json.Marshal(chunk)
	if err == nil {
		out.writeData(string(raw))
	}
	out.writeDone()
}

func writeJSONError(w http.ResponseWriter, status int, code, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"error": map[string]any{"message": message, "type": "api_error", "code": code},
	})
}

// ---- Engine chat 主流程 ----

func (e *Engine) resolveRegion(obj map[string]any, h http.Header, model string) string {
	for _, key := range []string{"X-AutoClaw-Region", "X-Region"} {
		if v := strings.ToLower(strings.TrimSpace(h.Get(key))); v == "cn" || v == "global" {
			return v
		}
	}
	if v := strings.ToLower(strings.TrimSpace(toString(obj["region"]))); v == "cn" || v == "global" {
		return v
	}
	m := strings.TrimSpace(model)
	low := strings.ToLower(m)
	for _, p := range []string{"global/", "cn/", "global:", "cn:"} {
		if strings.HasPrefix(low, p) {
			return p[:len(p)-1]
		}
	}
	return ""
}

// handleErr 上游错误记账；返回 true 表示 refresh 自救成功可同请求重试。
func (e *Engine) handleErr(pool *Pool, uid string, err error) bool {
	ue, isUE := err.(*UpstreamError)
	if isUE && ue.Kind == "session_dead" {
		a := pool.authByUID(uid)
		if a != nil && strings.TrimSpace(a.RefreshToken) != "" {
			if rerr := e.up.refresh(a); rerr == nil {
				if serr := a.Save(); serr == nil || strings.Contains(serr.Error(), "already") {
					pool.reenable(uid)
					log.Printf("%s: session_dead recovered via refresh", uid[:minLen(uid, 8)])
					return true
				}
			} else {
				log.Printf("%s: refresh after session_dead failed: %v", uid[:minLen(uid, 8)], rerr)
			}
		}
		pool.disable(uid, "session dead")
		return false
	}
	if isUE {
		switch ue.Kind {
		case "hard_credit":
			pool.cooldown(uid, "hard_credit", e.cfg.HardCooldown, "余额不足")
		case "soft_rate":
			pool.cooldown(uid, "soft_rate", e.cfg.SoftCooldown, "429 rate limit")
		default:
			pool.noteError(uid, e.cfg.ErrThreshold, e.cfg.ErrCooldown)
		}
		return false
	}
	pool.noteError(uid, e.cfg.ErrThreshold, e.cfg.ErrCooldown)
	return false
}

// prepare chat 前置：刷新 token → 确保沙箱 → 唤醒（cn）。
func (e *Engine) prepare(a *Auth) error {
	if a.Region == "global" {
		if a.NeedsRefresh(600) && strings.TrimSpace(a.RefreshToken) != "" {
			if err := e.up.refresh(a); err == nil {
				_ = a.Save()
			}
		}
		return nil
	}
	if a.NeedsRefresh(600) {
		if strings.TrimSpace(a.RefreshToken) == "" {
			return upstreamErrf("session_dead", 401, 0, "no refreshToken — re-login required")
		}
		if err := e.up.refresh(a); err != nil {
			return err
		}
		if err := a.Save(); err != nil {
			return err
		}
	}
	if _, _, err := e.up.ensureSandbox(a); err != nil {
		return err
	}
	if err := a.Save(); err != nil {
		return err
	}
	a.mu.Lock()
	sid := a.SandboxID
	a.mu.Unlock()
	return e.up.wakeSandbox(a, sid)
}

// dispatch 三通道分发（移植 _dispatch）；返回 (成功, 状态码)，-1 = 换号重试。
func (e *Engine) dispatch(pool *Pool, a *Auth, w http.ResponseWriter, body []byte, model string, wantStream bool) (bool, int) {
	started := time.Now() // 账号级延迟/吞吐记账起点
	// 通道 1：proxy（agent 目标不走）
	if (e.cfg.Mode == "auto" || e.cfg.Mode == "proxy") && !isAgentTarget(model) {
		m := model
		if m == "" {
			m = "zai_auto"
		}
		resp, err := e.up.chatProxy(a, body, m)
		if err != nil {
			log.Printf("proxy chat failed (model=%s), fallback to relay: %v", model, err)
			if e.cfg.Mode == "proxy" {
				e.handleErr(pool, a.UserID, err)
				return false, -1
			}
		} else {
			return true, e.streamOut(pool, a, w, resp, wantStream, model, started)
		}
	}
	// 通道 2：sandbox openai
	if e.cfg.Mode != "relay" {
		resp, status, text := e.up.chatOpenAI(a, body)
		if resp == nil {
			if e.cfg.Mode == "auto" && notEnabled(status, text) {
				// fall through to relay
			} else {
				ex := &UpstreamError{Kind: classify(status, 0, text), Status: status, Msg: truncStr(text, 200)}
				e.handleErr(pool, a.UserID, ex)
				return false, -1
			}
		} else {
			return true, e.streamOut(pool, a, w, resp, wantStream, model, started)
		}
	}
	// 通道 3：relay（agent 事件流）
	runID, session, events, closeWS, err := e.up.relayStart(a, body)
	if err != nil {
		e.handleErr(pool, a.UserID, err)
		return false, -1
	}
	onUsage := func(in, out, total int64) {
		pool.noteUsage(a.UserID, total, out, time.Since(started).Milliseconds())
	}
	if wantStream {
		writeSSEHeaders(w)
		out := newSSEWriter(w)
		convertRelayEvents(events, runID, session, body, out, closeWS, onUsage)
	} else {
		lw := &listWriter{}
		convertRelayEvents(events, runID, session, body, lw, closeWS, onUsage)
		snap := lw.snapshot()
		agg := aggregateSSE(snap)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(agg)
	}
	pool.noteSuccess(a.UserID)
	return true, http.StatusOK
}

// streamOut proxy/openai 响应输出（SSE 透传 / 聚合 / JSON↔SSE 转换）。
func (e *Engine) streamOut(pool *Pool, a *Auth, w http.ResponseWriter, resp *http.Response, wantStream bool, model string, started time.Time) int {
	pool.noteSuccess(a.UserID)
	// 记账只生效一次：显式拿到 usage 的路径先记，defer 兜底（仅延迟）不覆盖。
	var once sync.Once
	noteDone := func(total, completion int64) {
		once.Do(func() {
			pool.noteUsage(a.UserID, total, completion, time.Since(started).Milliseconds())
		})
	}
	defer noteDone(0, 0)
	defer resp.Body.Close()
	ct := strings.ToLower(resp.Header.Get("Content-Type"))
	if strings.Contains(ct, "text/event-stream") {
		if wantStream {
			writeSSEHeaders(w)
			pumpSSE(resp, newSSEWriter(w))
			return http.StatusOK
		}
		scanner := bufio.NewScanner(resp.Body)
		scanner.Buffer(make([]byte, 0, 256*1024), 8<<20)
		var sseLines []string
		for scanner.Scan() {
			sseLines = append(sseLines, scanner.Text())
		}
		agg := aggregateSSE(sseLines)
		// 聚合后的 JSON 里带 usage 末帧 → 补记 token/吞吐。
		if u, ok := agg["usage"].(map[string]any); ok {
			noteDone(toInt64(u["total_tokens"]), toInt64(u["completion_tokens"]))
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(agg)
		return http.StatusOK
	}
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 16<<20))
	if err != nil || !json.Valid(bytes.TrimSpace(raw)) {
		writeJSONError(w, http.StatusBadGateway, "upstream_parse", "invalid JSON from upstream")
		return http.StatusBadGateway
	}
	var data map[string]any
	_ = json.Unmarshal(raw, &data)
	if u, ok := data["usage"].(map[string]any); ok {
		noteDone(toInt64(u["total_tokens"]), toInt64(u["completion_tokens"]))
	}
	if !wantStream {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(raw)
		return http.StatusOK
	}
	writeSSEHeaders(w)
	singleChunkSSE(data, newSSEWriter(w))
	return http.StatusOK
}

// chat 主入口（移植 Bridge.chat）：校验 → 轮转选号 → prepare → dispatch。
func (e *Engine) chat(w http.ResponseWriter, r *http.Request) {
	// 池级运行态指标（面板「成功/失败/在途」卡）：dispatch 成功即计成功。
	okDone := false
	rmDone := relaymetrics.Enter("autoclaw")
	defer func() { rmDone(okDone) }()
	body, err := io.ReadAll(io.LimitReader(r.Body, 8<<20))
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid_request", "read body failed")
		return
	}
	if verr := validateChatBody(body); verr != "" {
		writeJSONError(w, http.StatusBadRequest, "invalid_request", verr)
		return
	}
	var obj map[string]any
	_ = json.Unmarshal(body, &obj)
	rawModel := strings.TrimSpace(toString(obj["model"]))
	_ = e.resolveRegion(obj, r.Header, rawModel) // Python 版同款：解析但轮转固定 cn
	model := stripRegionPrefix(rawModel)
	// 大小写归一到对外裸名，再还原上游沙箱真名（glm-5.3 → zaicoding_glm-5.3 等）；
	// dispatch 各通道按 body 里的 model 透传，因此最终 model 与 body 不一致时统一重写。
	if cm := e.canonicalModel(model); cm != model {
		model = cm
	}
	if um := upstreamModel(model); um != model {
		model = um
	}
	if peekModel(body) != model {
		obj["model"] = model
		if nb, merr := json.Marshal(obj); merr == nil {
			body = nb
		}
	}
	var wantStream struct {
		Stream bool `json:"stream"`
	}
	_ = json.Unmarshal(body, &wantStream)
	tried := map[string]bool{}
	var lastErr error
	for i := 0; i < e.cfg.MaxRotate; i++ {
		picked := e.pools["cn"].pick(tried)
		if picked == nil {
			break
		}
		a := picked
		tried[a.UserID] = true
		pool := e.pools["cn"]
		// 在途占用（面板「在途」列）：覆盖 prepare + dispatch 全程；失败路径的
		// failTotal 已由 handleErr→noteError 累计，这里只管在途。
		release := pool.holdUID(a.UserID)
		if err := e.prepare(a); err != nil {
			lastErr = err
			release()
			if e.handleErr(pool, a.UserID, err) {
				delete(tried, a.UserID) // refresh 自救成功：同请求用新 token 重试
			}
			continue
		}
		ok, status := e.dispatch(pool, a, w, body, model, wantStream.Stream)
		release()
		if ok {
			okDone = true
			return
		}
		if status == -1 {
			continue
		}
	}
	msg := "all accounts unavailable (cooling/disabled)"
	if lastErr != nil {
		msg += ": " + lastErr.Error()
	}
	writeJSONError(w, http.StatusServiceUnavailable, "no_healthy_account", msg)
}

func minLen(s string, n int) int {
	if len(s) < n {
		return len(s)
	}
	return n
}

func truncStr(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n]
}
