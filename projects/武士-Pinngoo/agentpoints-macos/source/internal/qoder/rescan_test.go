package qoder

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func newEngineWithDir(dir string) *Engine {
	e := &Engine{
		cfg:      Config{AuthDir: dir, StateDir: dir, MaxConcurrency: 1, TimeoutSeconds: 5},
		shortCLI: newHTTPClient(5 * time.Second),
		status:   map[string]*acctStatus{},
		devices:  map[string]*deviceSession{},
	}
	e.rescan()
	return e
}

// TestRescanKeepsSessionState 回归：rescan 不得把已引导的账号换成「白板」新对象。
//
// 背景：导入 PAT 的真实路径是 save → rescan → ensureFreshSession。rescan 若一律
// 新建对象，引导结果就落在了一个已不在池中的孤儿实例上——/status 永远显示
// bootstrapped=false、uid 为空，用户看到的就是「加了 PAT 也没用」，直到下一轮
// maintain（10 分钟）才自愈。
func TestRescanKeepsSessionState(t *testing.T) {
	dir := t.TempDir()
	e := newEngineWithDir(dir)

	pat := "pt-gh0Ek3gyIabcdefghijklmn"
	a := &Account{PAT: pat, FilePath: filepathFor(dir, pat), MachineID: "m-1",
		chatSlots: make(chan struct{}, 1)}
	if err := a.save(); err != nil {
		t.Fatal(err)
	}
	e.rescan()
	if len(e.accounts) != 1 {
		t.Fatalf("accounts=%d want 1", len(e.accounts))
	}

	// 模拟一次成功的会话引导。
	live := e.allAccounts()[0]
	live.mu.Lock()
	live.bootstrapped = true
	live.uid = "u-1"
	live.userType = "personal_professional_trial"
	live.mu.Unlock()

	// 再 rescan（例如又导入/删除别的账号）——会话状态不能丢。
	e.rescan()
	cur := e.findByPAT(pat)
	if cur == nil {
		t.Fatal("rescan 后账号从池里消失了")
	}
	if cur != live {
		t.Fatal("rescan 应复用同一实例，否则引导结果会落到孤儿对象上")
	}
	cur.mu.Lock()
	bs, uid, ut := cur.bootstrapped, cur.uid, cur.userType
	cur.mu.Unlock()
	if !bs || uid != "u-1" || ut != "personal_professional_trial" {
		t.Fatalf("rescan 丢失会话状态：bootstrapped=%v uid=%q userType=%q", bs, uid, ut)
	}
}

// TestRescanRebuildsOnCredentialChange 同一文件被写入新凭证（重新授权/换号）时
// 必须换新对象：否则会拿旧会话去跑新凭证，表现为一直 401 却看不出原因。
func TestRescanRebuildsOnCredentialChange(t *testing.T) {
	dir := t.TempDir()
	e := newEngineWithDir(dir)

	uid := "01a1169c-0cbe-73c4-b6d8-98efac068978"
	fp := deviceFilePath(dir, uid)
	dev := &Account{AccessToken: "dt-old", uid: uid, FilePath: fp,
		chatSlots: make(chan struct{}, 1)}
	if err := dev.save(); err != nil {
		t.Fatal(err)
	}
	e.rescan()
	live := e.findByUID(uid)
	if live == nil {
		t.Fatal("设备账号未入池")
	}
	live.mu.Lock()
	live.bootstrapped = true
	live.mu.Unlock()

	// 同一路径写入新 access_token。
	dev2 := &Account{AccessToken: "dt-new", uid: uid, FilePath: fp,
		chatSlots: make(chan struct{}, 1)}
	if err := dev2.save(); err != nil {
		t.Fatal(err)
	}
	e.rescan()
	cur := e.findByUID(uid)
	if cur == nil {
		t.Fatal("重新授权后账号未入池")
	}
	if cur == live {
		t.Fatal("凭证已变却沿用了旧实例（会拿旧会话跑新凭证）")
	}
	cur.mu.Lock()
	bs := cur.bootstrapped
	cur.mu.Unlock()
	if bs {
		t.Error("新凭证应从未引导状态开始")
	}
	if _, err := os.Stat(filepath.Join(dir, filepath.Base(fp))); err != nil {
		t.Fatalf("凭证文件应存在：%v", err)
	}
}
