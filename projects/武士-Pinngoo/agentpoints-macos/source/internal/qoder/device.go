package qoder

// device：Qoder 官方设备授权登录（Device Flow + PKCE S256）。
//
// 流程（浏览器侧零客户端、零抓包）：
//   1. 网关生成 verifier/challenge(S256)/nonce/machine_id，拼出授权链接；
//   2. 用户在浏览器打开链接 → qoder.com.cn 登录页（手机号验证码，未注册即注册）
//      → 选择账号 → 确认授权；
//   3. 网关轮询 openapi.qoder.com.cn/api/v1/deviceToken/poll 取 token。
//
// 拿到的 access_token 即 openapi 明文 Bearer，与签到/额度接口同一鉴权体系，
// 因此设备授权账号可直接签到，无需 PAT、无需 COSY 会话。
//
// 边界：该 token 只能走 openapi 明文面（签到/额度/活动），不能用于 chat。
//
// 实测（2026-10-16，对真实上游）：
//   - 把 access_token(dt-) 当 personal_token 喂 exchangeJobToken
//     → HTTP 401 "personal token is invalid"；
//   - 仅带 refresh_token(drt-)、或 securityOauthToken(dt-)+refresh 同样 401；
//   - openapi 上不存在 PAT 管理端点（/sash/api/v1/me/personal-tokens、
//     /api/v1/me/pat 等全 404）；
//   - PAT 管理在 qoder.com.cn 域且**只认网页 cookie**：sash 版返回
//     {"message":"missing cookie header"}，api 版返回 401 "User not authenticated"。
//
// 结论：设备授权与 PAT 是两套鉴权体系，互相换不出来。PAT 只能在 Qoder 控制台
// 手动创建后经面板「粘贴 PAT」导入（该入口在「添加账号 → Qoder 登录」页）。

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

const (
	// deviceWebBase 授权页所在站点（国内版）。
	deviceWebBase = "https://qoder.com.cn"
	// deviceAuthPath 授权页面路径（未登录会 302 到 /users/sign-in）。
	deviceAuthPath = "/device/selectAccounts"
	// devicePollPath 轮询取 token（openapi 明文，带 Cosy 头）。
	devicePollPath = "/api/v1/deviceToken/poll"
	// devicePollTTL 单次授权会话的有效期。
	devicePollTTL = 5 * time.Minute
	// devicePollUA 轮询 UA（对齐官方本地代理）。
	devicePollUA = "qoder-local-proxy"
)

// deviceSession 一次待授权的登录会话。
type deviceSession struct {
	SID       string
	Verifier  string
	Challenge string
	Nonce     string
	MachineID string
	Note      string
	CreatedAt time.Time

	Done   bool              // 授权完成并已落盘
	Failed string            // 终态失败原因（空 = 未失败）
	Result map[string]any    // 完成后回传面板的摘要
}

// b64url 无填充 URL-safe Base64（PKCE 规范）。
func b64url(raw []byte) string { return base64.RawURLEncoding.EncodeToString(raw) }

// startDeviceLogin 生成一次授权会话（PKCE + nonce + machine_id）。
func (e *Engine) startDeviceLogin(note string) (*deviceSession, error) {
	vraw := make([]byte, 32)
	if _, err := rand.Read(vraw); err != nil {
		return nil, err
	}
	verifier := b64url(vraw)
	sum := sha256.Sum256([]byte(verifier))
	ds := &deviceSession{
		SID:       newUUID(),
		Verifier:  verifier,
		Challenge: b64url(sum[:]),
		Nonce:     strings.ReplaceAll(newUUID(), "-", ""),
		MachineID: newUUID(),
		Note:      strings.TrimSpace(note),
		CreatedAt: time.Now(),
	}
	e.devMu.Lock()
	// 顺手回收过期会话，避免长期运行堆内存。
	for sid, old := range e.devices {
		if time.Since(old.CreatedAt) > devicePollTTL {
			delete(e.devices, sid)
		}
	}
	e.devices[ds.SID] = ds
	e.devMu.Unlock()
	return ds, nil
}

// authURL 浏览器授权链接（用户点开即走登录/授权）。
func (ds *deviceSession) authURL() string {
	q := url.Values{}
	q.Set("challenge", ds.Challenge)
	q.Set("challenge_method", "S256")
	q.Set("machine_id", ds.MachineID)
	q.Set("nonce", ds.Nonce)
	return deviceWebBase + deviceAuthPath + "?" + q.Encode()
}

func (e *Engine) deviceLookup(sid string) (*deviceSession, error) {
	sid = strings.TrimSpace(sid)
	if sid == "" {
		return nil, fmt.Errorf("sid required")
	}
	e.devMu.Lock()
	ds := e.devices[sid]
	e.devMu.Unlock()
	if ds == nil {
		return nil, fmt.Errorf("授权会话不存在或已过期，请重新生成链接")
	}
	if time.Since(ds.CreatedAt) > devicePollTTL {
		e.devMu.Lock()
		delete(e.devices, ds.SID)
		e.devMu.Unlock()
		return nil, fmt.Errorf("授权已超时（%s），请重新生成链接", devicePollTTL)
	}
	return ds, nil
}

func (e *Engine) deviceDrop(sid string) {
	e.devMu.Lock()
	delete(e.devices, strings.TrimSpace(sid))
	e.devMu.Unlock()
}

// devicePollOnce 单次轮询。返回 ok=false 表示仍在等待用户确认。
func (e *Engine) devicePollOnce(ctx context.Context, ds *deviceSession) (map[string]any, bool, error) {
	q := url.Values{}
	q.Set("nonce", ds.Nonce)
	q.Set("verifier", ds.Verifier)
	q.Set("challenge_method", "S256")
	req, err := http.NewRequestWithContext(ctx, http.MethodGet,
		openAPIBase+devicePollPath+"?"+q.Encode(), nil)
	if err != nil {
		return nil, false, err
	}
	req.Header.Set("Cosy-Version", "1.0.1")
	req.Header.Set("Cosy-ClientType", "5")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", devicePollUA)
	resp, err := e.shortCLI.Do(req)
	if err != nil {
		return nil, false, err
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return nil, false, err
	}
	// 202/404 = 尚未授权（官方本地代理把 404 也当等待态）。
	if resp.StatusCode == http.StatusAccepted || resp.StatusCode == http.StatusNotFound {
		return nil, false, nil
	}
	if resp.StatusCode >= 400 {
		return nil, false, &UpstreamError{StatusCode: resp.StatusCode, Body: string(raw)}
	}
	var doc map[string]any
	if len(raw) > 0 {
		if err := json.Unmarshal(raw, &doc); err != nil {
			return nil, false, fmt.Errorf("decode poll: %w", err)
		}
	}
	data, _ := doc["data"].(map[string]any)
	if data == nil {
		data = doc
	}
	if code, ok := doc["code"]; ok && code != nil {
		if cs, isStr := code.(string); isStr && cs != "" && cs != "0" {
			return nil, false, fmt.Errorf("授权失败（code=%s）：%s", cs,
				firstString(doc, "msg", "message"))
		}
		if cf, isNum := code.(float64); isNum && cf != 0 {
			return nil, false, fmt.Errorf("授权失败（code=%v）：%s", cf,
				firstString(doc, "msg", "message"))
		}
	}
	tok := firstString(data, "token", "access_token", "device_token")
	if tok == "" {
		return nil, false, nil // 结构未就绪，继续等
	}
	return data, true, nil
}

// adoptDeviceSession 把轮询到的凭证落盘为账号（并顺带签一次到）。
func (e *Engine) adoptDeviceSession(ctx context.Context, ds *deviceSession, data map[string]any) map[string]any {
	access := firstString(data, "token", "access_token", "device_token")
	refresh := firstString(data, "refresh_token", "refreshToken")
	uid := firstString(data, "user_id", "userId")
	if uid == "" {
		uid = deriveCheckinID(access, "uid")
	}
	a := &Account{
		AccessToken:   access,
		DeviceRefresh: refresh,
		Name:          ds.Note,
		MachineID:     ds.MachineID,
		MachineToken:  strings.ReplaceAll(newUUID(), "-", ""),
		MachineType:   newUUID()[:18],
		FilePath:      deviceFilePath(e.cfg.AuthDir, uid),
		chatSlots:     make(chan struct{}, e.cfg.MaxConcurrency),
	}
	a.uid = uid
	if exp := toInt64(data["expires_at"]); exp > 0 {
		a.deviceExpMs = exp
	} else if exp := toInt64(data["expiresAt"]); exp > 0 {
		a.deviceExpMs = exp
	} else if secs := toInt64(data["expires_in"]); secs > 0 {
		a.deviceExpMs = time.Now().UnixMilli() + secs*1000
	}
	// 先看是不是已存在的同一 uid（重复授权 = 覆盖更新）。
	existing := false
	for _, old := range e.allAccounts() {
		if old.uid == uid && old.FilePath != "" {
			a.Name = firstNonEmpty(ds.Note, old.Name)
			a.FilePath = old.FilePath
			existing = true
			break
		}
	}
	if err := a.save(); err != nil {
		log.Printf("qoder device %s: save: %v", uid, err)
	}
	e.rescan()
	// 同 PAT 路径：rescan 后取回池内实例，保证签到/额度记在列表展示的对象上。
	if fresh := e.findByUID(uid); fresh != nil {
		a = fresh
	}
	e.refreshQuota(a)
	res := map[string]any{
		"ok":       true,
		"done":     true,
		"uid":      uid,
		"name":     a.Name,
		"existing": existing,
	}
	if r := e.CheckinOne(ctx, a); r != nil {
		res["checkin"] = r
		if r["claimed"] == true {
			e.refreshQuota(a)
		}
	}
	ds.Done = true
	ds.Result = res
	return res
}

// deviceFilePath 设备授权账号的凭证文件名（与 rescan 的 qoder-*.json 约定一致）。
func deviceFilePath(authDir, uid string) string {
	suffix := sanitizeFile(uid)
	if len(suffix) > 24 {
		suffix = suffix[:24]
	}
	if suffix == "" {
		suffix = newUUID()[:8]
	}
	return authDir + string(os.PathSeparator) + "qoder-dev-" + suffix + ".json"
}

// firstString 取第一个非空字符串字段。
func firstString(doc map[string]any, keys ...string) string {
	for _, k := range keys {
		if v, ok := doc[k].(string); ok && strings.TrimSpace(v) != "" {
			return strings.TrimSpace(v)
		}
	}
	return ""
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if strings.TrimSpace(v) != "" {
			return strings.TrimSpace(v)
		}
	}
	return ""
}

// deviceStatusText 供面板展示的一行状态。
func deviceStatusText(ds *deviceSession) string {
	if ds.Done {
		return "已授权"
	}
	if ds.Failed != "" {
		return ds.Failed
	}
	left := int(time.Until(ds.CreatedAt.Add(devicePollTTL)).Seconds())
	if left < 0 {
		left = 0
	}
	return "等待浏览器确认（剩余 " + strconv.Itoa(left) + "s）"
}
