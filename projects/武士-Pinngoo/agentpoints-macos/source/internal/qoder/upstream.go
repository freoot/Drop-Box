package qoder

// upstream：网关签名 API 客户端（jobToken 换取/续期、账号状态、模型目录、
// chat SSE 流）。错误分类：AuthError（凭证被拒）→ 续期自救；BusyError
// （10605 排队/并发拒绝）→ 退避重试；UpstreamError（4xx/5xx）→ 原样回传。

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"sync/atomic"
	"time"
)

// AuthError 会话/PAT 凭证被拒（401/403 且非 10605）。
type AuthError struct {
	StatusCode int
	Detail     string
}

func (e *AuthError) Error() string { return fmt.Sprintf("HTTP %d %.200s", e.StatusCode, e.Detail) }

// BusyError 网关排队/并发拒绝（业务码 10605），会话有效、退避后可重试。
type BusyError struct {
	StatusCode int
	Message    string
	RetryAfter time.Duration
}

func (e *BusyError) Error() string {
	s := "gateway busy (10605): " + e.Message
	if e.RetryAfter > 0 {
		s += fmt.Sprintf(" (retry after %s)", e.RetryAfter)
	}
	return s
}

// UpstreamError 其余上游错误（参数拒绝/网关故障），保留真实状态码。
type UpstreamError struct {
	StatusCode int
	Body       string
}

func (e *UpstreamError) Error() string {
	return fmt.Sprintf("gateway HTTP %d: %.200s", e.StatusCode, e.Body)
}

// InStreamError 流内（HTTP 200）网关错误帧。
type InStreamError struct {
	Status int
	Detail string
}

func (e *InStreamError) Error() string {
	return fmt.Sprintf("gateway in-stream error (HTTP %d): %s", e.Status, e.Detail)
}

const errBodyCap = 4 << 10

// busyCode 网关排队/并发拒绝业务码。
const busyCode = "10605"

func newHTTPClient(timeout time.Duration) *http.Client {
	return &http.Client{Timeout: timeout}
}

// streamClient SSE 专用：不设总超时（长流合法），只限响应头等待。
var streamClient atomic.Pointer[http.Client]

func init() {
	tr := http.DefaultTransport.(*http.Transport).Clone()
	tr.ResponseHeaderTimeout = 120 * time.Second
	streamClient.Store(&http.Client{Transport: tr})
}

func busyMeta(msg string) time.Duration {
	var meta struct {
		RetryAfterSeconds int `json:"retryAfterSeconds"`
	}
	if strings.HasPrefix(strings.TrimSpace(msg), "{") && json.Unmarshal([]byte(msg), &meta) == nil && meta.RetryAfterSeconds > 0 {
		return time.Duration(meta.RetryAfterSeconds) * time.Second
	}
	return 0
}

// classifyEnvelope 401/403 信封：区分 10605 排队拒绝与真凭证失败。
func classifyEnvelope(statusCode int, body []byte) error {
	s := strings.TrimSpace(string(body))
	if i := strings.IndexByte(s, '{'); i > 0 {
		s = s[i:]
	}
	var outer struct {
		Code    json.RawMessage `json:"code"`
		Message string          `json:"message"`
	}
	if json.Unmarshal([]byte(s), &outer) == nil {
		code := strings.Trim(string(outer.Code), `"`)
		if code == busyCode {
			msg := outer.Message
			if msg == "" {
				msg = "gateway busy"
			}
			return &BusyError{StatusCode: statusCode, Message: msg, RetryAfter: busyMeta(msg)}
		}
	}
	if statusCode == 401 || statusCode == 403 {
		return &AuthError{StatusCode: statusCode, Detail: string(body)}
	}
	return &UpstreamError{StatusCode: statusCode, Body: string(body)}
}

// commonHeaders 签名 API 公共头（machine 身份 + MD5 签名）。
func commonHeaders(acct *Account, date, sig string) http.Header {
	h := http.Header{}
	h.Set("cosy-machinetoken", acct.MachineToken)
	h.Set("cosy-machinetype", acct.MachineType)
	h.Set("login-version", "v2")
	h.Set("appcode", appCode)
	h.Set("accept", "application/json")
	h.Set("accept-encoding", "identity")
	h.Set("cosy-version", "0.1.43")
	h.Set("cosy-clienttype", "5")
	h.Set("date", date)
	h.Set("signature", sig)
	h.Set("content-type", "application/json")
	h.Set("cosy-machineid", acct.MachineID)
	h.Set("user-agent", "Go-http-client/2.0")
	return h
}

// postEncoded 签名 POST（Encode 编码 body），machine 身份鉴权。
func postEncoded(ctx context.Context, client *http.Client, urlStr string, obj interface{}, acct *Account) (map[string]interface{}, error) {
	date := signDate()
	sig := signDateMD5(date)
	plain, err := marshalNoEscape(obj)
	if err != nil {
		return nil, err
	}
	body, err := gatewayEncode(plain)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, urlStr, strings.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header = commonHeaders(acct, date, sig)
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		detail, _ := io.ReadAll(io.LimitReader(resp.Body, errBodyCap))
		_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 1<<20))
		return nil, classifyEnvelope(resp.StatusCode, detail)
	}
	var result map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}
	return result, nil
}

type jobTokenInner struct {
	PersonalToken      string          `json:"personalToken"`
	SecurityOauthToken string          `json:"securityOauthToken"`
	RefreshToken       string          `json:"refreshToken"`
	NeedRefresh        bool            `json:"needRefresh"`
	AuthInfo           json.RawMessage `json:"authInfo"`
}

type encodedPayload struct {
	Payload       string `json:"payload"`
	EncodeVersion string `json:"encodeVersion"`
}

// exchangeJobToken PAT 冷启动换取 jobToken。
func exchangeJobToken(ctx context.Context, client *http.Client, acct *Account) (map[string]interface{}, error) {
	inner, err := marshalNoEscape(jobTokenInner{PersonalToken: acct.PAT, AuthInfo: json.RawMessage("{}")})
	if err != nil {
		return nil, err
	}
	return postEncoded(ctx, client, authBase+jobPath, encodedPayload{Payload: string(inner), EncodeVersion: "1"}, acct)
}

// refreshJobToken refreshToken 续期。
func refreshJobToken(ctx context.Context, client *http.Client, acct *Account) (map[string]interface{}, error) {
	inner, err := marshalNoEscape(jobTokenInner{
		PersonalToken:      acct.PAT,
		SecurityOauthToken: acct.securityOauthVal(),
		RefreshToken:       acct.refreshTokenVal(),
		NeedRefresh:        true,
		AuthInfo:           json.RawMessage("{}"),
	})
	if err != nil {
		return nil, err
	}
	return postEncoded(ctx, client, authBase+jobPath, encodedPayload{Payload: string(inner), EncodeVersion: "1"}, acct)
}

// userStatusInner /user/status 载荷（字段顺序对齐官方客户端，签名兼容）。
type userStatusInner struct {
	UserID             string          `json:"userId"`
	PersonalToken      string          `json:"personalToken"`
	SecurityOauthToken string          `json:"securityOauthToken"`
	RefreshToken       string          `json:"refreshToken"`
	NeedRefresh        bool            `json:"needRefresh"`
	AuthInfo           json.RawMessage `json:"authInfo"`
}

// fetchUserStatus 订阅层级（machine 身份签名，不带 bearer）。
func fetchUserStatus(ctx context.Context, client *http.Client, acct *Account, userID string) (string, error) {
	inner, err := marshalNoEscape(userStatusInner{UserID: userID, AuthInfo: json.RawMessage("{}")})
	if err != nil {
		return "", err
	}
	raw, err := postEncoded(ctx, client, authBase+statPath, encodedPayload{Payload: string(inner), EncodeVersion: "1"}, acct)
	if err != nil {
		return "", err
	}
	return toString(raw["userType"]), nil
}

// fetchQuotaUsage OpenAPI 权威额度（securityOauthToken 作 bearer）。
func fetchQuotaUsage(ctx context.Context, client *http.Client, bearer string) (map[string]interface{}, error) {
	if bearer == "" {
		return nil, fmt.Errorf("quota usage requires a security OAuth token")
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, openBase+quotaPath, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Authorization", "Bearer "+bearer)
	resp, err := (&http.Client{Timeout: 15 * time.Second}).Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return nil, err
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("quota usage HTTP %d: %.200s", resp.StatusCode, string(raw))
	}
	var doc map[string]interface{}
	if json.Unmarshal(raw, &doc) != nil {
		return nil, fmt.Errorf("quota usage decode failed")
	}
	return doc, nil
}

// bearerHeaders 会话签名 API 公共头（bearer + cosy-key 会话密钥）。
func bearerHeaders(sess *sessionContext, dateUnix int64, bearer, accept string) http.Header {
	h := http.Header{}
	h.Set("cosy-data-policy", "AGREE")
	h.Set("content-type", "application/json")
	h.Set("cosy-machinetype", sess.machineType)
	h.Set("cosy-clienttype", "5")
	h.Set("cosy-date", strconv.FormatInt(dateUnix, 10))
	h.Set("cosy-user", sess.ident.UID)
	h.Set("cosy-key", sess.cosyKey)
	h.Set("accept", accept)
	h.Set("authorization", bearer)
	h.Set("accept-encoding", "identity")
	h.Set("cosy-version", "0.1.43")
	h.Set("cosy-machineid", sess.machineID)
	h.Set("cosy-machinetoken", sess.machineToken)
	h.Set("login-version", "v2")
	h.Set("user-agent", "Go-http-client/2.0")
	return h
}

// fetchModelCatalog 动态模型目录（需会话）。
func fetchModelCatalog(ctx context.Context, client *http.Client, sess *sessionContext) (map[string]interface{}, error) {
	full := authBase + modelPath
	body := ""
	dateUnix := time.Now().Unix()
	bearer := sess.buildBearer(dateUnix, body, sigPath(full))
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, full, nil)
	if err != nil {
		return nil, err
	}
	req.Header = bearerHeaders(sess, dateUnix, bearer, "application/json")
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		detail, _ := io.ReadAll(io.LimitReader(resp.Body, errBodyCap))
		_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 1<<20))
		return nil, classifyEnvelope(resp.StatusCode, detail)
	}
	var result map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}
	return result, nil
}

// isDoneLine SSE 终帧（[DONE] 裸帧或信封内 [DONE]）。
func isDoneLine(line string) bool {
	if !strings.HasPrefix(line, "data:") {
		return false
	}
	payload := strings.TrimSpace(line[5:])
	if payload == "[DONE]" {
		return true
	}
	var env struct {
		Body string `json:"body"`
	}
	if json.Unmarshal([]byte(payload), &env) == nil && env.Body == "[DONE]" {
		return true
	}
	return false
}

// detectInStreamError 从 SSE 帧提取网关失败（statusCodeValue>=400 或
// success:false 错误帧）。
func detectInStreamError(line string) *InStreamError {
	if !strings.HasPrefix(line, "data:") {
		return nil
	}
	payload := strings.TrimSpace(line[len("data:"):])
	var env struct {
		Body        string `json:"body"`
		StatusCode  string `json:"statusCode"`
		StatusValue int    `json:"statusCodeValue"`
	}
	if err := json.Unmarshal([]byte(payload), &env); err != nil {
		return nil
	}
	if env.StatusValue >= 400 {
		detail := env.Body
		if detail == "" {
			detail = env.StatusCode
		}
		return &InStreamError{Status: env.StatusValue, Detail: trimJSONMessage(detail)}
	}
	if env.Body != "" || env.StatusCode != "" {
		return nil // 2xx 正常帧
	}
	var bare struct {
		Success bool   `json:"success"`
		MsgCode int    `json:"msgCode"`
		Message string `json:"message"`
		MsgInfo string `json:"msgInfo"`
	}
	if json.Unmarshal([]byte(payload), &bare) != nil {
		return nil
	}
	if !bare.Success && (bare.MsgCode >= 400 || bare.Message != "" || bare.MsgInfo != "") {
		detail := bare.Message
		if detail == "" {
			detail = bare.MsgInfo
		}
		if detail == "" {
			detail = fmt.Sprintf("msgCode %d", bare.MsgCode)
		}
		return &InStreamError{Status: bare.MsgCode, Detail: detail}
	}
	return nil
}

func trimJSONMessage(body string) string {
	var m struct {
		Code    string `json:"code"`
		Message string `json:"message"`
	}
	if err := json.Unmarshal([]byte(body), &m); err == nil {
		if m.Code != "" && m.Message != "" {
			return m.Code + ": " + m.Message
		}
		if m.Message != "" {
			return m.Message
		}
	}
	return strings.TrimSpace(body)
}

// detectInStreamBusy 流内 10605（statusCodeValue 401/403 信封但非凭证问题）。
func detectInStreamBusy(line string) *BusyError {
	s := strings.TrimSpace(line)
	if !strings.HasPrefix(s, "data:") || !strings.Contains(s, "statusCodeValue") {
		return nil
	}
	var obj map[string]interface{}
	if json.Unmarshal([]byte(strings.TrimSpace(s[5:])), &obj) != nil {
		return nil
	}
	scv, ok := obj["statusCodeValue"].(float64)
	if !ok || (scv != 401 && scv != 403) {
		return nil
	}
	bodyMap, ok := parseBodyMap(obj)
	if !ok {
		return nil
	}
	code := toString(bodyMap["code"])
	if code != busyCode {
		return nil
	}
	msg := toString(bodyMap["message"])
	if msg == "" {
		msg = "gateway busy"
	}
	return &BusyError{StatusCode: int(scv), Message: msg, RetryAfter: busyMeta(msg)}
}

func parseBodyMap(obj map[string]interface{}) (map[string]interface{}, bool) {
	switch b := obj["body"].(type) {
	case map[string]interface{}:
		return b, true
	case string:
		var parsed map[string]interface{}
		if json.Unmarshal([]byte(b), &parsed) == nil {
			return parsed, true
		}
	}
	return nil, false
}

// detectInStreamAuth 流内凭证失败（401/403 或 body.code=105 登录过期）。
func detectInStreamAuth(line string) bool {
	s := strings.TrimSpace(line)
	if !strings.HasPrefix(s, "data:") || detectInStreamBusy(s) != nil {
		return false
	}
	var obj map[string]interface{}
	if json.Unmarshal([]byte(strings.TrimSpace(s[5:])), &obj) != nil {
		return false
	}
	if scv, ok := obj["statusCodeValue"].(float64); ok && (scv == 401 || scv == 403) {
		return true
	}
	if bodyMap, ok := parseBodyMap(obj); ok {
		if code := toString(bodyMap["code"]); code == "105" {
			return true
		}
	}
	return false
}

// openStreamLines 打开 chat SSE 流并逐行回调（auth/busy 自救一次）。
// retry 回调由 engine 注入（续期后重建会话）。
func openStreamLines(ctx context.Context, sess *sessionContext, fullURL string, jsonBody []byte, extraHeaders map[string]string, callback func(line string) error) error {
	pathSig := sigPath(fullURL)
	body, err := gatewayEncode(jsonBody)
	if err != nil {
		return err
	}
	dateUnix := time.Now().Unix()
	bearer := sess.buildBearer(dateUnix, body, pathSig)
	headers := bearerHeaders(sess, dateUnix, bearer, "text/event-stream")
	headers.Set("cache-control", "no-cache")
	for k, v := range extraHeaders {
		headers.Set(k, v)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, fullURL, strings.NewReader(body))
	if err != nil {
		return err
	}
	req.Header = headers
	resp, err := streamClient.Load().Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		errBody, _ := io.ReadAll(io.LimitReader(resp.Body, errBodyCap))
		_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 1<<20))
		return classifyEnvelope(resp.StatusCode, errBody)
	}
	sawDone := false
	var gwErr *InStreamError
	scanner := bufio.NewScanner(resp.Body)
	scanner.Buffer(make([]byte, 0, 64*1024), 16*1024*1024)
	for scanner.Scan() {
		line := scanner.Text()
		if line == "" {
			continue
		}
		if isDoneLine(line) {
			sawDone = true
		}
		if busy := detectInStreamBusy(line); busy != nil {
			return busy
		}
		if detectInStreamAuth(line) {
			return &AuthError{StatusCode: 401, Detail: "in-stream auth failure"}
		}
		if e := detectInStreamError(line); e != nil && gwErr == nil {
			gwErr = e
		}
		if err := callback(line); err != nil {
			return err
		}
		if ctx.Err() != nil {
			return ctx.Err()
		}
	}
	if err := scanner.Err(); err != nil {
		return err
	}
	if !sawDone {
		if gwErr != nil {
			return gwErr
		}
		return errors.New("stream ended without [DONE] marker (connection truncated?)")
	}
	return nil
}
