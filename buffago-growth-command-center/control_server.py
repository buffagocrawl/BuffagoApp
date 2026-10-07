#!/usr/bin/env python3
"""Bounded, single-process LAN control server. Python standard library only."""
import hmac
import json
import logging
import math
import os
import secrets
import socket
from datetime import date, datetime
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.request import Request, build_opener, HTTPRedirectHandler
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from config import BASE_DIR, load_dotenv

LOG = logging.getLogger("buffago-control")
LIMIT = 16384
EXPERIMENT_FIELDS = {'id', 'title', 'hypothesis', 'metric_name', 'target_value', 'current_value', 'unit', 'start_date', 'end_date', 'status', 'notes', 'updated_at', 'day_number', 'duration_days', 'progress_pct'}
STATE_FIELDS = {
    'north_star': {'metric', 'label', 'current', 'previous_30d', 'change_pct', 'direction'},
    'current_experiment': EXPERIMENT_FIELDS,
    'todays_move': {'id', 'date', 'title', 'why_it_matters', 'status', 'updated_at'},
    'founder_balance_7d': {'tracked', 'product', 'growth', 'customer', 'total', 'window'},
    'marketing_insight': {'id', 'title', 'body', 'source', 'created_at', 'expires_at'},
}

def public_fields(value, fields, credentials):
    if value is None: return None
    if not isinstance(value, dict): raise ValueError()
    result = {}
    for key, item in value.items():
        if key not in fields: continue
        if not isinstance(item, (str, int, float, bool, type(None))): raise ValueError()
        if isinstance(item, str):
            for secret in credentials: item = item.replace(secret, '[redacted]')
        result[key] = item
    return result
SCHEMAS = {
    "set_experiment": {"title", "hypothesis", "metric_name", "target_value", "unit", "start_date", "end_date", "notes"},
    "update_experiment_progress": {"id", "target_value", "current_value", "notes"},
    "close_experiment": {"id", "status", "notes"},
    "set_move": {"date", "title", "why_it_matters"},
    "set_move_status": {"id", "status"},
    "log_activity": {"category", "description", "source"},
    "publish_insight": {"title", "body", "source", "expires_at"},
    "expire_insight": {"id"},
}

class ControlError(Exception):
    def __init__(self, status, message):
        self.status, self.message = status, message

def validate_action(payload):
    if not isinstance(payload, dict) or set(payload) - {"action", "data", "confirmed"}:
        raise ControlError(400, "Invalid action request.")
    action, data = payload.get("action"), payload.get("data")
    if not isinstance(action, str) or action not in SCHEMAS:
        raise ControlError(400, "Unsupported action.")
    if not isinstance(data, dict) or set(data) - SCHEMAS[action]:
        raise ControlError(400, "Invalid action fields.")
    for key, value in data.items():
        if key in {"target_value", "current_value"}:
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not 0 <= value <= 1e9:
                raise ControlError(400, "Enter a valid non-negative number.")
        elif value is not None and (not isinstance(value, str) or len(value) > (4000 if key in {"body", "notes", "hypothesis", "why_it_matters", "description"} else 200)):
            raise ControlError(400, "A field is invalid or too long.")
    required = {
        "set_experiment": ("title", "hypothesis", "metric_name", "target_value", "unit", "start_date", "end_date"),
        "update_experiment_progress": ("id",), "close_experiment": ("id", "status"),
        "set_move": ("date", "title"), "set_move_status": ("id", "status"),
        "log_activity": ("category",), "publish_insight": ("title", "body", "source"), "expire_insight": ("id",),
    }[action]
    if any(key not in data or data[key] is None or (isinstance(data[key], str) and not data[key].strip()) for key in required):
        raise ControlError(400, "Complete the required fields.")
    enums = {"close_experiment": ("status", {"won", "lost", "inconclusive", "paused"}), "set_move_status": ("status", {"open", "done", "skipped"}), "log_activity": ("category", {"growth", "customer", "product"})}
    if action in enums and data.get(enums[action][0]) not in enums[action][1]:
        raise ControlError(400, "Invalid status or category.")
    if action == "close_experiment" and payload.get("confirmed") is not True:
        raise ControlError(400, "Confirm before closing the experiment.")
    if action == 'update_experiment_progress' and not ({'target_value', 'current_value', 'notes'} & data.keys()):
        raise ControlError(400, "Include a target or progress change.")
    if action == "set_experiment" and data["metric_name"] != "mau_30d":
        raise ControlError(400, "Use the mau_30d metric.")
    try:
        for key in ("date", "start_date", "end_date"):
            if key in data: date.fromisoformat(data[key])
        if data.get("expires_at"): datetime.fromisoformat(data["expires_at"].replace("Z", "+00:00"))
        if action == "set_experiment" and data["end_date"] < data["start_date"]: raise ValueError()
    except (ValueError, TypeError):
        raise ControlError(400, "Check the dates.")
    return {"action": action, "data": data}

class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs): return None

class AdminClient:
    def __init__(self, url, anon, token, device="", timeout=12):
        parsed = urlsplit(url)
        if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
            raise ValueError("Configure a valid HTTPS Supabase project URL.")
        self.url = url.rstrip("/") + "/functions/v1/buffago-growth-admin"
        self.anon, self.token, self.timeout = anon, token, timeout
        self.secrets = tuple(v for v in (anon, token, device) if v)
        self.opener = build_opener(NoRedirect())

    def request(self, payload=None):
        req = Request(self.url, data=json.dumps(payload).encode() if payload is not None else None,
                      headers={"X-Buffago-Growth-Controller": self.token, "Content-Type": "application/json"})
        try:
            with self.opener.open(req, timeout=self.timeout) as response:
                raw = response.read(262145)
            if len(raw) > 262144: raise ValueError()
            value = json.loads(raw)
            if not isinstance(value, dict): raise ValueError()
            if payload is None:
                if not isinstance(value.get("growth_os"), dict) or not isinstance(value.get("recent_audit", []), list) or not isinstance(value.get("recent_experiments", []), list): raise ValueError()
                value = {
                    'growth_os': {key: public_fields(item, STATE_FIELDS[key], self.secrets) for key, item in value['growth_os'].items() if key in STATE_FIELDS},
                    'recent_audit': [public_fields(item, {'id', 'action', 'entity_type', 'entity_id', 'created_at', 'actor_device_id'}, self.secrets) for item in value.get('recent_audit', [])[:5]],
                    'recent_experiments': [public_fields(item, EXPERIMENT_FIELDS, self.secrets) for item in value.get('recent_experiments', [])[:10]],
                }
            elif value.get("error") or value.get("success") is False or value.get("ok") is False:
                raise ControlError(502, "The admin API could not save this change.")
            else:
                value = {"ok": True}  # Never forward arbitrary write responses.
            return value
        except HTTPError as exc:
            messages = {401: "Admin authentication failed. Check the Pi credentials.", 403: "Controller permission denied. Check its scope or revocation.", 400: "The admin API rejected these fields.", 422: "The admin API rejected these fields."}
            raise ControlError(502, messages.get(exc.code, "The admin API is unavailable.")) from None
        except (TimeoutError, socket.timeout):
            raise ControlError(504, "The admin API timed out. Try again later.") from None
        except URLError as exc:
            if isinstance(exc.reason, TimeoutError):
                raise ControlError(504, "The admin API timed out. Try again later.") from None
            raise ControlError(503, "The Pi cannot reach Supabase. Check its connection.") from None
        except OSError:
            raise ControlError(503, "The Pi cannot reach Supabase. Check its connection.") from None
        except (ValueError, UnicodeError):
            raise ControlError(502, "The admin API returned an invalid response.") from None

class ControlServer(HTTPServer):
    request_queue_size = 8
    def __init__(self, address, client):
        self.client = client
        self.csrf = secrets.token_urlsafe(32)
        super().__init__(address, Handler)
    def get_request(self):
        connection, address = super().get_request()
        connection.settimeout(5)
        return connection, address
    def handle_error(self, request, client_address): LOG.warning("Control request failed")

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args): pass  # No paths, bodies, headers, exceptions in logs.
    def reply(self, status, value, content_type="application/json"):
        body = value if isinstance(value, bytes) else json.dumps(value).encode()
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")
        self.end_headers()
        self.wfile.write(body)
    def same_origin(self):
        origin = self.headers.get("Origin")
        if not origin or origin != "http://" + self.headers.get("Host", "") or self.headers.get("Sec-Fetch-Site", "same-origin") not in {"same-origin", "none"}:
            raise ControlError(403, "Open the control site directly on your home network.")
    def do_GET(self):
        try:
            if self.path == "/api/state":
                value = self.server.client.request()
                value["csrf"] = self.server.csrf
                self.reply(200, value)
            elif self.path in {"/", "/control.css", "/control.js"}:
                name = "index.html" if self.path == "/" else self.path[1:]
                types = {"index.html": "text/html; charset=utf-8", "control.css": "text/css; charset=utf-8", "control.js": "text/javascript; charset=utf-8"}
                self.reply(200, (BASE_DIR / "control_web" / name).read_bytes(), content_type=types[name])
            else: self.reply(404, {"error": "Not found."})
        except ControlError as exc: self.reply(exc.status, {"error": exc.message})
    def do_POST(self):
        try:
            # Consume bounded bodies before rejecting a request so closing the HTTP/1.0
            # connection does not discard a friendly error behind a TCP reset.
            try: length = int(self.headers.get("Content-Length", "0"))
            except ValueError: raise ControlError(400, "Invalid request length.")
            if not 0 < length <= LIMIT:
                if 0 < length <= 65536: self.rfile.read(length)
                raise ControlError(413, "Request is too large or empty.")
            raw = self.rfile.read(length)
            self.same_origin()
            if self.path != "/api/action": raise ControlError(404, "Not found.")
            if not hmac.compare_digest(self.headers.get("X-CSRF-Token", "").encode(), self.server.csrf.encode()):
                raise ControlError(403, "CSRF verification failed. Refresh and try again.")
            if self.headers.get("Content-Type", "").split(";")[0] != "application/json" or self.headers.get("Transfer-Encoding"):
                raise ControlError(400, "Send a JSON request.")
            try: payload = json.loads(raw)
            except (ValueError, UnicodeError): raise ControlError(400, "Invalid JSON.")
            if not isinstance(payload, dict): raise ControlError(400, "Invalid request.")
            self.reply(200, self.server.client.request(validate_action(payload)))
        except ControlError as exc: self.reply(exc.status, {"error": exc.message})
        except (TimeoutError, OSError): pass

def main():
    load_dotenv(BASE_DIR / ".env")
    if os.getenv("BUFFAGO_CONTROL_ENABLED", "false").lower() != "true": return
    anon, token = os.getenv("BUFFAGO_SUPABASE_ANON_JWT", ""), os.getenv("BUFFAGO_GROWTH_CONTROLLER_TOKEN", "")
    if not token: raise ValueError("Configure the separate controller token.")
    client = AdminClient(os.getenv("BUFFAGO_SUPABASE_URL", ""), anon, token, os.getenv("BUFFAGO_DASHBOARD_DEVICE_TOKEN", ""))
    server = ControlServer((os.getenv("BUFFAGO_CONTROL_HOST", "0.0.0.0"), int(os.getenv("BUFFAGO_CONTROL_PORT", "8787"))), client)
    LOG.info("Local control server ready")
    try: server.serve_forever(poll_interval=1)
    finally: server.server_close()

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    try: main()
    except (ValueError, OSError):
        LOG.error("Control startup failed: check credentials, HTTPS project URL and bind settings.")
        raise SystemExit(1)
