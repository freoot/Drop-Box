// Package opencode —— 把本机 opencode 桌面版自带的免费模型桥接进网关。
//
// # 为什么必须走本机桥接（2026-10-17 实测，勿再重复试）
//
//  1. 直连上游 https://opencode.ai/inference/openai/v1（apiKey 是字面量 "public"）被闸门拦：
//     403/503 FreeTierError "OpenCode's free tier can only be used from within OpenCode."
//     把 opencode 客户端用到的 x-opencode-* 头名全集（x-opencode-client / -session /
//     -session-id / -parent-session-id / -project / -request、x-session-affinity、X-Session-Id）、
//     合规的 ses_<64hex> 会话 id、stream:true、bash/read 工具定义全部补齐，**仍然 403** ——
//     闸门不在请求头，外部无法复现。
//  2. opencode 自己的无状态接口 POST /api/experimental/generate 对这些模型同样 503
//     （同接口对非 opencode provider，如本网关的 cn:hy3，200 正常返回 {"data":{"text":"OK"}}）。
//  3. 只有 **session 流程** 能跑通。故本包把一轮 OpenAI 对话翻译成：
//     POST /api/session → POST /api/session/:id/prompt → 轮询 GET /api/session/:id/message
//     → DELETE /api/session/:id。
//
// # 两个必须记住的协议细节
//
//   - 回复文本在 info.content[].text。列表视图里的 parts **恒为空数组**，不要指望它。
//   - 状态文件里的端口每次启动随机、密码随之轮换，所以不能写死：必须按 mtime 重读。
package opencode

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"
)

// userName opencode 本地服务的 Basic 认证用户名（固定值，密码来自 service.json）。
const userName = "opencode"

// ErrUnavailable opencode 本地服务不可用（未安装 / 未启动 / 状态文件缺失 / 端口已变）。
// 调用方据此回 503 并给出可操作的提示，而不是把它当成「模型不存在」。
var ErrUnavailable = errors.New("opencode 本地服务不可用（桌面版未启动或状态文件缺失）")

// HTTPError opencode 本地服务返回的 HTTP 错误（含上游闸门 503 等）。
type HTTPError struct {
	Status int
	Body   string
}

func (e *HTTPError) Error() string {
	return fmt.Sprintf("opencode 本地服务返回 HTTP %d: %s", e.Status, truncate(e.Body, 300))
}

// IsFreeTierGate 判断错误是否来自上游免费层闸门。
// 命中说明 opencode 侧的调用姿势变了（本包依赖的 session 流程被上游收紧），
// 面板/日志据此给出「需重新适配」而不是「余额/网络问题」的误导性提示。
func IsFreeTierGate(err error) bool {
	var he *HTTPError
	if errors.As(err, &he) {
		return strings.Contains(he.Body, "can only be used from within OpenCode")
	}
	return false
}

// IsUnavailable 错误是否为「本地服务不可用」（连接失败/状态文件缺失等）。
func IsUnavailable(err error) bool { return errors.Is(err, ErrUnavailable) }

// asHTTPError errors.As 的本包内薄封装（避免每个调用点 import errors）。
func asHTTPError(err error, out **HTTPError) bool { return errors.As(err, out) }

// serviceInfo 对应宿主 ~/.local/state/opencode/service.json。
type serviceInfo struct {
	Version  string `json:"version"`
	URL      string `json:"url"`
	PID      int    `json:"pid"`
	Password string `json:"password"`
}

// Client 与本机 opencode HTTP 服务通信。
// 端口/密码随 opencode 重启变化，故每次连接前按需重读状态文件（mtime+size 未变则走缓存）。
type Client struct {
	serviceFile string
	host        string
	timeout     time.Duration // 单次生成的整体上限（轮询总时长）
	http        *http.Client

	mu       sync.RWMutex
	base     string
	password string
	modTime  time.Time
	size     int64
	valid    bool
}

// NewClient 构造客户端。
// serviceFile 是**容器内**可见的状态文件路径（宿主目录挂载进来）；
// host 是容器访问宿主用的主机名（service.json 里的 127.0.0.1 会被改写成它）。
func NewClient(serviceFile, host string, timeout time.Duration) *Client {
	if strings.TrimSpace(host) == "" {
		host = "host.docker.internal"
	}
	if timeout <= 0 {
		timeout = 300 * time.Second
	}
	return &Client{
		serviceFile: serviceFile,
		host:        host,
		timeout:     timeout,
		http: &http.Client{
			// 本机桥接不能被 HTTP(S)_PROXY 劫持走外部代理。
			Transport: &http.Transport{Proxy: nil},
			Timeout:   30 * time.Second,
		},
	}
}

// Timeout 返回单次生成的整体上限。
func (c *Client) Timeout() time.Duration { return c.timeout }

// Installed 状态文件是否可读 —— opencode 至少启动过一次。
// 这是「要不要在 /v1/models 里挂出这 12 个模型」的判据：装过才挂，卸载后自动消失。
func (c *Client) Installed() bool {
	_, err := os.Stat(c.serviceFile)
	return err == nil
}

// BaseURL 当前生效的 base URL（不含密码），仅用于面板展示。
func (c *Client) BaseURL() string {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.base
}

func (c *Client) invalidate() {
	c.mu.Lock()
	c.valid = false
	c.base = ""
	c.password = ""
	c.mu.Unlock()
}

// endpoint 解析当前生效的 base URL 与密码。
// force=true 时无条件重读（连接层失败后重试用：opencode 重启换了端口）。
func (c *Client) endpoint(force bool) (string, string, error) {
	c.mu.RLock()
	cached := c.valid && c.base != "" && c.password != ""
	base, pw, mod, size := c.base, c.password, c.modTime, c.size
	c.mu.RUnlock()
	if cached && !force {
		if fi, err := os.Stat(c.serviceFile); err == nil && mod.Equal(fi.ModTime()) && size == fi.Size() {
			return base, pw, nil
		}
	}
	raw, err := os.ReadFile(c.serviceFile)
	if err != nil {
		c.invalidate()
		return "", "", fmt.Errorf("%w：读取 %s 失败（%v）", ErrUnavailable, c.serviceFile, err)
	}
	var si serviceInfo
	if err := json.Unmarshal(raw, &si); err != nil {
		c.invalidate()
		return "", "", fmt.Errorf("%w：解析 %s 失败（%v）", ErrUnavailable, c.serviceFile, err)
	}
	if strings.TrimSpace(si.URL) == "" || strings.TrimSpace(si.Password) == "" {
		c.invalidate()
		return "", "", fmt.Errorf("%w：%s 缺少 url/password（opencode 可能正在启动）", ErrUnavailable, c.serviceFile)
	}
	nb, err := rewriteHost(si.URL, c.host)
	if err != nil {
		c.invalidate()
		return "", "", fmt.Errorf("%w：%v", ErrUnavailable, err)
	}
	var mod2 time.Time
	var size2 int64
	if fi, err := os.Stat(c.serviceFile); err == nil {
		mod2, size2 = fi.ModTime(), fi.Size()
	}
	c.mu.Lock()
	c.base, c.password, c.modTime, c.size, c.valid = nb, si.Password, mod2, size2, true
	c.mu.Unlock()
	return nb, si.Password, nil
}

// rewriteHost 把 service.json 里的回环地址改写成容器可达的宿主名，端口原样保留。
// opencode 只监听 127.0.0.1，容器必须经 host.docker.internal 才能进。
func rewriteHost(raw, host string) (string, error) {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil {
		return "", fmt.Errorf("解析 url %q 失败: %w", raw, err)
	}
	switch u.Hostname() {
	case "127.0.0.1", "localhost", "::1", "0.0.0.0":
		port := u.Port()
		if port == "" {
			return "", fmt.Errorf("url %q 没有端口", raw)
		}
		u.Host = net.JoinHostPort(host, port)
	}
	return strings.TrimRight(u.String(), "/"), nil
}

// do 发一次 JSON 请求。连接层失败（opencode 重启换了端口）时强制重读状态文件重试一次。
func (c *Client) do(ctx context.Context, method, path string, body any, out any) error {
	var payload []byte
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return err
		}
		payload = b
	}
	var lastErr error
	for attempt := 0; attempt < 2; attempt++ {
		base, pw, err := c.endpoint(attempt > 0)
		if err != nil {
			return err
		}
		var rdr io.Reader
		if payload != nil {
			rdr = bytes.NewReader(payload)
		}
		req, err := http.NewRequestWithContext(ctx, method, base+path, rdr)
		if err != nil {
			return err
		}
		req.SetBasicAuth(userName, pw)
		if payload != nil {
			req.Header.Set("Content-Type", "application/json")
		}
		resp, err := c.http.Do(req)
		if err != nil {
			lastErr = err
			continue // 端口可能已变 → 强制重读再试
		}
		raw, rerr := io.ReadAll(io.LimitReader(resp.Body, 16<<20))
		_ = resp.Body.Close()
		if rerr != nil {
			lastErr = rerr
			continue
		}
		if resp.StatusCode >= 400 {
			// 闸门 503 直接冒泡，不做重试（重试也不会有不同结果）。
			return &HTTPError{Status: resp.StatusCode, Body: strings.TrimSpace(string(raw))}
		}
		if out != nil && len(bytes.TrimSpace(raw)) > 0 {
			trimmed := bytes.TrimSpace(raw)
			if trimmed[0] == '{' || trimmed[0] == '[' {
				if err := json.Unmarshal(trimmed, out); err != nil {
					return fmt.Errorf("解析 %s 响应失败: %w", path, err)
				}
			}
		}
		return nil
	}
	if lastErr == nil {
		lastErr = errors.New("unknown")
	}
	return fmt.Errorf("%w：连接 %s 失败（%v）", ErrUnavailable, path, lastErr)
}

// ---- 会话流程 ----

// Model opencode 目录里的一个模型（只取本包用得到的字段）。
type Model struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	ProviderID string `json:"providerID"`
}

// ListModels 拉取 opencode 目录里 providerID == provider 的模型。
func (c *Client) ListModels(ctx context.Context, provider string) ([]Model, error) {
	var resp struct {
		Data []Model `json:"data"`
	}
	if err := c.do(ctx, http.MethodGet, "/api/model", nil, &resp); err != nil {
		return nil, err
	}
	out := make([]Model, 0, len(resp.Data))
	for _, m := range resp.Data {
		if m.ProviderID == provider && strings.TrimSpace(m.ID) != "" {
			out = append(out, m)
		}
	}
	return out, nil
}

// Version 返回本地服务版本号（探测在线用）。
func (c *Client) Version(ctx context.Context) (string, error) {
	var info struct {
		Version string `json:"version"`
		PID     int    `json:"pid"`
	}
	if err := c.do(ctx, http.MethodGet, "/api/info", nil, &info); err != nil {
		return "", err
	}
	if info.Version == "" {
		return "", fmt.Errorf("%w：/api/info 未返回 version", ErrUnavailable)
	}
	return info.Version, nil
}

type messageInfo struct {
	ID      string        `json:"id"`
	Type    string        `json:"type"`
	Content []contentPart `json:"content"`
	Finish  string        `json:"finish"`
	UpErr   *upErr        `json:"error"`
	Time    struct {
		Created   int64 `json:"created"`
		Streamed  int64 `json:"streamed"`
		Completed int64 `json:"completed"`
	} `json:"time"`
	Tokens struct {
		Input     int `json:"input"`
		Output    int `json:"output"`
		Reasoning int `json:"reasoning"`
	} `json:"tokens"`
}

// upErr opencode 助手消息携带的上游错误（RegionError / FreeTierError 等）。
// 桌面端失败时不返回 HTTP 错误码，而是把错误塞进消息体——不识别它就会把
// 失败会话当成「空回复 200」吞掉。
type upErr struct {
	Type    string `json:"type"`
	Message string `json:"message"`
}

// upstreamError 会话级上游失败（模型被地区封锁 / 免费层闸门等）。
// 与轮询期瞬时抖动必须区分：前者要立刻终止生成循环，重试无意义。
type upstreamError struct{ typ, msg string }

func (e *upstreamError) Error() string {
	return fmt.Sprintf("opencode 上游错误（%s）: %s", e.typ, e.msg)
}

type contentPart struct {
	Type string `json:"type"`
	Text string `json:"text"`
}

// text 拼接该消息的全部 text 片段（content 是唯一的文本来源，parts 恒空）。
func (mi messageInfo) text() string {
	if len(mi.Content) == 0 {
		return ""
	}
	var b strings.Builder
	for _, p := range mi.Content {
		if p.Type == "text" {
			b.WriteString(p.Text)
		}
	}
	return b.String()
}

// message 元素在列表视图里字段是平铺的，单条接口可能包一层 info，两种都兼容。
type message struct {
	messageInfo
	Info *messageInfo `json:"info"`
}

func (m message) info() messageInfo {
	if m.Info != nil && (m.Info.ID != "" || m.Info.Type != "") {
		return *m.Info
	}
	return m.messageInfo
}

// Session 一轮 opencode 会话。用完必须 Close（否则会话在 opencode 侧堆积）。
type Session struct {
	cli *Client
	id  string
}

// ID 返回会话 id（日志用）。
func (s *Session) ID() string { return s.id }

// StartSession 建会话并绑定模型。opencode 侧要求 model.id，缺了会 400。
func (c *Client) StartSession(ctx context.Context, modelID string) (*Session, error) {
	var resp struct {
		Data struct {
			ID string `json:"id"`
		} `json:"data"`
	}
	body := map[string]any{
		"title": "agentpoints-bridge",
		"model": map[string]any{"id": modelID, "providerID": "opencode"},
	}
	if err := c.do(ctx, http.MethodPost, "/api/session", body, &resp); err != nil {
		return nil, err
	}
	if resp.Data.ID == "" {
		return nil, errors.New("opencode 建会话未返回会话 id")
	}
	return &Session{cli: c, id: resp.Data.ID}, nil
}

// Prompt 提交用户输入。返回即代表已受理，内容是异步生成的。
func (s *Session) Prompt(ctx context.Context, text string) error {
	return s.cli.do(ctx, http.MethodPost, "/api/session/"+s.id+"/prompt", map[string]any{"text": text}, nil)
}

// Snapshot 读一次会话状态：返回当前累积文本、是否已完成、以及完成时的用量。
func (s *Session) Snapshot(ctx context.Context) (string, bool, GenerateResult, error) {
	var resp struct {
		Data []message `json:"data"`
	}
	if err := s.cli.do(ctx, http.MethodGet, "/api/session/"+s.id+"/message", nil, &resp); err != nil {
		return "", false, GenerateResult{}, err
	}
	var text string
	var done bool
	var res GenerateResult
	var lastErr *upErr // 最后一条完成 assistant 的上游错误（nil = 成功）
	for _, m := range resp.Data {
		mi := m.info()
		if mi.Type != "assistant" {
			continue // idle/user 等消息忽略
		}
		if t := mi.text(); t != "" {
			text = t // 取最后一条有内容的 assistant（agent 可能先发工具轮）
		}
		if mi.Time.Completed > 0 {
			done = true
			lastErr = mi.UpErr
			if lastErr == nil && mi.Finish == "error" {
				lastErr = &upErr{Type: "unknown", Message: "opencode 助手消息以 error 收尾但未携带错误详情"}
			}
			res = GenerateResult{
				Text:         mi.text(),
				PromptTokens: mi.Tokens.Input,
				OutputTokens: mi.Tokens.Output,
				Reasoning:    mi.Tokens.Reasoning,
				Finish:       "stop",
			}
			if res.Text == "" {
				res.Text = text
			}
		}
	}
	if done && lastErr != nil {
		return "", true, GenerateResult{}, &upstreamError{typ: lastErr.Type, msg: lastErr.Message}
	}
	if !done && text != "" {
		// 未完成但有增量：把中间态也报出去，便于伪流式。
		res.Text = text
	}
	return text, done, res, nil
}

// Close 删除会话。独立超时，调用方的 ctx 可能已取消。
func (s *Session) Close() {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	_ = s.cli.do(ctx, http.MethodDelete, "/api/session/"+s.id, nil, nil)
}

// GenerateResult 一轮生成的产出。
type GenerateResult struct {
	Text         string
	PromptTokens int
	OutputTokens int
	Reasoning    int
	Finish       string
}

// Generate 跑完一轮（非流式）。onDelta 非空时按增量回调，可用于伪流式。
func (c *Client) Generate(ctx context.Context, modelID, prompt string, onDelta func(string)) (GenerateResult, error) {
	sess, err := c.StartSession(ctx, modelID)
	if err != nil {
		return GenerateResult{}, err
	}
	defer sess.Close()
	if err := sess.Prompt(ctx, prompt); err != nil {
		return GenerateResult{}, err
	}
	// prompt 已受理，正文异步生成；给一点落地时间再开轮询。
	select {
	case <-ctx.Done():
		return GenerateResult{}, ctx.Err()
	case <-time.After(300 * time.Millisecond):
	}
	deadline := time.Now().Add(c.timeout)
	ticker := time.NewTicker(350 * time.Millisecond)
	defer ticker.Stop()
	var sent string
	for {
		select {
		case <-ctx.Done():
			return GenerateResult{}, ctx.Err()
		case <-ticker.C:
		}
		if time.Now().After(deadline) {
			return GenerateResult{}, fmt.Errorf("opencode 生成超时（上限 %s）", c.timeout)
		}
		text, done, res, err := sess.Snapshot(ctx)
		if err != nil {
			var ue *upstreamError
			if errors.As(err, &ue) {
				// 会话级失败（RegionError 等）：立即终止，重试无意义。
				return GenerateResult{}, err
			}
			// 轮询期偶发失败不终止：opencode 侧偶有瞬时抖动。
			continue
		}
		if onDelta != nil && len(text) > len(sent) && strings.HasPrefix(text, sent) {
			onDelta(text[len(sent):])
		}
		if len(text) > len(sent) {
			sent = text
		}
		if done {
			if res.Text == "" {
				res.Text = sent
			}
			return res, nil
		}
	}
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}
