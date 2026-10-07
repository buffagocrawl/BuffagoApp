import json
import logging
import tempfile
import unittest
import urllib.error
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

from api_client import AuthenticationError, MalformedResponseError, SnapshotClient, SnapshotError
from app import LOG, log_refresh_failure
from cache import SnapshotCache
from config import Config
from models import Snapshot


class _Response:
    def __init__(self, body):
        self.body = body
    def __enter__(self):
        return self
    def __exit__(self, *_args):
        return None
    def read(self, _size):
        return self.body


class ResilienceTests(unittest.TestCase):
    def setUp(self):
        self.anon_jwt = "anon-jwt-must-stay-secret"
        self.device_token = "device-token-must-stay-secret"

    def client(self):
        return SnapshotClient(
            url="https://example.test/functions/v1/buffago-growth-snapshot",
            anon_jwt=self.anon_jwt,
            device_token=self.device_token,
        )

    def test_api_failure_allows_cache_fallback(self):
        with tempfile.TemporaryDirectory() as directory:
            cache = SnapshotCache(Path(directory) / "cache.json")
            cache.save({"product_pulse": {"wing_ratings": {"total": 309}}})
            with patch("urllib.request.urlopen", side_effect=urllib.error.URLError("offline")):
                with self.assertRaises(SnapshotError):
                    self.client().fetch()
            self.assertEqual(Snapshot.from_payload(cache.load().payload).wing_total, 309)

    def test_device_auth_headers_present(self):
        with patch("urllib.request.urlopen", return_value=_Response(b"{}")) as opened:
            self.client().fetch()
        request = opened.call_args.args[0]
        headers = {name.lower(): value for name, value in request.header_items()}
        self.assertNotIn("authorization", headers)
        self.assertEqual(headers["x-buffago-dashboard-key"], self.device_token)
        self.assertEqual(headers["content-type"], "application/json")

    def test_device_without_anon_jwt(self):
        with patch("urllib.request.urlopen", return_value=_Response(b"{}")) as opened:
            SnapshotClient("https://example.test", device_token=self.device_token).fetch()
        self.assertIsNone(opened.call_args.args[0].get_header("Authorization"))

    def test_refresh_default_and_override(self):
        with patch("config.load_dotenv"), patch.dict("os.environ", {}, clear=True):
            self.assertEqual(Config.from_env().refresh_seconds, 600)
        with patch("config.load_dotenv"), patch.dict("os.environ", {"BUFFAGO_REFRESH_SECONDS": "900"}, clear=True):
            self.assertEqual(Config.from_env().refresh_seconds, 900)

    def test_credentials_never_appear_in_auth_logs(self):
        for status in (401, 403):
            http_error = urllib.error.HTTPError(
                self.device_token, status, self.anon_jwt, hdrs=None, fp=None
            )
            with patch("urllib.request.urlopen", side_effect=http_error):
                with self.assertRaises(AuthenticationError) as caught:
                    self.client().fetch()
            with self.assertLogs(LOG, level=logging.ERROR) as captured:
                log_refresh_failure(caught.exception)
            output = " ".join(captured.output)
            self.assertNotIn(self.device_token, output)
            self.assertNotIn(self.anon_jwt, output)
            self.assertIn(f"status={status}", output)

    def test_401_and_403_keep_cache_available(self):
        for status in (401, 403):
            with self.subTest(status=status), tempfile.TemporaryDirectory() as directory:
                cache = SnapshotCache(Path(directory) / "cache.json")
                cache.save({"product_pulse": {"wing_ratings": {"total": 309}}})
                error = urllib.error.HTTPError("https://example.test", status, "denied", None, None)
                with patch("urllib.request.urlopen", side_effect=error):
                    with self.assertRaises(AuthenticationError) as caught:
                        self.client().fetch()
                self.assertEqual(caught.exception.status, status)
                self.assertEqual(Snapshot.from_payload(cache.load().payload).wing_total, 309)

    def test_stale_cache_timestamp_is_preserved(self):
        with tempfile.TemporaryDirectory() as directory:
            cache = SnapshotCache(Path(directory) / "cache.json")
            old = datetime.now(timezone.utc) - timedelta(hours=2)
            cache.save({}, old)
            self.assertEqual(cache.load().saved_at, old)

    def test_malformed_api_response(self):
        with patch("urllib.request.urlopen", return_value=_Response(b"not-json")):
            with self.assertRaises(MalformedResponseError):
                self.client().fetch()

    def test_demo_mode_and_demo_payload(self):
        demo_path = Path(__file__).parents[1] / "data" / "demo_snapshot.json"
        payload = json.loads(demo_path.read_text(encoding="utf-8"))
        snapshot = Snapshot.from_payload(payload)
        self.assertGreater(snapshot.wing_total, 0)
        self.assertEqual(len(snapshot.history), 14)
        self.assertTrue(snapshot.has_download_history)
        self.assertIsNotNone(snapshot.growth_downloads.combined)
        with patch.dict("os.environ", {
            "BUFFAGO_GROWTH_DEMO": "true",
            "BUFFAGO_SUPABASE_ANON_JWT": "",
            "BUFFAGO_DASHBOARD_DEVICE_TOKEN": "",
            "BUFFAGO_GROWTH_ACCESS_TOKEN": "",
        }, clear=False):
            config = Config.from_env()
            self.assertTrue(config.demo)
            self.assertEqual(config.anon_jwt, "")
            self.assertEqual(config.device_token, "")


if __name__ == "__main__":
    unittest.main()
