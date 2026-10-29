"""GET-only credential validation. No ledger, source, upload or publisher runtime."""
import json
import os
import re

import requests
from guess_wing_spot.meta_reels import Graph, MetaError


class ReadOnlySession(requests.Session):
    def __init__(self):
        super().__init__()
        self.methods = []

    def request(self, method, url, **kwargs):
        if method.upper() != 'GET' or not re.fullmatch(r'https://graph\.facebook\.com/v\d+\.0/[A-Za-z0-9_/-]+', url):
            raise ValueError('credential_diagnostic_forbids_mutations')
        self.methods.append('GET')
        kwargs['allow_redirects'] = False
        return super().request(method, url, **kwargs)


def diagnose(env=os.environ):
    session = ReadOnlySession()
    graph = Graph(env['META_LONG_LIVED_ACCESS_TOKEN'], env['META_GRAPH_API_VERSION'],
                  session=session, app_secret=env['META_APP_SECRET'])
    try:
        result, _page_token = graph.validate(env['INSTAGRAM_BUSINESS_ACCOUNT_ID'], env['FACEBOOK_PAGE_ID'],
            env['GUESS_EXPECTED_INSTAGRAM_USERNAME'], env['GUESS_EXPECTED_FACEBOOK_NAME'])
    except MetaError as error:
        diagnostic = error.diagnostic or {}
        return {'status': 'blocked', 'reason': str(error) if re.fullmatch('[a-z0-9_]+', str(error)) else 'credential_check_failed',
                'missing_permissions': diagnostic.get('missing_permissions', []),
                'verified_required_permissions': diagnostic.get('verified_required_permissions', []),
                'methods': sorted(set(session.methods))}
    return {'status': 'publishing_credentials_verified_read_only',
            'permissions_verified': result['permissions_verified'],
            'token_validity_app_secret_identity_link_and_quota': 'passed',
            'methods': sorted(set(session.methods)), 'publication_attempted': False}


if __name__ == '__main__':
    try:
        safe = diagnose()
    except Exception:
        safe = {'status': 'blocked', 'reason': 'credential_diagnostic_failed_details_withheld'}
    print(json.dumps(safe))
    raise SystemExit(0 if safe['status'] == 'publishing_credentials_verified_read_only' else 1)
