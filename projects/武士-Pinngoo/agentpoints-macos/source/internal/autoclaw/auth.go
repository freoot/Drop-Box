package autoclaw

// 凭证（Auth）与账号目录管理。移植自 autoclaw2api/bridge.py 的 Auth/parse_auth/
// load_dir 与 check.py 的 load_auths：凭证文件为 auths/autoclaw-<uid>.json
// （global 区 autoclaw-global-<uid>.json），字段名与 Python 版保持一致。

import (
	"crypto/md5"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

const (
	appID     = "100003"
	appSecret = "38d2391985e2369a5fb8227d8e6cd5e5"
	clientVer = "1.18.5"
)

var userapiBase = map[string]string{
	"cn":     "https://autoglm-acceleration-api.zhipuai.cn",
	"global": "https://autoglm-api.autoglm.ai",
}

const (
	proxyChatPath    = "/autoclaw-proxy/proxy/autoclaw/v1/chat/completions"
	configModelsPath = "/autoclaw-proxy/proxy/autoclaw-model-config"
	checkinTaskPath  = "/autoclaw-proxy/proxy/autoclaw-task-complete"
	taskListPath     = "/autoclaw-proxy/proxy/autoclaw-task-list"
)

// Auth 单账号凭证（文件持久化，字段与 Python 版 JSON 一一对应）。
type Auth struct {
	mu sync.Mutex

	AccessToken  string `json:"accessToken"`
	RefreshToken string `json:"refreshToken"`
	ExpiresAt    int64  `json:"expiresAt"`
	UserID       string `json:"userId"`
	UserName     string `json:"userName"`
	Phone        string `json:"phone"`
	DeviceID     string `json:"deviceId"`
	Region       string `json:"region"`
	SandboxID    string `json:"sandboxId"`
	// SandboxEndpoint 沙箱 relay 基址（可能带 /proxy/<sandbox_id> 后缀）。
	SandboxEndpoint string `json:"sandboxEndpoint"`
	EndTimestamp    int64  `json:"endTimestamp"`

	// FilePath 凭证文件路径（Save 目标）。
	FilePath string `json:"-"`
}

// NeedsRefresh 本地到期前 within 秒内需要刷新。
func (a *Auth) NeedsRefresh(within float64) bool {
	if a.ExpiresAt <= 0 {
		return true
	}
	return time.Now().Add(time.Duration(within * float64(time.Second))).Unix() >= a.ExpiresAt
}

// Save 原子写回凭证文件。
func (a *Auth) Save() error {
	a.mu.Lock()
	defer a.mu.Unlock()
	if strings.TrimSpace(a.AccessToken) == "" {
		return fmt.Errorf("save refused: empty accessToken (uid=%s)", a.UserID)
	}
	if a.FilePath == "" {
		return fmt.Errorf("save refused: no file path (uid=%s)", a.UserID)
	}
	raw, err := json.MarshalIndent(a, "", "  ")
	if err != nil {
		return err
	}
	tmp := a.FilePath + ".tmp"
	if err := os.WriteFile(tmp, raw, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, a.FilePath)
}

// BearerToken 规范化为 "Bearer xxx" 形式。
func (a *Auth) BearerToken() string { return bearer(a.AccessToken) }

// parseAuth 解析凭证文件内容。
func parseAuth(raw []byte) (*Auth, error) {
	if len(raw) == 0 {
		return nil, fmt.Errorf("empty auth storage")
	}
	var a Auth
	if err := json.Unmarshal(raw, &a); err != nil {
		return nil, err
	}
	if a.Region == "" {
		a.Region = "cn"
	}
	if strings.TrimSpace(a.AccessToken) == "" {
		return nil, fmt.Errorf("parse_error: missing accessToken")
	}
	return &a, nil
}

// loadDir 扫描目录下 autoclaw-*.json（Python 版 load_dir：文件名既匹配 cn 的
// autoclaw-<uid>.json 也匹配 global 的 autoclaw-global-<uid>.json，按 region 字段分流）。
func loadDir(dir, wantRegion string) []*Auth {
	ents, err := os.ReadDir(dir)
	if err != nil {
		return nil
	}
	names := make([]string, 0, len(ents))
	for _, e := range ents {
		name := e.Name()
		if e.IsDir() || !strings.HasPrefix(name, "autoclaw-") || !strings.HasSuffix(name, ".json") {
			continue
		}
		names = append(names, name)
	}
	sort.Strings(names)
	out := make([]*Auth, 0, len(names))
	for _, name := range names {
		raw, err := os.ReadFile(filepath.Join(dir, name))
		if err != nil {
			continue
		}
		a, err := parseAuth(raw)
		if err != nil || a.Region != wantRegion {
			continue
		}
		a.FilePath = filepath.Join(dir, name)
		out = append(out, a)
	}
	return out
}

// authFileBase 签到用的轻量账号视图（对应 check.py load_auths 的 dict）。
type authFileBase struct {
	Path    string
	Region  string
	UserID  string
	Token   string
}

func (a *Auth) fileBase() authFileBase {
	return authFileBase{Path: a.FilePath, Region: a.Region, UserID: a.UserID, Token: a.AccessToken}
}

// ---- 签名 / 头 ----

// authSign X-Auth-Sign：md5("<appid>&<ts>&<secret>")。
func authSign(ts string) string {
	sum := md5.Sum([]byte(appID + "&" + ts + "&" + appSecret))
	return fmt.Sprintf("%x", sum)
}

func bearer(token string) string {
	t := strings.TrimSpace(token)
	if strings.HasPrefix(strings.ToLower(t), "bearer ") {
		return t
	}
	return "Bearer " + t
}

func stripBearer(token string) string {
	t := strings.TrimSpace(token)
	if strings.HasPrefix(strings.ToLower(t), "bearer ") {
		return t[7:]
	}
	return t
}

func newTraceID() string {
	return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x",
		time.Now().UnixNano()&0xffffffff, time.Now().UnixNano()>>32&0xffff,
		time.Now().UnixNano()>>48&0xffff, time.Now().UnixNano()>>20&0xfff&0xffff,
		time.Now().UnixNano()&0xffffffffffff)
}

// userapiHeaders userapi 通用签名头。
func userapiHeaders(token string) map[string]string {
	ts := fmt.Sprintf("%d", time.Now().Unix())
	h := map[string]string{
		"Content-Type":      "application/json",
		"Accept":            "*/*",
		"X-Version":         "1.12.1",
		"X-Tm":              "web",
		"X-Product":         "autoclaw",
		"X-Client-Type":     "web",
		"X-Channel":         "official",
		"X-Auth-Appid":      appID,
		"X-Auth-TimeStamp":  ts,
		"X-Auth-Sign":       authSign(ts),
		"X-Trace-Id":        newTraceID(),
		"X-Lang":            "en",
	}
	if token != "" {
		h["Authorization"] = bearer(token)
	}
	return h
}

// jwtIAT 解析 JWT payload 的 iat（用于 zai JWT 选新）。
func jwtClaimInt(token, key string) int64 {
	parts := strings.Split(stripBearer(token), ".")
	if len(parts) < 2 {
		return 0
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		// 补齐 padding 再试（Python 版做法）。
		if d, err2 := base64.URLEncoding.DecodeString(parts[1] + strings.Repeat("=", (4-len(parts[1])%4)%4)); err2 == nil {
			payload = d
		} else {
			return 0
		}
	}
	var doc map[string]any
	if json.Unmarshal(payload, &doc) != nil {
		return 0
	}
	switch v := doc[key].(type) {
	case float64:
		return int64(v)
	case string:
		var n int64
		_, _ = fmt.Sscanf(v, "%d", &n)
		return n
	}
	return 0
}
