import json, os, sys, tempfile, unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parents[1] / "src"))
import chipotle

class FakeRest:
    def __init__(self, counts=None): self.counts=counts or {}
    def count(self, table, column, start, end):
        value=self.counts.get((table,column), 0)
        if isinstance(value, Exception): raise value
        return value
    def get(self, path, params):
        if "analytics_daily_active_users" in path: return ([{"event_date":"2026-07-25","active_identities":7}], "0-0/1")
        return ([], None)

class ChipotleTests(unittest.TestCase):
    def setUp(self): self.w=chipotle.completed_windows(datetime(2026,7,26,tzinfo=timezone.utc),"America/New_York")
    def test_env_loader_and_missing_values(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/"x.env"; p.write_text("A=one\n# comment\nB='two'\n"); self.assertEqual(chipotle.load_env(p), {"A":"one","B":"two"})
        original=dict(os.environ)
        try:
            os.environ.pop("CHIPOTLE_SUPABASE_URL",None); os.environ.pop("CHIPOTLE_SUPABASE_SERVICE_ROLE_KEY",None)
            with patch.object(chipotle,"load_env",return_value={}):
                with self.assertRaises(chipotle.ChipotleError): chipotle.config()
        finally: os.environ.clear(); os.environ.update(original)
    def test_completed_day_dst(self):
        w=chipotle.completed_windows(datetime(2026,3,9,10,tzinfo=timezone.utc),"America/New_York")
        self.assertEqual(w.report_date,"2026-03-08"); self.assertEqual((w.day_end-w.day_start).total_seconds(),23*3600)
    def test_dashboard_url_normalizes(self):
        original=dict(os.environ)
        try:
            os.environ.update({"CHIPOTLE_SUPABASE_URL":"https://supabase.com/dashboard/project/abc123","CHIPOTLE_SUPABASE_SERVICE_ROLE_KEY":"test"})
            self.assertEqual(chipotle.config()["CHIPOTLE_SUPABASE_URL"],"https://abc123.supabase.co")
        finally: os.environ.clear(); os.environ.update(original)
    def test_meaningful_definition_is_explicit_and_not_login_based(self):
        self.assertIn("destination_ratings.created_at",chipotle.MEANINGFUL_ALLOWLIST)
        self.assertNotIn("session_refresh", " ".join(chipotle.MEANINGFUL_ALLOWLIST))
        collected=chipotle.collect(FakeRest(),self.w,{"jalapenoExpectedFreshnessHours":30},Path(tempfile.mkdtemp()))
        payload=chipotle.build_payload(collected,self.w,"r","2026-07-26T00:00:00Z")
        self.assertIsNone(payload["audience"]["daily_meaningful_active_users"]["value"])
        self.assertEqual(payload["audience"]["daily_active_users_any_activity"]["value"]["daily"],7)
    def test_query_failure_and_missing_are_never_zero(self):
        record=chipotle.safe_count(FakeRest({("destination_ratings","created_at"):chipotle.ChipotleError("bad")}),"destination_ratings","created_at",self.w)
        self.assertIsNone(record["value"]); self.assertEqual(record["status"],"query_failed")
        self.assertIsNone(chipotle.unavailable()["value"])
    def test_percentage_zero_baseline_and_trend(self):
        self.assertIsNone(chipotle.percent(4,0)); self.assertEqual(chipotle.direction(4,0),"up")
        result=chipotle.trend(chipotle.metric(4,"x","x"),chipotle.metric(0,"x","x"))
        self.assertIsNone(result["percentage_delta"]); self.assertEqual(result["absolute_delta"],4)
    def test_immature_retention_is_not_zero_and_has_methodology(self):
        collected=chipotle.collect(FakeRest(),self.w,{"jalapenoExpectedFreshnessHours":30},Path(tempfile.mkdtemp()))
        payload=chipotle.build_payload(collected,self.w,"r","2026-07-26T00:00:00Z")
        self.assertIn("cohort_size",payload["retention"]["methodology"])
        self.assertIsNone(payload["retention"]["d7_retention"]["value"])
        self.assertNotEqual(payload["retention"]["d7_retention"]["status"],"calculated")
    def test_stale_and_partial_collection(self):
        with patch("chipotle.datetime") as dt:
            dt.now.return_value=datetime(2026,7,30,tzinfo=timezone.utc); dt.fromtimestamp.side_effect=lambda x,tz: datetime.fromtimestamp(x,tz); dt.combine=datetime.combine
            # Missing sources make partial independent of local artifact availability.
            collected=chipotle.collect(FakeRest(),self.w,{"jalapenoExpectedFreshnessHours":0},Path(tempfile.mkdtemp()))
        payload=chipotle.build_payload(collected,self.w,"r","2026-07-26T00:00:00Z")
        self.assertEqual(payload["metadata"]["collection_status"],"partial")
    def test_deterministic_payload_and_idempotent_same_day_snapshot(self):
        collected=chipotle.collect(FakeRest(),self.w,{"jalapenoExpectedFreshnessHours":30},Path(tempfile.mkdtemp()))
        a=chipotle.build_payload(collected,self.w,"fixed","2026-07-26T00:00:00Z"); b=chipotle.build_payload(collected,self.w,"fixed","2026-07-26T00:00:00Z")
        self.assertEqual(a,b)
        with tempfile.TemporaryDirectory() as d:
            shared=Path(d); paths1=chipotle.write_snapshots(shared,a,chipotle.render(a)); paths2=chipotle.write_snapshots(shared,b,chipotle.render(b))
            self.assertEqual(paths1[0],paths2[0]); self.assertEqual(len(list((shared/"metrics"/"daily").glob("*.json"))),1)
    def test_regeneration_preserves_original(self):
        with tempfile.TemporaryDirectory() as d:
            shared=Path(d); p=chipotle.build_payload(chipotle.collect(FakeRest(),self.w,{"jalapenoExpectedFreshnessHours":30},shared),self.w,"r","2026-07-26T00:00:00Z"); chipotle.write_snapshots(shared,p,chipotle.render(p)); p["metric_index"]["ratings_created"]["value"]["daily"]=99
            paths=chipotle.write_snapshots(shared,p,chipotle.render(p)); self.assertIn("regenerated",paths[0].name); self.assertTrue((shared/"metrics"/"daily"/f"{self.w.report_date}.json").exists())
    def test_schema_manual_facts_privacy_and_secret_scan(self):
        with tempfile.TemporaryDirectory() as d:
            shared=Path(d); facts=shared/"metrics"/"manual-business-facts.json"; facts.parent.mkdir(parents=True); facts.write_text(json.dumps({"facts":{"revenue":{"value":12,"verified_at":"2026-07-25T00:00:00Z"}}}))
            payload=chipotle.build_payload(chipotle.collect(FakeRest(),self.w,{"jalapenoExpectedFreshnessHours":30},shared),self.w,"r","2026-07-26T00:00:00Z")
            self.assertEqual(payload["business_viability"]["revenue"]["value"],12); self.assertEqual(chipotle.validate_payload(payload),[])
            out=shared/"safe.json"; out.write_text(json.dumps(payload)); self.assertEqual(chipotle.scan([out]),[])
            unsafe=shared/"unsafe.txt"; unsafe.write_text("person@example.com"); self.assertTrue(chipotle.scan([unsafe]))
    def test_legacy_results_compatibility(self):
        payload=chipotle.build_payload(chipotle.collect(FakeRest(),self.w,{"jalapenoExpectedFreshnessHours":30},Path(tempfile.mkdtemp())),self.w,"r","2026-07-26T00:00:00Z")
        legacy=payload["legacy"]
        self.assertEqual(legacy["schemaVersion"],1); self.assertIn("ratings_created",legacy["metrics"]); self.assertIn("dau",legacy["metrics"])

if __name__ == "__main__": unittest.main()
