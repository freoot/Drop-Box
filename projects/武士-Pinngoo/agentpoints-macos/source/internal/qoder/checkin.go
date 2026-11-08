package qoder

// checkin：国内版每日签到（+100 Credits）与 Pro 升级包（一次性 +1800）。
//
// 协议逆向自官方客户端（参见 xz0609/qoder-checkin-ql / wallechfox/qoder-checkin）：
//   - 端点：openapi.qoder.com.cn（明文 JSON，非 COSY 加密通道）
//   - 鉴权：PAT 经 /api/v1/jobToken/exchange 换 bearer token（带 expires_in 缓存）
//   - 状态：GET  /sash/api/v1/me/daily-check-in/status
//     status ∈ {CLAIMABLE, CLAIMED, DISABLED}，附连签天数/奖励额度
//   - 领取：POST /sash/api/v1/me/daily-check-in/claim，body {}
//     409 ALREADY_CLAIMED / body ALREADY_CLAIMED = 已签（幂等，重复领不重复发币）
//   - Pro 升级包：/sash/api/v1/me/pro-upgrade/{eligibility,claim}（404/403=不可领）

import (
	"context"
	"crypto/md5"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"
)

// openAPIBase 是 var 而非 const：签到路径的测试要把它指向 httptest 桩服务，
// 才能覆盖「上游回 DISABLED / CLAIMED / CLAIMABLE」这三种状态的真实分支。
var openAPIBase = "https://openapi.qoder.com.cn"

const (
	checkinWebsite  = "https://qoder.com.cn"
	checkinUA       = "Go-http-client/2.0"
	pathJobExchange = "/api/v1/jobToken/exchange"
	pathCheckStatus = "/sash/api/v1/me/daily-check-in/status"
	pathCheckClaim  = "/sash/api/v1/me/daily-check-in/claim"
	pathProElig     = "/sash/api/v1/me/pro-upgrade/eligibility"
	pathProClaim    = "/sash/api/v1/me/pro-upgrade/claim"
)

// deriveCheckinID 由 uid+salt 稳定派生设备/会话标识（md5 hex，幂等防风控）。
func deriveCheckinID(uid, salt string) string {
	sum := md5.Sum([]byte(salt + ":" + uid))
	return hex.EncodeToString(sum[:])
}

// bearer 为账号换取（并缓存）openapi 明文 bearer token。
func (e *Engine) bearer(ctx context.Context, a *Account) (string, error) {
	// 设备授权账号：access_token 本身就是 openapi 明文 bearer，
	// 无需（也无法）经 jobToken 交换。
	a.mu.Lock()
	if a.AccessToken != "" {
		tok := a.AccessToken
		a.mu.Unlock()
		return tok, nil
	}
	tok, exp := a.bearerTok, a.bearerExpMs
	a.mu.Unlock()
	if tok != "" && (exp == 0 || time.Now().UnixMilli() < exp-10*60*1000) {
		return tok, nil
	}
	body, _ := marshalNoEscape(map[string]string{"personal_token": a.PAT})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, openAPIBase+pathJobExchange, strings.NewReader(string(body)))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", checkinUA)
	resp, err := e.shortCLI.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return "", err
	}
	if resp.StatusCode != http.StatusOK {
		return "", &UpstreamError{StatusCode: resp.StatusCode, Body: string(raw)}
	}
	var out struct {
		Token     string `json:"token"`
		ExpiresIn int64  `json:"expires_in"` // ms
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		return "", fmt.Errorf("decode exchange: %w", err)
	}
	if out.Token == "" {
		return "", fmt.Errorf("exchange returned no token: %s", truncateRunes(string(raw), 120))
	}
	a.mu.Lock()
	a.bearerTok = out.Token
	if out.ExpiresIn > 0 {
		a.bearerExpMs = time.Now().UnixMilli() + out.ExpiresIn
	}
	a.mu.Unlock()
	return out.Token, nil
}

// plainHeaders openapi 明文接口请求头（Bearer + 设备指纹三件套）。
func plainHeaders(bearer, uid string) map[string]string {
	return map[string]string{
		"Content-Type":  "application/json",
		"Accept":        "application/json, text/plain, */*",
		"User-Agent":    checkinUA,
		"Authorization": "Bearer " + bearer,
		"X-Request-ID":  deriveCheckinID(uid, "req") + fmt.Sprintf("-%06d", time.Now().UnixNano()%1e6),
		"X-Machine-ID":  deriveCheckinID(uid, "machine"),
		"X-Session-ID":  deriveCheckinID(uid, "session"),
		"Origin":        checkinWebsite,
		"Referer":       checkinWebsite + "/",
	}
}

// checkinJSON 明文接口调用（GET/POST JSON，短超时，不重试——上游幂等）。
func checkinJSON(ctx context.Context, client *http.Client, method, url string, body []byte, uid, bearer string) (map[string]any, error) {
	var rd io.Reader
	if body != nil {
		rd = strings.NewReader(string(body))
	}
	req, err := http.NewRequestWithContext(ctx, method, url, rd)
	if err != nil {
		return nil, err
	}
	for k, v := range plainHeaders(bearer, uid) {
		req.Header.Set(k, v)
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return nil, err
	}
	if resp.StatusCode == http.StatusConflict { // 409：重复领取
		return map[string]any{"result": "ALREADY_CLAIMED"}, nil
	}
	if resp.StatusCode >= 400 {
		return nil, &UpstreamError{StatusCode: resp.StatusCode, Body: string(raw)}
	}
	var out map[string]any
	if len(raw) > 0 {
		if err := json.Unmarshal(raw, &out); err != nil {
			return nil, fmt.Errorf("decode %s: %w", url, err)
		}
	}
	return out, nil
}

// CheckinOne 单账号签到（含 Pro 升级包顺手领）。返回结果明细。
func (e *Engine) CheckinOne(ctx context.Context, a *Account) map[string]any {
	res := map[string]any{"name": a.displayName(), "uid": a.uid}
	bearer, err := e.bearer(ctx, a)
	if err != nil {
		res["ok"] = false
		res["error"] = err.Error()
		if a.isDevice() {
			res["error"] = err.Error() + "（设备授权凭证可能已失效，请重新生成授权链接）"
		}
		return res
	}
	st := e.st(a.key())
	today := time.Now().Format("2006-01-02")
	// LastCheckin 带时刻（"2006-01-02 15:04:05"），只能按日期前缀比对——
	// 早期写成等值比较，这个「当天已签就不再请求上游」的去重从来没生效过，
	// 结果每次点一键签到、每轮 maintain（10 分钟）都会白打一次 status+claim。
	if strings.HasPrefix(st.LastCheckin, today) {
		st.CheckinStatus = "CLAIMED"
		res["ok"] = true
		res["already"] = true
		res["status"] = st.CheckinStatus
		res["msg"] = "今日已签到"
		return res
	}

	// 每日签到
	out, err := checkinJSON(ctx, e.shortCLI, http.MethodGet, openAPIBase+pathCheckStatus, nil, a.uid, bearer)
	if err != nil {
		res["ok"] = false
		res["error"] = err.Error()
		if a.isDevice() {
			res["error"] = err.Error() + "（设备授权凭证可能已失效，请重新生成授权链接）"
		}
		return res
	}
	status, _ := out["status"].(string)
	st.CheckinStatus = status // 落库上下游状态：面板据此区分「未开放」与「待签」
	res["status"] = status
	res["streak_days"] = toInt64(out["currentStreakDays"])
	switch status {
	case "CLAIMED":
		st.LastCheckin = today + " " + time.Now().Format("15:04:05")
		res["ok"] = true
		res["already"] = true
		res["msg"] = "今日已签到"
		return res
	case "DISABLED":
		res["ok"] = true
		res["disabled"] = true
		res["msg"] = "官方签到活动未开放"
		return res
	case "CLAIMABLE":
		claim, err := checkinJSON(ctx, e.shortCLI, http.MethodPost, openAPIBase+pathCheckClaim, []byte("{}"), a.uid, bearer)
		if err != nil {
			res["ok"] = false
			res["error"] = err.Error()
			return res
		}
		if claim["result"] == "ALREADY_CLAIMED" {
			st.LastCheckin = today + " " + time.Now().Format("15:04:05")
			st.CheckinStatus = "CLAIMED"
			res["ok"] = true
			res["already"] = true
			res["status"] = "CLAIMED"
			res["msg"] = "今日已签到"
			return res
		}
		if succ, _ := claim["success"].(bool); succ == false && claim["result"] == nil {
			res["ok"] = false
			res["error"] = "claim rejected: " + marshalCompact(claim)
			return res
		}
		st.LastCheckin = today + " " + time.Now().Format("15:04:05")
		st.CheckinStatus = "CLAIMED"
		reward := toInt64(claim["rewardCredits"])
		res["ok"] = true
		res["claimed"] = true
		res["status"] = "CLAIMED"
		res["reward_credits"] = reward
		res["msg"] = fmt.Sprintf("签到成功 +%d 积分", reward)
	default:
		res["ok"] = true
		res["skipped"] = true
		res["msg"] = "活动状态 " + status + "，跳过"
		return res
	}

	// Pro 升级包（一次性 +1800，404/403 = 无此活动）
	if elig, err := checkinJSON(ctx, e.shortCLI, http.MethodGet, openAPIBase+pathProElig, nil, a.uid, bearer); err == nil {
		if e2, ok := elig["eligible"].(bool); ok && e2 {
			if _, err := checkinJSON(ctx, e.shortCLI, http.MethodPost, openAPIBase+pathProClaim, []byte("{}"), a.uid, bearer); err == nil {
				res["pro_claimed"] = true
				res["msg"] = fmt.Sprintf("%v；Pro 升级包 +1800 已领", res["msg"])
			}
		}
	}
	return res
}

// CheckinAll 全池签到（跳过停用账号；当天已签的本地去重）。
func (e *Engine) CheckinAll() []map[string]any {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	out := []map[string]any{}
	for _, a := range e.healthyAccounts() {
		r := e.CheckinOne(ctx, a)
		if !r["ok"].(bool) {
			log.Printf("qoder checkin %s: %v", a.displayName(), r["error"])
		} else if r["claimed"] == true {
			log.Printf("qoder checkin %s: %v", a.displayName(), r["msg"])
			e.refreshQuota(a) // 领到后刷新额度快照
		}
		out = append(out, r)
	}
	return out
}

func marshalCompact(v any) string {
	raw, err := json.Marshal(v)
	if err != nil {
		return fmt.Sprintf("%v", v)
	}
	return truncateRunes(string(raw), 160)
}
