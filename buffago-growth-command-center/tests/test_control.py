import io
import json
import logging
import threading
import unittest
from http.client import HTTPConnection
from unittest.mock import Mock, patch
from urllib.error import HTTPError, URLError
from control_server import AdminClient, ControlError, ControlServer, SCHEMAS
import control_server

ANON, TOKEN, DEVICE = 'test-anon-secret', 'test-controller-secret', 'test-display-secret'
STATE = {'growth_os': {'north_star': {'current': 4}}, 'recent_audit': [], 'recent_experiments': []}
CASES = {
    'set_move': {'date': '2026-10-07', 'title': 'Test'},
    'set_move_status': {'id': 'move-id', 'status': 'done'},
    'log_activity': {'category': 'growth', 'description': 'Test', 'source': 'mobile_control'},
    'set_experiment': {'title': 'Sprint', 'hypothesis': 'Grow', 'metric_name': 'mau_30d', 'target_value': 20, 'unit': 'users', 'start_date': '2026-10-21', 'end_date': '2026-11-03'},
    'update_experiment_progress': {'id': 'experiment-id', 'target_value': 30},
    'close_experiment': {'id': 'experiment-id', 'status': 'won'},
    'publish_insight': {'title': 'Test', 'body': 'Insight', 'source': 'founder', 'expires_at': None},
    'expire_insight': {'id': 'insight-id'},
}

class StartupTests(unittest.TestCase):
    def test_no_local_auth_or_anon_required(self):
        env = {'BUFFAGO_CONTROL_ENABLED': 'true', 'BUFFAGO_SUPABASE_URL': 'https://example.supabase.co', 'BUFFAGO_GROWTH_CONTROLLER_TOKEN': TOKEN}
        with patch.object(control_server, 'load_dotenv'), patch.dict(control_server.os.environ, env, clear=True), patch.object(control_server, 'ControlServer') as server:
            control_server.main()
            server.return_value.serve_forever.assert_called_once()
    def test_disabled_does_not_start(self):
        with patch.object(control_server, 'load_dotenv'), patch.dict(control_server.os.environ, {}, clear=True), patch.object(control_server, 'ControlServer') as server:
            control_server.main()
            server.assert_not_called()

class ClientTests(unittest.TestCase):
    def setUp(self):
        self.client = AdminClient('https://example.supabase.co', ANON, TOKEN, DEVICE)
        self.client.opener = Mock()
    def response(self, value):
        response = Mock()
        response.read.return_value = json.dumps(value).encode()
        response.__enter__ = Mock(return_value=response)
        response.__exit__ = Mock(return_value=False)
        self.client.opener.open.return_value = response
    def test_state_parsing_headers(self):
        self.response(STATE)
        self.assertEqual(self.client.request(), STATE)
        req = self.client.opener.open.call_args.args[0]
        self.assertEqual(req.get_method(), 'GET')
        self.assertIsNone(req.get_header('Authorization'))
        self.assertEqual(req.get_header('X-buffago-growth-controller'), TOKEN)
        self.assertNotIn(DEVICE, str(req.headers))
    def test_credential_redaction(self):
        self.response({**STATE, 'growth_os': {'marketing_insight': {'body': ANON + TOKEN + DEVICE, 'service_role': 'unknown-secret'}}, 'token': TOKEN})
        result = json.dumps(self.client.request())
        for secret in (ANON, TOKEN, DEVICE): self.assertNotIn(secret, result)
        self.assertNotIn('unknown-secret', result)
        self.assertIn('[redacted]', result)
    def test_401_403_network_timeout(self):
        for error, status, message in [(HTTPError('url', 401, TOKEN, {}, None), 502, 'authentication'), (HTTPError('url', 403, TOKEN, {}, None), 502, 'permission'), (URLError(TOKEN), 503, 'reach'), (TimeoutError(TOKEN), 504, 'timed out'), (URLError(TimeoutError(TOKEN)), 504, 'timed out')]:
            with self.subTest(message=message):
                self.client.opener.open.side_effect = error
                with self.assertRaises(ControlError) as c: self.client.request()
                self.assertEqual(c.exception.status, status)
                self.assertIn(message, c.exception.message)
                self.assertNotIn(TOKEN, c.exception.message)
    def test_invalid_state_and_failed_write(self):
        for value in ([], {}, {'growth_os': {}, 'recent_audit': {}}):
            self.response(value)
            with self.assertRaises(ControlError): self.client.request()
        self.response({'success': False, 'error': TOKEN})
        with self.assertRaises(ControlError): self.client.request({'action': 'log_activity', 'data': {}})

class HttpTests(ClientTests):
    def setUp(self):
        super().setUp()
        self.response(STATE)
        self.server = ControlServer(('127.0.0.1', 0), self.client)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.csrf = ''
    def tearDown(self):
        self.server.shutdown(); self.server.server_close(); self.thread.join()
    def request(self, path, payload=None, csrf=True, origin=True):
        conn = HTTPConnection(*self.server.server_address, timeout=3)
        headers = {}
        if payload is not None:
            headers['Content-Type'] = 'application/json'
            if origin: headers['Origin'] = 'http://%s:%s' % self.server.server_address
            if csrf: headers['X-CSRF-Token'] = self.csrf
        conn.request('GET' if payload is None else 'POST', path, None if payload is None else json.dumps(payload), headers)
        response = conn.getresponse()
        result = response.status, response.read(), response.getheader('Set-Cookie')
        conn.close()
        return result
    def load_state(self):
        status, body, cookie = self.request('/api/state')
        self.assertEqual(status, 200)
        self.assertIsNone(cookie)
        self.csrf = json.loads(body)['csrf']
        self.client.opener.open.reset_mock()
    def test_lan_page_opens_directly(self):
        status, body, cookie = self.request('/')
        self.assertEqual(status, 200)
        self.assertIn(b'<div id="app">', body)
        self.assertIsNone(cookie)
        self.load_state()
    def test_csrf_origin(self):
        self.load_state()
        self.assertEqual(self.request('/api/action', {}, csrf=False)[0], 403)
        self.assertEqual(self.request('/api/action', {}, origin=False)[0], 403)
        self.csrf = 'wrong'
        self.assertEqual(self.request('/api/action', {})[0], 403)
        self.client.opener.open.assert_not_called()
    def test_malformed_actions(self):
        self.load_state()
        for payload in ([], {'action': [], 'data': {}}, {'action': 'set_move', 'data': []}, {'action': 'set_move', 'data': {}, 'unexpected': True}):
            self.assertEqual(self.request('/api/action', payload)[0], 400)
        self.client.opener.open.assert_not_called()
    def test_unsupported_locally(self):
        self.load_state()
        self.assertEqual(self.request('/api/action', {'action': 'arbitrary', 'data': {}})[0], 400)
        self.client.opener.open.assert_not_called()
    def test_all_action_proxies_and_close_confirmation(self):
        self.load_state()
        self.assertEqual(set(CASES), set(SCHEMAS))
        for action, data in CASES.items():
            with self.subTest(action=action):
                payload = {'action': action, 'data': data}
                if action == 'close_experiment':
                    self.assertEqual(self.request('/api/action', payload)[0], 400)
                    payload['confirmed'] = True
                status, body, _ = self.request('/api/action', payload)
                self.assertEqual(status, 200, body)
                req = self.client.opener.open.call_args.args[0]
                self.assertEqual(json.loads(req.data), {'action': action, 'data': data})
                self.assertEqual(req.get_method(), 'POST')
    def test_browser_and_log_credentials(self):
        stream = io.StringIO(); handler = logging.StreamHandler(stream)
        logger = logging.getLogger('buffago-control'); logger.addHandler(handler)
        try:
            self.load_state()
            for path in ('/', '/control.js', '/control.css', '/api/state'):
                status, body, _ = self.request(path)
                self.assertEqual(status, 200)
                for secret in (ANON, TOKEN, DEVICE): self.assertNotIn(secret.encode(), body)
            self.client.opener.open.side_effect = URLError(TOKEN + ANON)
            self.assertEqual(self.request('/api/state')[0], 503)
            for secret in (ANON, TOKEN, DEVICE): self.assertNotIn(secret, stream.getvalue())
        finally: logger.removeHandler(handler)
    def test_sizes_validation(self):
        self.load_state()
        for payload in ({'action': 'set_move', 'data': {'date': 'bad', 'title': 'Test'}}, {'action': 'set_move', 'data': {'date': '2026-10-07', 'title': 'Test', 'url': 'https://evil'}}, {'action': 'log_activity', 'data': {'category': 'unknown'}}, {'action': 'set_move', 'data': {'title': 'x' * 17000}}):
            self.assertIn(self.request('/api/action', payload)[0], (400, 413))
        self.client.opener.open.assert_not_called()
