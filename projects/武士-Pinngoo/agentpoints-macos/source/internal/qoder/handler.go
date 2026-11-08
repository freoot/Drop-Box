package qoder

// handler：chat 主流程 + 引擎 HTTP 面（挂载于主网关 /qoder/ 前缀）。

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/linguo2625469/workbuddy2api-panel/internal/relaymetrics"
)

func newUUID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	h := hex.EncodeToString(b)
	return h[0:8] + "-" + h[8:12] + "-" + h[12:16] + "-" + h[16:20] + "-" + h[20:32]
}

// truncateRunes 按 rune 截断（CJK 安全）。
func truncateRunes(s string, n int) string {
	if n <= 0 {
		return ""
	}
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n])
}

// paramError 客户端参数无法编码（映射 400，不换号重试）。
type paramError struct{ msg string }

func (e *paramError) Error() string { return e.msg }

// handledError 标记已向客户端写出内容（不能换号、不能改状态码）。
type handledError struct{ err error }

func (h *handledError) Error() string { return h.err.Error() }

// openStreamAsync 打开 SSE 流（auth 自救一次 + busy 退避一次）。
func (e *Engine) openStreamAsync(ctx context.Context, a *Account, fullURL string, jsonBody []byte, extraHeaders map[string]string, callback func(line string) error) error {
	for attempt := 1; ; attempt++ {
		a.mu.Lock()
		sess := a.sess
		a.mu.Unlock()
		if sess == nil {
			return errors.New("session not bootstrapped")
		}
		produced := false
		err := openStreamLines(ctx, sess, fullURL, jsonBody, extraHeaders, func(line string) error {
			produced = true
			return callback(line)
		})
		if err == nil {
			return nil
		}
		var authErr *AuthError
		if errors.As(err, &authErr) {
			if produced || attempt >= 2 {
				return err
			}
			if rerr := e.forceRefresh(a); rerr != nil {
				return err
			}
			continue
		}
		var busyErr *BusyError
		if errors.As(err, &busyErr) {
			if produced || attempt >= 2 {
				return err
			}
			wait := busyErr.RetryAfter
			if wait <= 0 || wait > 10*time.Second {
				wait = 2 * time.Second
			}
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(wait):
			}
			continue
		}
		return err
	}
}

// writeSSEHeaders 落 SSE 响应头。
func writeSSEHeaders(w http.ResponseWriter) {
	h := w.Header()
	h.Set("Content-Type", "text/event-stream")
	h.Set("Cache-Control", "no-cache")
	h.Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)
	if f, ok := w.(http.Flusher); ok {
		f.Flush()
	}
}

// writeErrChunk 流内错误 chunk（finish_reason=error + error 字段）。
func writeErrChunk(w http.ResponseWriter, reqID string, created int64, model, msg string) {
	chunk := makeChunk(reqID, created, model)
	if choices, ok := chunk["choices"].([]map[string]interface{}); ok {
		choices[0]["finish_reason"] = "error"
	}
	chunk["error"] = map[string]interface{}{"message": msg, "type": "qoder_error"}
	raw, _ := marshalNoEscape(chunk)
	_, _ = w.Write([]byte("data: " + string(raw) + "\n\n"))
	if f, ok := w.(http.Flusher); ok {
		f.Flush()
	}
}

// handleStream 流式输出。已写出内容后的失败以 SSE error chunk 收尾并包
// handledError，让上层停止换号。
func (e *Engine) handleStream(ctx context.Context, w http.ResponseWriter, a *Account, jsonBody []byte, url string, extraHeaders map[string]string, reqID string, created int64, model string, toolsEnabled bool) error {
	started := time.Now() // 账号级延迟/吞吐记账起点
	writeSSEHeaders(w)
	wrote := false
	var usageObj *usage
	acc := newStreamAccumulator(reqID, created, model, toolsEnabled, func(chunk string) {
		wrote = true
		_, _ = w.Write([]byte(chunk))
		if f, ok := w.(http.Flusher); ok {
			f.Flush()
		}
	})
	err := e.openStreamAsync(ctx, a, url, jsonBody, extraHeaders, func(line string) error {
		if !strings.HasPrefix(line, "data:") {
			return nil
		}
		delta := extractDelta(strings.TrimSpace(line[5:]))
		if delta.Usage != nil {
			usageObj = delta.Usage
		}
		if !delta.isEmpty() {
			acc.accept(delta)
		}
		return nil
	})
	acc.flush()
	if err != nil {
		if !wrote {
			return err // 响应未提交：交上层按真实状态码报错
		}
		writeErrChunk(w, reqID, created, model, err.Error())
		return &handledError{err}
	}
	doneChunk := makeChunk(reqID, created, model)
	if choices, ok := doneChunk["choices"].([]map[string]interface{}); ok {
		choices[0]["finish_reason"] = acc.finalFinishReason()
	}
	raw, _ := marshalNoEscape(doneChunk)
	_, _ = w.Write([]byte("data: " + string(raw) + "\n\n"))
	// usage 帧恒输出（网关用量记账依赖；与其他池上游行为一致）。
	if usageObj != nil {
		usageChunk := makeChunk(reqID, created, model)
		usageChunk["choices"] = []map[string]interface{}{}
		usageChunk["usage"] = usageObj
		rawU, _ := marshalNoEscape(usageChunk)
		_, _ = w.Write([]byte("data: " + string(rawU) + "\n\n"))
	}
	_, _ = w.Write([]byte("data: [DONE]\n\n"))
	if f, ok := w.(http.Flusher); ok {
		f.Flush()
	}
	// 账号级用量记账（面板「用量」列）。
	if usageObj != nil {
		a.NoteUsage(int64(usageObj.TotalTokens), int64(usageObj.CompletionTokens), time.Since(started).Milliseconds())
	} else {
		a.NoteUsage(0, 0, time.Since(started).Milliseconds())
	}
	return nil
}

// handleSync 非流式聚合输出。
func (e *Engine) handleSync(ctx context.Context, w http.ResponseWriter, a *Account, jsonBody []byte, url string, extraHeaders map[string]string, reqID string, created int64, model string, toolsEnabled bool) error {
	started := time.Now() // 账号级延迟/吞吐记账起点
	lw := &listWriter{}
	var usageObj *usage
	acc := newStreamAccumulator(reqID, created, model, toolsEnabled, lw.writeChunk)
	err := e.openStreamAsync(ctx, a, url, jsonBody, extraHeaders, func(line string) error {
		if !strings.HasPrefix(line, "data:") {
			return nil
		}
		delta := extractDelta(strings.TrimSpace(line[5:]))
		if delta.Usage != nil {
			usageObj = delta.Usage
		}
		if !delta.isEmpty() {
			acc.accept(delta)
		}
		return nil
	})
	acc.flush()
	if err != nil {
		return err
	}
	resp := aggregateNonStream(lw.snapshot(), reqID, created, model, toolsEnabled, usageObj)
	w.Header().Set("Content-Type", "application/json")
	raw, _ := marshalNoEscape(resp)
	_, _ = w.Write(raw)
	// 账号级用量记账（面板「用量」列）。
	if usageObj != nil {
		a.NoteUsage(int64(usageObj.TotalTokens), int64(usageObj.CompletionTokens), time.Since(started).Milliseconds())
	} else {
		a.NoteUsage(0, 0, time.Since(started).Milliseconds())
	}
	return nil
}

// chatSlot 单 PAT 并发闸（本地排队，防 10605）。
func (e *Engine) chatSlot(ctx context.Context, a *Account) (func(), error) {
	select {
	case a.chatSlots <- struct{}{}:
		return func() { <-a.chatSlots }, nil
	default:
	}
	select {
	case a.chatSlots <- struct{}{}:
		return func() { <-a.chatSlots }, nil
	case <-ctx.Done():
		return nil, ctx.Err()
	}
}

// chatRequest 主网关 chat 入口（模型名已剥 "qoder/" 前缀）。
// 轮转选号：凭证/网络失败换号重试；参数错误 400 立即返回；
// 已写出内容后失败由 handledError 终止。
func (e *Engine) chatRequest(w http.ResponseWriter, r *http.Request, body []byte) {
	// 池级运行态指标（面板「成功/失败/在途」卡）：chatOnce 返回 nil 即成功。
	okDone := false
	rmDone := relaymetrics.Enter("qoder")
	defer func() { rmDone(okDone) }()
	accounts := e.chatAccounts()
	if len(accounts) == 0 {
		writeJSONError(w, http.StatusServiceUnavailable, "no_healthy_account",
			"no qoder PAT available (add via POST /qoder/api/pat)")
		return
	}
	dec := json.NewDecoder(bytes.NewReader(body))
	dec.UseNumber()
	var reqBody map[string]interface{}
	if err := dec.Decode(&reqBody); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid_request", "invalid JSON body")
		return
	}
	stream := false
	if v, ok := reqBody["stream"].(bool); ok {
		stream = v
	}
	modelParam, _ := reqBody["model"].(string)
	modelParam = strings.TrimSpace(modelParam)
	effort, err := resolveReasoningEffort(reqBody)
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid_request", err.Error())
		return
	}
	if raw, present := reqBody["n"]; present {
		if f, ok := raw.(float64); ok && f != 1 {
			writeJSONError(w, http.StatusBadRequest, "invalid_request",
				"n!=1 is not supported: this backend always returns a single choice")
			return
		}
	}

	ctx := r.Context()
	var lastErr error
	for i := 0; i < e.cfg.MaxRotate && i < len(accounts); i++ {
		a := accounts[i]
		if err := e.ensureFreshSession(a); err != nil {
			lastErr = err
			continue
		}
		release, err := e.chatSlot(ctx, a)
		if err != nil {
			lastErr = err
			continue
		}
		err = e.chatOnce(ctx, w, a, reqBody, modelParam, effort, stream, release)
		if err == nil {
			a.NoteChatResult(true)
			okDone = true
			return
		}
		a.NoteChatResult(false)
		var pe *paramError
		if errors.As(err, &pe) {
			writeJSONError(w, http.StatusBadRequest, "invalid_request", pe.msg)
			return
		}
		var he *handledError
		if errors.As(err, &he) {
			log.Printf("qoder %s: stream failed after content: %v", a.displayName(), he.err)
			return
		}
		lastErr = err
	}
	status, code := mapUpstreamStatus(lastErr)
	msg := "all qoder accounts failed"
	if lastErr != nil {
		msg += ": " + lastErr.Error()
	}
	writeJSONError(w, status, code, msg)
}

// mapUpstreamStatus 上游错误 → 客户端状态码/错误码。
func mapUpstreamStatus(err error) (int, string) {
	if err == nil {
		return http.StatusBadGateway, "upstream_error"
	}
	var ue *UpstreamError
	if errors.As(err, &ue) {
		if ue.StatusCode == http.StatusTooManyRequests {
			return http.StatusTooManyRequests, "rate_limit_error"
		}
		if ue.StatusCode >= 400 && ue.StatusCode < 500 {
			return http.StatusBadRequest, "invalid_request_error"
		}
		return http.StatusBadGateway, "upstream_error"
	}
	return http.StatusBadGateway, "upstream_error"
}

// chatOnce 单账号一次完整调用（成功/失败路径均释放 slot）。
func (e *Engine) chatOnce(ctx context.Context, w http.ResponseWriter, a *Account, reqBody map[string]interface{}, modelParam, effort string, stream bool, release func()) error {
	defer func() {
		if r := recover(); r != nil {
			release()
			panic(r)
		}
	}()
	cat := e.getCatalog(ctx)
	display, qoderKey, err := cat.resolveModel(modelParam)
	if err != nil {
		release()
		return &paramError{err.Error()}
	}

	messages := extractMessages(reqBody["messages"])
	b := newRequestBody()
	nid := newUUID()
	b.RequestID = nid
	b.ChatRecordID = nid
	b.RequestSetID = newUUID()
	b.SessionID = newUUID()
	b.Stream = true
	userType := a.cachedUserType()
	if userType == "" {
		userType = "personal_standard"
	}
	b.AliyunUserType = userType
	b.ModelConfig.Key = qoderKey
	b.ChatContext.Extra.ModelConfig.Key = qoderKey
	params, err := buildParameters(reqBody, effort, cat.maxOutputTokens(qoderKey))
	if err != nil {
		release()
		return &paramError{err.Error()}
	}
	b.Parameters = params
	reasoningOn := cat.reasoningDefault(qoderKey)
	if effort != "" {
		reasoningOn = effort != "none"
	}
	b.ModelConfig.IsReasoning = reasoningOn
	b.ChatContext.Extra.ModelConfig.IsReasoning = reasoningOn
	b.Business.ID = newUUID()
	b.Business.BeginAt = time.Now().UnixMilli()

	prompt := extractLatestUserPrompt(messages)
	b.ChatContext.Text.Text = prompt
	b.ChatContext.Extra.OriginalContent.Text = prompt
	b.Business.Name = truncateRunes(prompt, 30)
	toolsEnabled := applyToolConfig(b, reqBody)
	b.Messages = buildQoderMessages(messages, prompt, toolsEnabled)

	hasImages := false
	for _, m := range messages {
		if len(extractMessageImages(m)) > 0 {
			hasImages = true
			break
		}
	}
	if hasImages && !cat.VisionModels[display] {
		release()
		return &paramError{fmt.Sprintf("Image input is not supported by model '%s'.", display)}
	}
	if hasImages {
		b.ModelConfig.IsVL = true
		b.ChatContext.Extra.ModelConfig.IsVL = true
	}

	jsonBody, err := marshalNoEscape(b)
	if err != nil {
		release()
		return err
	}
	url := authBase + chatPath
	extraHeaders := map[string]string{
		"x-model-key":    qoderKey,
		"x-model-source": "system",
	}
	reqID := "chatcmpl-" + newUUID()[:24]
	created := time.Now().Unix()

	if stream {
		err = e.handleStream(ctx, w, a, jsonBody, url, extraHeaders, reqID, created, display, toolsEnabled)
	} else {
		err = e.handleSync(ctx, w, a, jsonBody, url, extraHeaders, reqID, created, display, toolsEnabled)
	}
	release()
	if err != nil {
		e.st(a.key()).ErrStreak++
		return err
	}
	e.st(a.key()).ErrStreak = 0
	return nil
}

// writeJSONError OpenAI 风格错误。
func writeJSONError(w http.ResponseWriter, status int, code, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"error": map[string]any{"message": message, "type": "api_error", "code": code},
	})
}

// ---- HTTP 面 ----

// Handler 引擎 HTTP 面（StripPrefix /qoder 后的路径）。
func (e *Engine) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		healthy := len(e.healthyAccounts())
		status := http.StatusOK
		if healthy == 0 {
			status = http.StatusServiceUnavailable
		}
		e.writeJSON(w, status, map[string]any{"healthy": healthy, "total": len(e.allAccounts())})
	})
	mux.HandleFunc("GET /v1/models", func(w http.ResponseWriter, r *http.Request) {
		e.writeJSON(w, http.StatusOK, map[string]any{"object": "list", "data": e.Models()})
	})
	mux.HandleFunc("POST /v1/chat/completions", func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(io.LimitReader(r.Body, 10<<20))
		if err != nil {
			writeJSONError(w, http.StatusBadRequest, "invalid_request", "read body failed")
			return
		}
		e.chatRequest(w, r, body)
	})
	mux.HandleFunc("GET /status", func(w http.ResponseWriter, r *http.Request) {
		out := []map[string]any{}
		for _, a := range e.allAccounts() {
			st := e.st(a.key())
			a.mu.Lock()
			mode := "pat"
			if a.PAT == "" {
				mode = "device"
			}
			row := map[string]any{
				"name":         a.Name,
				"uid":          a.uid,
				"user_type":    a.userType,
				"bootstrapped": a.bootstrapped,
				"machine_id":   a.MachineID,
				"mode":         mode,
			}
			// 请求级统计（面板「成功/失败、在途、用量」列）。
			okN, failN, inflight, lastOK := a.ChatStats()
			row["success_count"] = okN
			row["fail_count"] = failN
			row["in_flight"] = inflight
			row["requests"] = okN + failN
			tokTotal, latMs, tps, hasTPS := a.UsageStats()
			row["total_tokens"] = tokTotal
			row["last_latency_ms"] = latMs
			if hasTPS {
				row["last_tokens_per_second"] = tps
			}
			if !lastOK.IsZero() {
				row["last_success"] = lastOK.Format(time.RFC3339)
			}
			a.mu.Unlock()
			if st.Disabled {
				row["disabled"] = true
				row["reason"] = st.Reason
			}
			if !st.CooldownUntil.IsZero() && time.Now().Before(st.CooldownUntil) {
				row["cooldown_until"] = st.CooldownUntil.Format(time.RFC3339)
			}
			if st.Quota != nil {
				row["quota"] = st.Quota
			}
			if st.CheckinStatus != "" {
				row["checkin_status"] = st.CheckinStatus
			}
			if st.LastCheckin != "" {
				row["last_checkin"] = st.LastCheckin
			}
			if st.StreakDays > 0 {
				row["streak_days"] = st.StreakDays
			}
			out = append(out, row)
		}
		e.writeJSON(w, http.StatusOK, map[string]any{"accounts": out})
	})
	// ---- 浏览器设备授权登录（手机号验证码，无需 PAT）----
	mux.HandleFunc("POST /api/device/start", func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Name string `json:"name"`
		}
		_ = json.NewDecoder(io.LimitReader(r.Body, 64<<10)).Decode(&body)
		ds, err := e.startDeviceLogin(body.Name)
		if err != nil {
			e.writeJSON(w, http.StatusOK, map[string]any{"error": err.Error()})
			return
		}
		e.writeJSON(w, http.StatusOK, map[string]any{
			"ok":         true,
			"sid":        ds.SID,
			"url":        ds.authURL(),
			"expires_in": int(devicePollTTL.Seconds()),
		})
	})
	mux.HandleFunc("GET /api/device/status", func(w http.ResponseWriter, r *http.Request) {
		ds, err := e.deviceLookup(r.URL.Query().Get("sid"))
		if err != nil {
			e.writeJSON(w, http.StatusOK, map[string]any{"error": err.Error()})
			return
		}
		if ds.Done {
			e.writeJSON(w, http.StatusOK, ds.Result)
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), time.Duration(e.cfg.TimeoutSeconds*float64(time.Second)))
		defer cancel()
		data, ok, perr := e.devicePollOnce(ctx, ds)
		if perr != nil {
			// 单次轮询失败不终止会话（网络抖动/未授权都归入等待）。
			e.writeJSON(w, http.StatusOK, map[string]any{
				"ok": true, "pending": true, "status": deviceStatusText(ds), "note": perr.Error(),
			})
			return
		}
		if !ok {
			e.writeJSON(w, http.StatusOK, map[string]any{
				"ok": true, "pending": true, "status": deviceStatusText(ds),
			})
			return
		}
		e.writeJSON(w, http.StatusOK, e.adoptDeviceSession(ctx, ds, data))
	})
	mux.HandleFunc("POST /api/device/cancel", func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			SID string `json:"sid"`
		}
		_ = json.NewDecoder(io.LimitReader(r.Body, 64<<10)).Decode(&body)
		e.deviceDrop(body.SID)
		e.writeJSON(w, http.StatusOK, map[string]any{"ok": true})
	})
	mux.HandleFunc("POST /api/pat", func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			PAT  string `json:"pat"`
			Name string `json:"name"`
		}
		_ = json.NewDecoder(io.LimitReader(r.Body, 64<<10)).Decode(&body)
		pat := strings.TrimSpace(body.PAT)
		if pat == "" {
			e.writeJSON(w, http.StatusOK, map[string]any{"error": "pat required"})
			return
		}
		if !strings.HasPrefix(pat, "pt-") {
			e.writeJSON(w, http.StatusOK, map[string]any{"error": "PAT 应以 pt- 开头（Qoder 客户端 Personal Token）"})
			return
		}
		for _, a := range e.allAccounts() {
			if a.PAT == pat {
				if body.Name != "" {
					a.Name = body.Name
					_ = a.save()
				}
				e.rescan()
				e.writeJSON(w, http.StatusOK, map[string]any{"ok": true, "uid": a.uid, "existing": true})
				return
			}
		}
		a := &Account{
			PAT:       pat,
			Name:      strings.TrimSpace(body.Name),
			FilePath:  filepathFor(e.cfg.AuthDir, pat),
			chatSlots: make(chan struct{}, e.cfg.MaxConcurrency),
		}
		a.MachineID = newUUID()
		a.MachineToken = newUUID() + newUUID()
		if len(a.MachineToken) > 50 {
			a.MachineToken = a.MachineToken[:50]
		}
		a.MachineType = newUUID()[:18]
		if err := a.save(); err != nil {
			e.writeJSON(w, http.StatusOK, map[string]any{"error": "save failed: " + err.Error()})
			return
		}
		e.rescan()
		// rescan 后从池里取回实例再引导：确保 bootstrapped/uid 落在列表真正展示的
		// 那个对象上（否则导入后一直显示「引导中」）。
		if fresh := e.findByPAT(pat); fresh != nil {
			a = fresh
		}
		if err := e.ensureFreshSession(a); err != nil {
			e.writeJSON(w, http.StatusOK, map[string]any{"ok": true, "warn": "saved, but session bootstrap failed: " + err.Error()})
			return
		}
		e.refreshQuota(a)
		a.mu.Lock()
		uid := a.uid
		a.mu.Unlock()
		e.writeJSON(w, http.StatusOK, map[string]any{"ok": true, "uid": uid})
	})
	mux.HandleFunc("POST /api/pat/delete", func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			UID string `json:"uid"`
		}
		_ = json.NewDecoder(io.LimitReader(r.Body, 64<<10)).Decode(&body)
		removed := ""
		for _, a := range e.allAccounts() {
			if a.uid == strings.TrimSpace(body.UID) && a.FilePath != "" {
				if err := os.Remove(a.FilePath); err == nil {
					removed = a.FilePath
				}
				break
			}
		}
		if removed == "" {
			e.writeJSON(w, http.StatusOK, map[string]any{"error": "uid not found"})
			return
		}
		e.rescan()
		e.writeJSON(w, http.StatusOK, map[string]any{"ok": true, "deleted": true})
	})
	mux.HandleFunc("POST /api/checkin", func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.Copy(io.Discard, io.LimitReader(r.Body, 64<<10))
		e.writeJSON(w, http.StatusOK, map[string]any{"ok": true, "results": e.CheckinAll()})
	})
	mux.HandleFunc("POST /api/maintain", func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.Copy(io.Discard, io.LimitReader(r.Body, 64<<10))
		e.maintainNow()
		e.writeJSON(w, http.StatusOK, map[string]any{"ok": true})
	})
	mux.HandleFunc("POST /api/credits/refresh", func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.Copy(io.Discard, io.LimitReader(r.Body, 64<<10))
		for _, a := range e.healthyAccounts() {
			e.refreshQuota(a)
		}
		e.writeJSON(w, http.StatusOK, map[string]any{"ok": true})
	})
	return mux
}

func filepathFor(authDir, pat string) string {
	suffix := pat
	if len(suffix) > 16 {
		suffix = suffix[len(suffix)-16:]
	}
	return authDir + string(os.PathSeparator) + "qoder-" + sanitizeFile(suffix) + ".json"
}

func sanitizeFile(s string) string {
	return strings.Map(func(r rune) rune {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '-' || r == '_' {
			return r
		}
		return '-'
	}, s)
}

func (e *Engine) writeJSON(w http.ResponseWriter, status int, obj any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	raw, err := json.Marshal(obj)
	if err == nil {
		_, _ = w.Write(raw)
	}
}
