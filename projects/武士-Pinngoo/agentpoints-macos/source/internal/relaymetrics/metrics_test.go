package relaymetrics

import "testing"

func TestEnterDoneCounts(t *testing.T) {
	done := Enter("t-pool")
	done(true)
	done(true) // 幂等：重复调用只计一次
	if s := stat(t, "t-pool"); s.OK != 1 || s.Fail != 0 || s.InFlight != 0 {
		t.Fatalf("ok=%d fail=%d inflight=%d, want 1/0/0", s.OK, s.Fail, s.InFlight)
	}

	done2 := Enter("t-pool")
	done2(false)
	if s := stat(t, "t-pool"); s.OK != 1 || s.Fail != 1 {
		t.Fatalf("ok=%d fail=%d, want 1/1", s.OK, s.Fail)
	}
	_ = done2
}

func TestInFlightTracking(t *testing.T) {
	done := Enter("f-pool")
	if s := stat(t, "f-pool"); s.InFlight != 1 {
		t.Fatalf("inflight=%d, want 1", s.InFlight)
	}
	done(true)
	if s := stat(t, "f-pool"); s.InFlight != 0 {
		t.Fatalf("inflight=%d, want 0 after done", s.InFlight)
	}
}

func TestMarkStandalone(t *testing.T) {
	Mark("m-pool", false)
	Mark("m-pool", false)
	if s := stat(t, "m-pool"); s.Fail != 2 || s.InFlight != 0 {
		t.Fatalf("fail=%d inflight=%d, want 2/0", s.Fail, s.InFlight)
	}
}

func TestSnapshotSorted(t *testing.T) {
	Mark("b", true)
	Mark("a", true)
	Mark("c", true)
	ss := Snapshot()
	if len(ss) < 3 {
		t.Fatalf("snapshot len=%d", len(ss))
	}
	for i := 1; i < len(ss); i++ {
		if ss[i-1].Realm > ss[i].Realm {
			t.Fatalf("not sorted: %v", ss)
		}
	}
}

func TestEmptyRealmDefaults(t *testing.T) {
	Mark("", true)
	if s := stat(t, "unknown"); s.OK != 1 {
		t.Fatalf("empty realm should land in 'unknown', got %+v", s)
	}
}

func stat(t *testing.T, realm string) RealmStat {
	t.Helper()
	for _, s := range Snapshot() {
		if s.Realm == realm {
			return s
		}
	}
	t.Fatalf("realm %q not in snapshot", realm)
	return RealmStat{}
}
