import json, os, sys, tempfile, unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parents[1] / "src"))
import chipotle

class ChipotleTests(unittest.TestCase):
    def test_env_loader_and_missing_values(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/"x.env"; p.write_text("A=one\n# comment\nB='two'\n")
            self.assertEqual(chipotle.load_env(p), {"A":"one","B":"two"})
        original=dict(os.environ)
        try:
            os.environ.pop("CHIPOTLE_SUPABASE_URL",None); os.environ.pop("CHIPOTLE_SUPABASE_SERVICE_ROLE_KEY",None)
            with patch.object(chipotle, "load_env", return_value={}):
                with self.assertRaises(chipotle.ChipotleError): chipotle.config()
        finally: os.environ.clear(); os.environ.update(original)
    def test_completed_day_dst_and_filename(self):
        now=datetime(2026,3,9,10,tzinfo=timezone.utc); w=chipotle.completed_windows(now,"America/New_York")
        self.assertEqual(w.report_date,"2026-03-08"); self.assertEqual((w.day_end-w.day_start).total_seconds(),23*3600)
        self.assertEqual(f"{w.report_date}-buffago-daily-metrics.md","2026-03-08-buffago-daily-metrics.md")
    def test_dashboard_url_normalizes_to_project_api(self):
        original=dict(os.environ)
        try:
            os.environ["CHIPOTLE_SUPABASE_URL"]="https://supabase.com/dashboard/project/abc123"
            os.environ["CHIPOTLE_SUPABASE_SERVICE_ROLE_KEY"]="test"
            self.assertEqual(chipotle.config()["CHIPOTLE_SUPABASE_URL"],"https://abc123.supabase.co")
        finally: os.environ.clear(); os.environ.update(original)
    def test_secret_scanner_positive_and_negative(self):
        with tempfile.TemporaryDirectory() as d:
            safe=Path(d)/"safe.md"; safe.write_text("Aggregate count: 4\n")
            unsafe=Path(d)/"unsafe.md"; unsafe.write_text("Authorization" + ": Bearer " + "secret\n")
            self.assertEqual(chipotle.scan([safe]),[]); self.assertTrue(chipotle.scan([unsafe]))
    def test_atomic_replacement(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/"out.md"; chipotle.atomic_write(p,"one"); chipotle.atomic_write(p,"two"); self.assertEqual(p.read_text(),"two")
    def test_empty_and_partial_metrics_render(self):
        w=chipotle.completed_windows(datetime(2026,7,26,tzinfo=timezone.utc),"America/New_York")
        unavailable={"availability":"unavailable","reason":"missing"}; available={"availability":"available","yesterday":0,"previousDay":0,"trailing7":0,"trailing30":0}
        keys=["ratings_created","crawls_created","crawls_completed","badges_awarded","onboarding_events","wing_battle_votes","xp_claims","jalapeno_runs","jalapeno_errors","registered_users","dau","wau","mau","retention_d1","retention_d7","retention_d30","missions","referrals","state_passport","error_telemetry","auth_failures","performance_percentiles"]
        text=chipotle.render({"metrics":{k:(available if k=="ratings_created" else unavailable) for k in keys},"jalapeno":{"status":"Unavailable","reason":"none"}},w,"abc")
        self.assertIn("# Buffago Daily Metrics",text); self.assertIn("Unavailable",text)
    def test_percentage_guard(self):
        self.assertEqual(chipotle.change({"availability":"available","yesterday":3,"previousDay":0}),"new")
        self.assertEqual(chipotle.change({"availability":"unavailable"}),"—")
    def test_json_companion_shape(self):
        payload={"schemaVersion":1,"reportDate":"2026-07-25","metrics":{},"jalapeno":{}}
        self.assertEqual(json.loads(json.dumps(payload))["schemaVersion"],1)

if __name__ == "__main__": unittest.main()
