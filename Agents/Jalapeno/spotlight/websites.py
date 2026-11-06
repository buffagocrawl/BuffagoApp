"""Bounded public HTTPS reads. No credentials, cookies, JS, or page instructions.

Pin the validated DNS address at connect time while retaining TLS hostname
verification. Every redirect is revalidated; there is no proxy/DNS second lookup.
"""
import http.client
import ipaddress
import socket
import ssl
import time
import queue
import threading
from urllib.parse import urljoin, urlsplit, urlunsplit


class FetchError(RuntimeError):
    pass


def public_url(url):
    try:
        p = urlsplit(url)
        if (p.scheme != 'https' or not p.hostname or p.username or p.password
                or p.port not in (None, 443) or len(url) > 2048
                or any(ord(c) < 33 for c in url) or '\\' in url):
            raise ValueError()
        host = p.hostname.encode('idna').decode('ascii').lower()
        if host == 'localhost' or host.endswith(('.localhost', '.local', '.internal')):
            raise ValueError()
        try:
            if not ipaddress.ip_address(host).is_global:
                raise ValueError()
        except ValueError:
            # A numeric address must be public, not treated as a DNS name.
            if ':' in host or all(c in '0123456789.' for c in host):
                raise FetchError('unsafe_url') from None
        return urlunsplit(('https', host, p.path or '/', p.query, ''))
    except (ValueError, UnicodeError):
        raise FetchError('unsafe_url') from None


def host_key(url):
    return urlsplit(url).hostname.removeprefix('www.')


class PinnedHTTPS(http.client.HTTPSConnection):
    def __init__(self, host, address):
        super().__init__(host, timeout=5, context=ssl.create_default_context())
        self.address = address

    def connect(self):
        raw = socket.create_connection((self.address, 443), timeout=5)
        try:
            self.sock = self._context.wrap_socket(raw, server_hostname=self.host)
        except Exception:
            raw.close()
            raise


class Fetcher:
    def __init__(self, maximum=32, seconds=90, resolver=socket.getaddrinfo, connection=PinnedHTTPS):
        self.remaining = maximum
        self.deadline = time.monotonic() + seconds
        self.resolver, self.connection = resolver, connection
        self.cache = {}

    def get(self, url):
        url = public_url(url)
        if url in self.cache:
            value = self.cache[url]
            if isinstance(value, FetchError):
                raise value
            return value
        original = url
        try:
            for redirect in range(3):
                # Redirects only within the same exact host/www alias. An
                # official rebrand needs a new discovery seed and verification.
                if host_key(url) != host_key(original):
                    raise FetchError('cross_host_redirect')
                for attempt in range(2):
                    if self.remaining <= 0 or time.monotonic() >= self.deadline:
                        raise FetchError('request_budget_exhausted')
                    self.remaining -= 1
                    p = urlsplit(public_url(url))
                    connection = None
                    try:
                        resolved = queue.Queue(maxsize=1)
                        def lookup(host=p.hostname, results=resolved):
                            try:
                                results.put(self.resolver(host, 443, type=socket.SOCK_STREAM))
                            except OSError as error:
                                results.put(error)
                        threading.Thread(target=lookup, daemon=True).start()
                        try:
                            addresses = resolved.get(timeout=5)
                        except queue.Empty:
                            raise FetchError('website_dns_timeout') from None
                        if isinstance(addresses, OSError):
                            raise addresses
                        ips = sorted({item[4][0] for item in addresses})
                        if not ips or any(not ipaddress.ip_address(ip).is_global for ip in ips):
                            raise FetchError('private_dns_address')
                        connection = self.connection(p.hostname, ips[0])
                        connection.request('GET', (p.path or '/') + ('?' + p.query if p.query else ''),
                                           headers={'User-Agent': 'BuffaGo-Spotlight-Verification/1.0',
                                                    'Accept': 'text/html,application/xhtml+xml',
                                                    'Accept-Encoding': 'identity'})
                        response = connection.getresponse()
                        if response.status in (301, 302, 303, 307, 308):
                            target = public_url(urljoin(url, response.getheader('Location', '')))
                            if host_key(target) != host_key(original):
                                raise FetchError('cross_host_redirect')
                            url = target
                            break
                        if response.status in (429, 500, 502, 503, 504) and attempt == 0:
                            continue
                        if response.status != 200:
                            raise FetchError('website_http_' + str(response.status))
                        if 'html' not in (response.getheader('Content-Type', '')).lower():
                            raise FetchError('not_html')
                        if response.getheader('Content-Encoding', 'identity') != 'identity':
                            raise FetchError('unsupported_encoding')
                        chunks, size, until = [], 0, time.monotonic() + 10
                        while True:
                            if time.monotonic() > min(until, self.deadline):
                                raise FetchError('read_deadline')
                            chunk = response.read1(65536)
                            if not chunk:
                                break
                            chunks.append(chunk)
                            size += len(chunk)
                            if size > 2_000_000:
                                raise FetchError('page_too_large')
                        value = (url, b''.join(chunks).decode('utf-8', errors='replace'))
                        self.cache[original] = value
                        return value
                    except (OSError, http.client.HTTPException):
                        if attempt == 1:
                            raise FetchError('website_unavailable') from None
                    finally:
                        if connection:
                            connection.close()
                else:
                    raise FetchError('website_unavailable')
            raise FetchError('redirect_limit')
        except FetchError as error:
            self.cache[original] = error
            raise
