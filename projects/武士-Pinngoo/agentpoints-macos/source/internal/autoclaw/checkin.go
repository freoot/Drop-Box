package autoclaw

// 签到/任务（移植自 check.py）：daily_signin 任务完成 + 任务列表，
// 401 时用 refreshToken 自救重试（与 chat 的 session_dead 自救对齐）。

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"
)

// checkinHeaders check.py build_headers：与 userapi_headers 签名相同，
// 但客户端伪装为桌面端（X-Tm/X-Client-Type/X-Version 不同）。
func checkinHeaders(token string) map[string]string {
	ts := fmt.Sprintf("%d", time.Now().Unix())
	h := map[string]string{
		"Content-Type":     "application/json",
		"Accept":           "application/json",
		"X-Version":        clientVer,
		"X-Tm":             "mac",
		"X-Product":        "autoclaw",
		"X-Client-Type":    "pc",
		"X-Channel":        "official",
		"X-Auth-Appid":     appID,
		"X-Auth-TimeStamp": ts,
		"X-Auth-Sign":      authSign(ts),
		"X-Trace-Id":       newTraceID(),
		"X-Lang":           "en",
	}
	if token != "" {
		h["Authorization"] = bearer(token)
	}
	return h
}

// httpJSONPlain 裸 JSON 请求（不解析 envelope；签到端点自行判 code）。
func (e *Engine) httpJSONPlain(method, fullURL, token string, body any, timeout time.Duration) (map[string]any, int, string) {
	var rd io.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		if err != nil {
			return nil, 0, err.Error()
		}
		rd = strings.NewReader(string(raw))
	}
	req, err := http.NewRequest(method, fullURL, rd)
	if err != nil {
		return nil, 0, err.Error()
	}
	for k, v := range checkinHeaders(token) {
		req.Header.Set(k, v)
	}
	client := &http.Client{Timeout: timeout}
	resp, err := client.Do(req)
	if err != nil {
		return nil, 0, err.Error()
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 2<<20))
	if err != nil {
		return nil, resp.StatusCode, err.Error()
	}
	var doc map[string]any
	if json.Unmarshal(raw, &doc) != nil {
		return nil, resp.StatusCode, string(raw)
	}
	return doc, resp.StatusCode, ""
}

type checkinResult struct {
	UID             string `json:"uid"`
	Region          string `json:"region"`
	URL             string `json:"url,omitempty"`
	TaskID          string `json:"task_id,omitempty"`
	OK              bool   `json:"ok"`
	AlreadyDone     bool   `json:"already_completed"`
	RewardPoints    int    `json:"reward_points"`
	Code            any    `json:"code"`
	Msg             string `json:"msg"`
	Error           string `json:"error"`
	Tasks           []any  `json:"tasks,omitempty"`
}

// checkinOne 单账号签到（dry_run 只回显计划）。
func (e *Engine) checkinOne(acct *Auth, dryRun bool) checkinResult {
	region := acct.Region
	base := userapiBase[region]
	if e.cfg.UserAPIBaseOverride != "" {
		base = e.cfg.UserAPIBaseOverride
	}
	res := checkinResult{
		UID: acct.UserID, Region: region,
		URL: base + checkinTaskPath, TaskID: "daily_signin",
	}
	if dryRun {
		res.OK = true
		res.Msg = "dry-run"
		return res
	}
	doc, status, errText := e.httpJSONPlain(http.MethodPost, base+checkinTaskPath, acct.AccessToken,
		map[string]any{"task_id": "daily_signin"}, 20*time.Second)
	if doc == nil {
		res.Error = fmt.Sprintf("http %d: %s", status, errText)
		return res
	}
	code := doc["code"]
	res.Code = code
	if m, ok := doc["msg"].(string); ok {
		res.Msg = m
	}
	data, _ := doc["data"].(map[string]any)
	if status >= 400 && code == nil {
		res.Error = fmt.Sprintf("http %d: %s", status, res.Msg)
		return res
	}
	ok := toInt64(code) == 0 || (code == nil && len(data) > 0)
	if !ok {
		if res.Msg != "" {
			res.Error = res.Msg
		} else {
			res.Error = fmt.Sprintf("code=%v", code)
		}
		return res
	}
	res.OK = true
	if data != nil {
		if v, ok := data["already_completed"].(bool); ok {
			res.AlreadyDone = v
		}
		res.RewardPoints = int(toInt64(data["reward_points"]))
		if v := toString(data["task_id"]); v != "" {
			res.TaskID = v
		}
	}
	return res
}

// taskListOne 单账号任务列表。
func (e *Engine) taskListOne(acct *Auth, dryRun bool) checkinResult {
	region := acct.Region
	base := userapiBase[region]
	if e.cfg.UserAPIBaseOverride != "" {
		base = e.cfg.UserAPIBaseOverride
	}
	res := checkinResult{UID: acct.UserID, Region: region, URL: base + taskListPath + "?lang=en"}
	if dryRun {
		res.Error = "dry-run"
		return res
	}
	doc, status, errText := e.httpJSONPlain(http.MethodGet, base+taskListPath+"?lang=en", acct.AccessToken, nil, 20*time.Second)
	if doc == nil {
		res.Error = fmt.Sprintf("http %d: %s", status, errText)
		return res
	}
	code := doc["code"]
	if code != nil && toInt64(code) != 0 {
		if m, ok := doc["msg"].(string); ok && m != "" {
			res.Error = m
		} else {
			res.Error = fmt.Sprintf("code=%v", code)
		}
		return res
	}
	res.OK = true
	switch data := doc["data"].(type) {
	case []any:
		res.Tasks = data
	case map[string]any:
		if t, ok := data["tasks"].([]any); ok {
			res.Tasks = t
		} else if l, ok := data["list"].([]any); ok {
			res.Tasks = l
		} else {
			res.Tasks = []any{data}
		}
	}
	return res
}

// recoverToken 签到 401 自救（移植 _recover_token）：refreshToken 换新。
func (e *Engine) recoverToken(acct *Auth) bool {
	pool := e.pools[acct.Region]
	if pool == nil {
		return false
	}
	a := pool.authByUID(acct.UserID)
	if a == nil {
		a = acct
	}
	if strings.TrimSpace(a.RefreshToken) == "" {
		return false
	}
	if err := e.up.refresh(a); err != nil {
		log.Printf("%s: checkin token refresh failed: %v", a.UserID[:minLen(a.UserID, 8)], err)
		return false
	}
	if err := a.Save(); err != nil {
		log.Printf("%s: checkin token save failed: %v", a.UserID[:minLen(a.UserID, 8)], err)
		return false
	}
	log.Printf("%s: checkin 401 -> token refreshed", a.UserID[:minLen(a.UserID, 8)])
	return true
}

// checkinRun 签到/任务主入口（region: all/cn/global；uid 可选过滤）。
func (e *Engine) checkinRun(region string, dryRun bool, mode string, uid string) (map[string]any, error) {
	regions := []string{"cn", "global"}
	switch region {
	case "cn":
		regions = []string{"cn"}
	case "global":
		regions = []string{"global"}
	}
	results := make([]checkinResult, 0, 4)
	for _, r := range regions {
		pool := e.pools[r]
		if pool == nil {
			continue
		}
		for _, row := range pool.statusList() {
			if uid != "" && row.UID != uid {
				continue
			}
			acct := pool.authByUID(row.UID)
			if acct == nil || strings.TrimSpace(acct.AccessToken) == "" {
				continue
			}
			var res checkinResult
			if mode == "tasks" {
				res = e.taskListOne(acct, dryRun)
			} else {
				res = e.checkinOne(acct, dryRun)
			}
			// 401 → refresh 自救重试一次
			if !res.OK && strings.Contains(res.Error, "http 401") && e.recoverToken(acct) {
				if mode == "tasks" {
					res = e.taskListOne(acct, dryRun)
				} else {
					res = e.checkinOne(acct, dryRun)
				}
			}
			results = append(results, res)
		}
	}
	return map[string]any{"results": results}, nil
}
