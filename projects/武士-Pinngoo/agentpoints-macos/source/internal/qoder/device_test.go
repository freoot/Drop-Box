package qoder

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"net/url"
	"path/filepath"
	"testing"
	"time"
)

// newTestEngine 手工构造引擎（不触发 NewEngine 的后台维护协程/网络请求）。
func newTestEngine(t *testing.T) *Engine {
	t.Helper()
	dir := t.TempDir()
	e := &Engine{
		cfg:      Config{AuthDir: dir, StateDir: dir, MaxConcurrency: 1, TimeoutSeconds: 5},
		shortCLI: newHTTPClient(5 * time.Second),
		status:   map[string]*acctStatus{},
		devices:  map[string]*deviceSession{},
	}
	e.rescan()
	return e
}

// 设备授权链接的 PKCE 参数必须自洽：challenge = base64url(sha256(verifier))。
func TestDeviceLoginPKCE(t *testing.T) {
	e := newTestEngine(t)
	ds, err := e.startDeviceLogin("主号")
	if err != nil {
		t.Fatalf("start: %v", err)
	}
	sum := sha256.Sum256([]byte(ds.Verifier))
	if want := base64.RawURLEncoding.EncodeToString(sum[:]); ds.Challenge != want {
		t.Fatalf("challenge = %q want %q", ds.Challenge, want)
	}
	if len(ds.Verifier) != 43 {
		t.Fatalf("verifier len = %d, want 43 (base64url of 32 bytes)", len(ds.Verifier))
	}

	u, err := url.Parse(ds.authURL())
	if err != nil {
		t.Fatalf("parse auth url: %v", err)
	}
	if u.Scheme != "https" || u.Host != "qoder.com.cn" || u.Path != deviceAuthPath {
		t.Fatalf("auth url = %s", ds.authURL())
	}
	q := u.Query()
	if q.Get("challenge") != ds.Challenge || q.Get("challenge_method") != "S256" {
		t.Fatalf("challenge params = %v", q)
	}
	if q.Get("nonce") == "" || q.Get("machine_id") == "" {
		t.Fatalf("nonce/machine_id missing: %v", q)
	}
	if q.Get("nonce") != ds.Nonce || q.Get("machine_id") != ds.MachineID {
		t.Fatalf("nonce/machine_id mismatch: %v", q)
	}
}

// 未知 / 过期会话都要给出可读错误；过期会话顺手回收。
func TestDeviceLookupRejectsUnknownAndExpired(t *testing.T) {
	e := newTestEngine(t)
	if _, err := e.deviceLookup("no-such-sid"); err == nil {
		t.Fatal("unknown sid accepted")
	}
	if _, err := e.deviceLookup(""); err == nil {
		t.Fatal("empty sid accepted")
	}
	ds, err := e.startDeviceLogin("")
	if err != nil {
		t.Fatalf("start: %v", err)
	}
	e.devices[ds.SID].CreatedAt = time.Now().Add(-2 * devicePollTTL)
	if _, err := e.deviceLookup(ds.SID); err == nil {
		t.Fatal("expired session accepted")
	}
	if _, ok := e.devices[ds.SID]; ok {
		t.Fatal("expired session not reaped")
	}
}

// 设备授权账号落盘 → 重扫：凭证、uid、key 与直接 bearer 全部自洽。
func TestDeviceAccountPersistence(t *testing.T) {
	e := newTestEngine(t)
	a := &Account{
		AccessToken:   "at-abcdef",
		DeviceRefresh: "rt-abcdef",
		Name:          "手机号小号",
		MachineID:     "mid-1",
		MachineToken:  "mtok-1",
		MachineType:   "mtype-1",
		chatSlots:     make(chan struct{}, 1),
	}
	a.uid = "u-123"
	a.FilePath = deviceFilePath(e.cfg.AuthDir, a.uid)
	if err := a.save(); err != nil {
		t.Fatalf("save: %v", err)
	}

	e.rescan()
	all := e.allAccounts()
	if len(all) != 1 {
		t.Fatalf("loaded %d accounts, want 1", len(all))
	}
	got := all[0]
	if !got.isDevice() {
		t.Fatalf("not recognized as device account: pat=%q access=%q", got.PAT, got.AccessToken)
	}
	if got.AccessToken != "at-abcdef" || got.DeviceRefresh != "rt-abcdef" || got.uid != "u-123" {
		t.Fatalf("roundtrip mismatch: %+v", got)
	}
	if got.key() != "dev:u-123" {
		t.Fatalf("key = %q", got.key())
	}
	// 签到 bearer 直通 access_token（不发 jobToken 交换请求）。
	tok, err := e.bearer(context.Background(), got)
	if err != nil || tok != "at-abcdef" {
		t.Fatalf("bearer = %q, %v", tok, err)
	}
	// 没有 PAT 的账号不能进 chat 池，但要留在签到池。
	if len(e.chatAccounts()) != 0 {
		t.Fatal("device-only account leaked into chat pool")
	}
	if len(e.healthyAccounts()) != 1 {
		t.Fatal("device account missing from checkin pool")
	}
}

// PAT 账号与设备账号共存时，只有 PAT 账号参与 chat。
func TestChatAccountsSkipsDeviceOnly(t *testing.T) {
	e := newTestEngine(t)
	dev := &Account{
		AccessToken: "at-1", MachineID: "m1", MachineToken: "t1", MachineType: "y1",
		FilePath: filepath.Join(e.cfg.AuthDir, "qoder-dev-u1.json"), chatSlots: make(chan struct{}, 1),
	}
	dev.uid = "u1"
	pat := &Account{
		PAT: "pt-0123456789abcdef", MachineID: "m2", MachineToken: "t2", MachineType: "y2",
		FilePath: filepath.Join(e.cfg.AuthDir, "qoder-pat.json"), chatSlots: make(chan struct{}, 1),
	}
	if err := dev.save(); err != nil {
		t.Fatalf("save dev: %v", err)
	}
	if err := pat.save(); err != nil {
		t.Fatalf("save pat: %v", err)
	}
	e.rescan()
	if n := len(e.allAccounts()); n != 2 {
		t.Fatalf("all accounts = %d, want 2", n)
	}
	cs := e.chatAccounts()
	if len(cs) != 1 || cs[0].PAT == "" {
		t.Fatalf("chat accounts = %d (want only the PAT one)", len(cs))
	}
	if cs[0].key() != "pt-012345678" {
		t.Fatalf("pat key = %q", cs[0].key())
	}
	if !e.ChatHealthy() {
		t.Fatal("ChatHealthy should be true with a PAT account present")
	}
}
