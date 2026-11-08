package qoder

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

// stubUpstream 起一个假 openapi：jobs 换 token + 每日签到三端点，返回指定活动状态。
func stubUpstream(t *testing.T, status string) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case pathJobExchange:
			_, _ = io.WriteString(w, `{"token":"job-token-1","expires_in":3600000}`)
		case pathCheckStatus:
			_, _ = io.WriteString(w, `{"status":"`+status+`","currentStreakDays":3}`)
		case pathCheckClaim:
			_, _ = io.WriteString(w, `{"success":true,"rewardCredits":100}`)
		case pathProElig:
			_, _ = io.WriteString(w, `{"eligible":false}`)
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(srv.Close)
	old := openAPIBase
	openAPIBase = srv.URL
	t.Cleanup(func() { openAPIBase = old })
	return srv
}

func testAccount() *Account {
	return &Account{PAT: "pt-test-token-value", uid: "u-test-1", chatSlots: make(chan struct{}, 1)}
}

// CheckinOne 必须把上游的每日签到活动状态落进池内状态（acctStatus.CheckinStatus）。
//
// 这就是「一键签到点了没反应」的根因：活动未开放（DISABLED）与「还没签」都表现为
// last_checkin 为空，只有 last_checkin 一个信号时，未开放账号会永远显示「未签」，
// 还混进「今日签到 N/M」的分母，面板因此看不出任何变化。
func TestCheckinRecordsUpstreamStatus(t *testing.T) {
	cases := []struct {
		name        string
		status      string
		wantStatus  string
		wantClaimed bool
		wantSigned  bool // 是否应记下 last_checkin
	}{
		{name: "活动未开放", status: "DISABLED", wantStatus: "DISABLED", wantClaimed: false, wantSigned: false},
		{name: "可领并领取成功", status: "CLAIMABLE", wantStatus: "CLAIMED", wantClaimed: true, wantSigned: true},
		{name: "上游已签", status: "CLAIMED", wantStatus: "CLAIMED", wantClaimed: false, wantSigned: true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			stubUpstream(t, tc.status)
			e := newTestEngine(t)
			a := testAccount()

			res := e.CheckinOne(context.Background(), a)
			if res["ok"] != true {
				t.Fatalf("CheckinOne 失败：%v", res["error"])
			}
			if got := res["status"]; got != tc.wantStatus {
				t.Errorf("结果里的 status = %v，想 %s", got, tc.wantStatus)
			}
			if got := res["claimed"] == true; got != tc.wantClaimed {
				t.Errorf("claimed = %v，想 %v", got, tc.wantClaimed)
			}

			st := e.st(a.key())
			if st.CheckinStatus != tc.wantStatus {
				t.Errorf("池内状态 CheckinStatus = %q，想 %q（面板靠它区分未开放/待签）", st.CheckinStatus, tc.wantStatus)
			}
			today := time.Now().Format("2006-01-02")
			if signed := st.LastCheckin != "" && st.LastCheckin[:10] == today; signed != tc.wantSigned {
				t.Errorf("last_checkin = %q（今日已签=%v），想已签=%v", st.LastCheckin, signed, tc.wantSigned)
			}
		})
	}
}

// 当天已签的账号再点一次「一键签到」走本地去重：不发上游请求，但状态仍须是 CLAIMED，
// 否则面板会把它退回「待签」，看起来又像没签到。
func TestCheckinLocalDedupeKeepsClaimedStatus(t *testing.T) {
	stubUpstream(t, "CLAIMABLE")
	e := newTestEngine(t)
	a := testAccount()

	if res := e.CheckinOne(context.Background(), a); res["claimed"] != true {
		t.Fatalf("首签未成功：%v", res)
	}
	second := e.CheckinOne(context.Background(), a)
	if second["already"] != true {
		t.Fatalf("第二次应为 already：%v", second)
	}
	if second["status"] != "CLAIMED" {
		t.Errorf("第二次 status = %v，想 CLAIMED", second["status"])
	}
	if st := e.st(a.key()); st.CheckinStatus != "CLAIMED" {
		t.Errorf("去重后 CheckinStatus = %q，想 CLAIMED", st.CheckinStatus)
	}
}
