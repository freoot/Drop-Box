package autoclaw

// 上游 HTTP 客户端（移植自 bridge.py Upstream）：userapi（登录/刷新/积分/沙箱）、
// relay（沙箱唤醒/事件流/agent send）、proxy-chat 与 sandbox-openai 两个 chat 通道。

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"sync"
	"time"
)

// UpstreamError 上游错误分类（kind: session_dead/hard_credit/soft_rate/...）。
type UpstreamError struct {
	Kind   string
	Status int
	Code   int64
	Msg    string
}

func (e *UpstreamError) Error() string {
	return fmt.Sprintf("upstream %s (http %d code %d): %s", e.Kind, e.Status, e.Code, e.Msg)
}

var (
	hardMarkers = []string{
		"insufficient credit", "no credit", "credit exhausted", "out of credit",
		"quota exceeded", "quota exhaust", "payment required", "not enough credit",
		"insufficient balance", "balance not enough", "limit reached", "usage limit",
		"余额不足", "额度不足", "积分不足", "积分用完", "额度用尽", "没有积分", "配额不足", "可用额度",
	}
	deadMarkers = []string{
		"not logged in", "unauthorized", "invalid token", "token expired",
		"login required", "session expired", "offline user session", "auth.inject failed",
		"未登录", "登录已过期", "请先登录", "token 失效",
	}
)

// classify 上游错误分类（移植 classify()）。
func classify(status int, code int64, body string) string {
	if code == 410000 {
		return "session_dead"
	}
	lower := strings.ToLower(body)
	for _, m := range hardMarkers {
		if strings.Contains(lower, strings.ToLower(m)) || strings.Contains(body, m) {
			return "hard_credit"
		}
	}
	for _, m := range deadMarkers {
		if strings.Contains(lower, strings.ToLower(m)) {
			return "session_dead"
		}
	}
	switch {
	case status == 402:
		return "hard_credit"
	case status == 429:
		return "soft_rate"
	case status == 404:
		return "not_found"
	case status >= 500:
		return "server"
	case status >= 400:
		return "client"
	}
	return "none"
}

func upstreamErrf(kind string, status int, code int64, format string, args ...any) *UpstreamError {
	return &UpstreamError{Kind: kind, Status: status, Code: code, Msg: fmt.Sprintf(format, args...)}
}

// ---- relay 基址处理（移植 relay_base / relay_proxy_base / relay_base_from_proxy / to_ws_base）----

const relaySuffix = "/autoclaw-cloud"

func relayBase(endpoint string) string {
	t := strings.TrimSpace(endpoint)
	low := strings.ToLower(t)
	if strings.HasPrefix(low, "ws://") {
		t = "http://" + t[5:]
	} else if strings.HasPrefix(low, "wss://") {
		t = "https://" + t[6:]
	}
	if !strings.Contains(t, "://") {
		t = strings.TrimRight(t, "/")
		if strings.HasSuffix(t, relaySuffix) {
			return t
		}
		return t + relaySuffix
	}
	sp, err := url.Parse(t)
	if err != nil {
		t = strings.TrimRight(t, "/")
		if strings.HasSuffix(t, relaySuffix) {
			return t
		}
		return t + relaySuffix
	}
	path := sp.Path
	if i := strings.Index(path, relaySuffix); i >= 0 {
		path = path[:i+len(relaySuffix)]
	} else {
		path = strings.TrimRight(path, "/") + relaySuffix
	}
	sp.Path = path
	sp.RawQuery, sp.Fragment = "", ""
	return strings.TrimRight(sp.String(), "/")
}

func relayProxyBase(endpoint, sandboxID string) string {
	base := relayBase(endpoint)
	if sandboxID == "" {
		return base
	}
	return strings.TrimRight(base, "/") + "/proxy/" + strings.TrimSpace(sandboxID)
}

func relayBaseFromProxy(proxyBase string) string {
	p := strings.TrimRight(proxyBase, "/")
	if i := strings.LastIndex(p, "/proxy/"); i >= 0 {
		return p[:i]
	}
	return p
}

func toWSBase(base string) string {
	switch {
	case strings.HasPrefix(base, "https://"):
		return "wss://" + base[8:]
	case strings.HasPrefix(base, "http://"):
		return "ws://" + base[7:]
	}
	return base
}

// ---- Upstream 客户端 ----

type upstream struct {
	http             *http.Client
	userAPIOverride  string
	jwtCacheMu       sync.Mutex
	jwtCache         map[string]jwtCacheEntry
}

type jwtCacheEntry struct {
	jwt string
	exp int64
}

func newUpstream(timeoutSeconds float64, userAPIOverride string) *upstream {
	return &upstream{
		http:            &http.Client{Timeout: time.Duration(timeoutSeconds * float64(time.Second))},
		userAPIOverride: strings.TrimRight(userAPIOverride, "/"),
		jwtCache:        map[string]jwtCacheEntry{},
	}
}

func (u *upstream) base(region string) string {
	if u.userAPIOverride != "" {
		return u.userAPIOverride
	}
	return userapiBase[region]
}

// doJSON 发送 JSON 请求并解析 envelope {code, msg, data}（code!=0 视为业务错误）。
// nonEnvelope=true 时跳过 envelope 校验（部分 relay 端点不包 code 字段）。
func (u *upstream) doJSON(method, fullURL string, headers map[string]string, body any, nonEnvelope bool) (json.RawMessage, error) {
	var rd io.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		if err != nil {
			return nil, err
		}
		rd = bytes.NewReader(raw)
	}
	req, err := http.NewRequest(method, fullURL, rd)
	if err != nil {
		return nil, err
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	resp, err := u.http.Do(req)
	if err != nil {
		return nil, upstreamErrf("server", 0, 0, "%v", err)
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	if err != nil {
		return nil, upstreamErrf("server", resp.StatusCode, 0, "read: %v", err)
	}
	text := string(raw)
	if resp.StatusCode >= 400 {
		return nil, upstreamErrf(classify(resp.StatusCode, 0, text), resp.StatusCode, 0, "%.200s", text)
	}
	if nonEnvelope {
		return json.RawMessage(raw), nil
	}
	var env struct {
		Code any    `json:"code"`
		Msg  any    `json:"msg"`
		Data any    `json:"data"`
	}
	if err := json.Unmarshal(raw, &env); err != nil {
		return nil, upstreamErrf("client", resp.StatusCode, 0, "parse failed: %.120s", text)
	}
	code := toInt64(env.Code)
	if code != 0 {
		kind := classify(resp.StatusCode, code, toString(env.Msg))
		if kind == "none" {
			kind = "client"
		}
		return nil, upstreamErrf(kind, resp.StatusCode, code, "code=%d msg=%.160s", code, toString(env.Msg))
	}
	if env.Data == nil {
		return json.RawMessage("null"), nil
	}
	out, err := json.Marshal(env.Data)
	if err != nil {
		return nil, upstreamErrf("client", resp.StatusCode, 0, "re-encode data: %v", err)
	}
	return out, nil
}

// ---- userapi 账号域接口 ----

func (u *upstream) sendCode(region, deviceID, phone string) error {
	_, err := u.doJSON(http.MethodPost, u.base(region)+"/userapi/v1/agent-send-code",
		userapiHeaders(""), map[string]any{"source_id": "autoclaw", "device_id": deviceID, "phone": phone}, false)
	return err
}

type loginResult struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	UserID       any    `json:"user_id"`
	UserName     string `json:"user_name"`
}

func (u *upstream) login(region, deviceID, phone, code string) (*loginResult, error) {
	codeNum := int64(0)
	fmt.Sscanf(strings.TrimSpace(code), "%d", &codeNum)
	raw, err := u.doJSON(http.MethodPost, u.base(region)+"/userapi/v1/agent-login/", userapiHeaders(""),
		map[string]any{"source_id": "autoclaw", "device_id": deviceID, "phone": phone, "code": codeNum, "platform": "web"}, false)
	if err != nil {
		return nil, err
	}
	var data loginResult
	if json.Unmarshal(raw, &data) != nil || strings.TrimSpace(data.AccessToken) == "" {
		return nil, upstreamErrf("client", 0, 0, "login_failed: no access_token")
	}
	return &data, nil
}

// refresh 用 refreshToken 换新（写回 a，调用方负责 Save）。
func (u *upstream) refresh(a *Auth) error {
	a.mu.Lock()
	hasRT := strings.TrimSpace(a.RefreshToken) != ""
	rt, at, deviceID, region := a.RefreshToken, a.AccessToken, a.DeviceID, a.Region
	a.mu.Unlock()
	if !hasRT {
		return fmt.Errorf("no refreshToken")
	}
	raw, err := u.doJSON(http.MethodPost, u.base(region)+"/userapi/v1/refresh",
		userapiHeaders(at), map[string]any{"source_id": "autoclaw", "device_id": deviceID, "refresh_token": rt}, false)
	if err != nil {
		if ue, ok := err.(*UpstreamError); ok && ue.Kind != "none" {
			return upstreamErrf("session_dead", ue.Status, ue.Code, "refresh_failed: %s", ue.Msg)
		}
		return err
	}
	var data struct {
		AccessToken  string `json:"access_token"`
		RefreshToken string `json:"refresh_token"`
	}
	if json.Unmarshal(raw, &data) != nil || strings.TrimSpace(data.AccessToken) == "" {
		return upstreamErrf("session_dead", 401, 0, "refresh_failed: re-login required")
	}
	a.mu.Lock()
	a.AccessToken = data.AccessToken
	if data.RefreshToken != "" {
		a.RefreshToken = data.RefreshToken
	}
	a.mu.Unlock()
	return nil
}

func (u *upstream) checkPoints(a *Auth) (int, error) {
	raw, err := u.doJSON(http.MethodGet, u.base(a.Region)+"/agent-assetmgr/api/v2/wallets?biz_app_id=autoclaw",
		userapiHeaders(a.AccessToken), nil, false)
	if err != nil {
		return 0, err
	}
	var data struct {
		TotalBalance any `json:"total_balance"`
	}
	if json.Unmarshal(raw, &data) != nil {
		return 0, nil
	}
	return int(toInt64(data.TotalBalance)), nil
}

type sandboxInfo struct {
	SandboxID       string `json:"sandbox_id"`
	SandboxEndpoint string `json:"sandbox_endpoint"`
	EndTimestamp    int64  `json:"end_timestamp"`
}

func (u *upstream) listSandboxes(a *Auth) ([]sandboxInfo, error) {
	raw, err := u.doJSON(http.MethodGet, u.base(a.Region)+"/agentdr/v2/assistant/sandbox/list",
		userapiHeaders(a.AccessToken), nil, false)
	if err != nil {
		return nil, err
	}
	var lst []sandboxInfo
	if json.Unmarshal(raw, &lst) == nil && lst != nil {
		return lst, nil
	}
	var wrap struct {
		SandboxList []sandboxInfo `json:"sandbox_list"`
	}
	if json.Unmarshal(raw, &wrap) == nil {
		return wrap.SandboxList, nil
	}
	return nil, nil
}

func (u *upstream) applySandbox(a *Auth) error {
	_, err := u.doJSON(http.MethodPost, u.base(a.Region)+"/agentdr/v2/assistant/sandbox/apply",
		userapiHeaders(a.AccessToken), map[string]any{"sandbox_name": "default"}, false)
	return err
}

// ensureSandbox 保证有可用沙箱，归一化 endpoint 为 relay proxy 基址。
func (u *upstream) ensureSandbox(a *Auth) (string, string, error) {
	now := time.Now().Unix()
	a.mu.Lock()
	hasValid := a.SandboxID != "" && a.SandboxEndpoint != "" && (a.EndTimestamp == 0 || a.EndTimestamp > now)
	if hasValid {
		a.SandboxEndpoint = relayProxyBase(relayBase(a.SandboxEndpoint), a.SandboxID)
		sid, sep := a.SandboxID, a.SandboxEndpoint
		a.mu.Unlock()
		return sid, sep, nil
	}
	a.mu.Unlock()
	lst, err := u.listSandboxes(a)
	if err != nil {
		return "", "", err
	}
	if len(lst) == 0 {
		if err := u.applySandbox(a); err != nil {
			return "", "", err
		}
		lst, err = u.listSandboxes(a)
		if err != nil {
			return "", "", err
		}
		if len(lst) == 0 {
			return "", "", upstreamErrf("server", 0, 0, "no sandbox available after apply")
		}
	}
	pick := lst[0]
	for _, s := range lst {
		exp := s.EndTimestamp
		pexp := pick.EndTimestamp
		if (exp == 0 || exp > now) && (pick.SandboxID == "" || (pexp != 0 && pexp <= now)) {
			pick = s
		}
	}
	if pick.SandboxID == "" {
		return "", "", upstreamErrf("server", 0, 0, "sandbox response missing sandbox_id")
	}
	a.mu.Lock()
	a.SandboxID = pick.SandboxID
	a.SandboxEndpoint = relayProxyBase(pick.SandboxEndpoint, pick.SandboxID)
	a.EndTimestamp = pick.EndTimestamp
	sid, sep := a.SandboxID, a.SandboxEndpoint
	a.mu.Unlock()
	return sid, sep, nil
}

// relayJSON 调 relay 端点（ok/code envelope 校验）。
func (u *upstream) relayJSON(a *Auth, base, method, path string, body any) (json.RawMessage, error) {
	headers := map[string]string{"Accept": "application/json, text/plain, */*"}
	if a != nil && a.AccessToken != "" {
		headers["Authorization"] = bearer(a.AccessToken)
	}
	full := strings.TrimRight(base, "/") + path
	req, err := http.NewRequest(method, full, marshalReader(body))
	if err != nil {
		return nil, err
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	resp, err := u.http.Do(req)
	if err != nil {
		return nil, upstreamErrf("server", 0, 0, "%v", err)
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if err != nil {
		return nil, upstreamErrf("server", resp.StatusCode, 0, "read: %v", err)
	}
	text := string(raw)
	if resp.StatusCode >= 400 {
		return nil, upstreamErrf(classify(resp.StatusCode, 0, text), resp.StatusCode, 0, "%.200s", text)
	}
	var env struct {
		OK    *bool `json:"ok"`
		Code  any   `json:"code"`
		Error any   `json:"error"`
		Msg   any   `json:"msg"`
		Data  any   `json:"data"`
	}
	if json.Unmarshal(raw, &env) != nil {
		return json.RawMessage(raw), nil
	}
	code := toInt64(env.Code)
	msg := toString(env.Error)
	if msg == "" {
		msg = toString(env.Msg)
	}
	if (env.OK != nil && !*env.OK) || env.Code != nil && code != 0 {
		kind := classify(resp.StatusCode, code, msg)
		return nil, upstreamErrf(kind, resp.StatusCode, code, "%s", msg)
	}
	if env.Data != nil {
		out, err := json.Marshal(env.Data)
		if err != nil {
			return json.RawMessage(raw), nil
		}
		return out, nil
	}
	return json.RawMessage(raw), nil
}

func (u *upstream) wakeSandbox(a *Auth, sandboxID string) error {
	a.mu.Lock()
	endpoint := a.SandboxEndpoint
	a.mu.Unlock()
	bare := relayBaseFromProxy(endpoint)
	_, err := u.relayJSON(a, bare, http.MethodPost, "/v1/sandboxes/"+sandboxID+"/wake", map[string]any{
		"access_hold_ms":               600000,
		"reason":                       "autoclaw2api chat request",
		"apply_business_busy_cooldown": true,
	})
	return err
}

type modelConfigItem struct {
	ID            string `json:"id"`
	Name          string `json:"name"`
	ContextWindow any    `json:"contextWindow"`
}

// fetchModelConfig 拉模型配置目录（global 区用）。
func (u *upstream) fetchModelConfig(a *Auth) []modelConfigItem {
	raw, err := u.doJSON(http.MethodGet, u.base(a.Region)+configModelsPath, userapiHeaders(a.AccessToken), nil, false)
	if err != nil {
		return nil
	}
	var data struct {
		Models []modelConfigItem `json:"models"`
	}
	if json.Unmarshal(raw, &data) != nil {
		return nil
	}
	return data.Models
}

// fetchSandboxModels 沙箱直连 /v1/models。
func (u *upstream) fetchSandboxModels(a *Auth) []string {
	a.mu.Lock()
	base := a.SandboxEndpoint
	a.mu.Unlock()
	if base == "" {
		return nil
	}
	headers := map[string]string{"Accept": "application/json, text/plain, */*"}
	if a.AccessToken != "" {
		headers["Authorization"] = bearer(a.AccessToken)
	}
	req, err := http.NewRequest(http.MethodGet, strings.TrimRight(base, "/")+"/v1/models", nil)
	if err != nil {
		return nil
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	resp, err := u.http.Do(req)
	if err != nil || resp.StatusCode != 200 {
		if resp != nil {
			resp.Body.Close()
		}
		return nil
	}
	defer resp.Body.Close()
	var data struct {
		Data []struct {
			ID string `json:"id"`
		} `json:"data"`
	}
	if json.NewDecoder(io.LimitReader(resp.Body, 4<<20)).Decode(&data) != nil {
		return nil
	}
	out := make([]string, 0, len(data.Data))
	for _, m := range data.Data {
		if m.ID != "" {
			out = append(out, m.ID)
		}
	}
	return out
}

// ---- chat 通道 ----

// proxyChatHeaders chat_proxy 的头（移植 proxy_chat_headers）。
func proxyChatHeaders(token, model string) map[string]string {
	return map[string]string{
		"Accept":           "application/json, text/plain, */*",
		"Authorization":    bearer(token),
		"X-Authorization":  bearer(token),
		"X-Request-Model":  model,
		"X-Tm":             "mac",
		"X-Version":        clientVer,
		"X-Product":        "autoclaw",
		"X-Channel":        "official",
		"X-Lang":           "zh-CN",
		"X-Client-Type":    "pc",
		"X-Trace-Id":       newTraceID(),
		"x_trace_id":       "autoclaw-bridge",
		"User-Agent":       "AutoClaw/" + clientVer,
	}
}

// chatProxy proxy 通道：userapi 基址 + /autoclaw-proxy/proxy/autoclaw/v1/chat/completions。
// 返回流式响应（调用方负责 Close）。
func (u *upstream) chatProxy(a *Auth, body []byte, model string) (*http.Response, error) {
	full := u.base(a.Region) + proxyChatPath
	payload := prepareProxyBody(body, model)
	req, err := http.NewRequest(http.MethodPost, full, bytes.NewReader(payload))
	if err != nil {
		return nil, err
	}
	for k, v := range proxyChatHeaders(a.AccessToken, model) {
		req.Header.Set(k, v)
	}
	resp, err := u.http.Do(req)
	if err != nil {
		return nil, upstreamErrf("server", 0, 0, "%v", err)
	}
	if resp.StatusCode >= 400 {
		raw, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
		resp.Body.Close()
		text := string(raw)
		return nil, upstreamErrf(classify(resp.StatusCode, 0, text), resp.StatusCode, 0, "%.200s", text)
	}
	return resp, nil
}

// chatOpenAI sandbox openai 通道。resp==nil 且 status!=0 表示上游 4xx/5xx。
func (u *upstream) chatOpenAI(a *Auth, body []byte) (*http.Response, int, string) {
	a.mu.Lock()
	base := a.SandboxEndpoint
	a.mu.Unlock()
	if base == "" {
		return nil, 0, fmt.Sprintf("no sandbox endpoint for account %s", a.UserID)
	}
	model, xm := normalizeModel(peekModel(body))
	payload := prepareModelBody(body)
	headers := map[string]string{
		"Accept":       "application/json, text/plain, */*",
		"Content-Type": "application/json",
	}
	if a.AccessToken != "" {
		headers["Authorization"] = bearer(a.AccessToken)
	}
	if xm != "" {
		headers["x-openclaw-model"] = xm
	}
	_ = model
	req, err := http.NewRequest(http.MethodPost, strings.TrimRight(base, "/")+"/v1/chat/completions", bytes.NewReader(payload))
	if err != nil {
		return nil, 0, err.Error()
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	resp, err := u.http.Do(req)
	if err != nil {
		return nil, 0, err.Error()
	}
	if resp.StatusCode >= 400 {
		raw, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
		resp.Body.Close()
		return nil, resp.StatusCode, string(raw)
	}
	return resp, resp.StatusCode, ""
}

// ---- 积分流水（credit_detail）----

func (u *upstream) ledgers(a *Auth, page, pageSize int) (json.RawMessage, error) {
	h := userapiHeaders(a.AccessToken)
	full := fmt.Sprintf("%s/agent-assetmgr/api/v1/ledgers_std?page=%d&page_size=%d", u.base(a.Region), page, pageSize)
	req, err := http.NewRequest(http.MethodGet, full, nil)
	if err != nil {
		return nil, err
	}
	for k, v := range h {
		req.Header.Set(k, v)
	}
	resp, err := u.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 2<<20))
	return json.RawMessage(raw), nil
}

func (u *upstream) pointsExpiring(a *Auth) (json.RawMessage, error) {
	h := userapiHeaders(a.AccessToken)
	req, err := http.NewRequest(http.MethodGet, u.base(a.Region)+"/agent-assetmgr/api/v1/points/expiring", nil)
	if err != nil {
		return nil, err
	}
	for k, v := range h {
		req.Header.Set(k, v)
	}
	resp, err := u.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	return json.RawMessage(raw), nil
}

// ---- 小工具 ----

var routePrefixRe = regexp.MustCompile(`^[a-z]+_`)

func marshalReader(v any) io.Reader {
	if v == nil {
		return nil
	}
	raw, err := json.Marshal(v)
	if err != nil {
		return nil
	}
	return bytes.NewReader(raw)
}

func toInt64(v any) int64 {
	switch t := v.(type) {
	case float64:
		return int64(t)
	case int64:
		return t
	case int:
		return int64(t)
	case json.Number:
		n, _ := t.Int64()
		return n
	case string:
		var n int64
		fmt.Sscanf(strings.TrimSpace(t), "%d", &n)
		return n
	case bool:
		if t {
			return 1
		}
	}
	return 0
}

func toString(v any) string {
	if s, ok := v.(string); ok {
		return s
	}
	if v == nil {
		return ""
	}
	raw, err := json.Marshal(v)
	if err != nil {
		return ""
	}
	return string(raw)
}
