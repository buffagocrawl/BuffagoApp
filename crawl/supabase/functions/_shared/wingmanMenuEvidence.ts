import { withWingmanDeadline } from './wingmanDeadline.ts';
export type WingmanMenuEvidence = {
  url: string; text: string; explicitUnavailable: boolean;
  source?: 'official' | 'third_party'; confirmsWings?: boolean;
  updatedAt?: string | null; locationMatched?: boolean;
};
const MAX_HTML_BYTES = 256000;
const MAX_TEXT = 6000;

export function publicMenuUrl(value: unknown): URL | null {
  try {
    if (typeof value !== 'string') return null;
    const url = new URL(value);
    if (url.protocol === 'http:') url.protocol = 'https:';
    const host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')
      || !host.includes('.') || /[^a-z0-9.-]/.test(host) || /^[0-9.]+$/.test(host)
      || /(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(host)) return null;
    return url;
  } catch { return null; }
}

export function publicMenuAddress(address: string) {
  if (address.includes(':')) return /^(?:2|3)[0-9a-f]{3}:/i.test(address) && !/^2001:(?:db8|0):/i.test(address);
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a,b] = parts;
  return a > 0 && a < 224 && a !== 10 && a !== 127 && !(a === 169 && b === 254)
    && !(a === 172 && b >= 16 && b <= 31) && !(a === 192 && (b === 168 || b === 0))
    && !(a === 100 && b >= 64 && b <= 127) && !(a === 198 && (b === 18 || b === 19 || b === 51))
    && !(a === 203 && b === 0);
}

export function wingMenuText(html: string) {
  const text = html.replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(?:p|li|tr|section|article)>/gi, '. ')
    .replace(/<[^>]*>/g, ' ').replace(/&(?:nbsp|amp|quot|#39);/gi, ' ').replace(/\s+/g, ' ').trim();
  const fragments = [...text.matchAll(/\bwings?\b/gi)].slice(0, 20).map(match => text.slice(Math.max(0, match.index! - 180), match.index! + 250));
  const excerpt = (fragments.length ? fragments.join('\n') : text.slice(0, 1500)).slice(0, MAX_TEXT);
  const durable = /\b(?:we\s+)?(?:no longer|do not|don['?]t)\s+(?:serve|offer|have)\s+(?:any\s+)?(?:chicken\s+)?wings\b|\bwings\s+(?:(?:are|have been)\s+)?(?:discontinued|removed from (?:the )?menu)\b/i;
  const unavailable = /\bno (?:chicken )?wings\b|\bwings\s+(?:(?:are|currently|are currently)\s+)?(?:unavailable|sold out|no longer available|not available)\b/i;
  const positiveText = text.split(/[.!?;\n]+/).filter(part => !durable.test(part) && !unavailable.test(part)).join(' ');
  const confirmsWings = /\b(?:chicken|buffalo|bone[ -]?in|boneless|traditional|jumbo|crispy|smoked|grilled|fried)\s+(?:chicken\s+)?wings\b|\b\d{1,3}\s*(?:pc|pcs|piece|pieces|count|ct)?\s*[- ]?\s*wings\b|\bwings\s*(?:\([^)]*\)\s*)?\$\s*\d/i.test(positiveText);
  const durableNegative = text.split(/[.!?;\n]+/).some(part => durable.test(part)
    && !/\b(?:today|tonight|temporarily|until|except|only|when|if|monday|tuesday|wednesday|thursday|friday|saturday|sunday)s?\b/i.test(part));
  return { text: excerpt, explicitUnavailable: durable.test(text) || unavailable.test(text), durableNegative, confirmsWings };
}

// Only fetch public menu/order links supplied by the matched Places website.
// No guessed restaurant URLs, provider search APIs, login or block evasion.
export async function loadWingmanMenuEvidence(website: unknown, options: {
  fetchPage: typeof fetch;
  resolveAddresses: (hostname: string) => Promise<string[]>;
  restaurantName?: string | null; city?: string | null; timeoutMs?: number;
}): Promise<WingmanMenuEvidence[]> {
  const root = publicMenuUrl(website);
  if (!root) return [];
  const deadline = Date.now() + Math.min(options.timeoutMs ?? 6500, 6500);
  const remaining = () => Math.max(1, Math.min(3000, deadline - Date.now()));
  const thirdParty = (url: URL) => /(?:^|\.)(?:yelp\.com|doordash\.com|ubereats\.com|grubhub\.com|toasttab\.com|order\.online|allmenus\.com|sirved\.com|menupix\.com)$/.test(url.hostname);
  const sameSite = (a: URL, b: URL) => a.hostname.replace(/^www\./, '') === b.hostname.replace(/^www\./, '');
  const normalize = (value: string) => value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '');
  const read = async (initial: URL) => {
    let url = initial;
    for (let redirect = 0; redirect < 2; redirect += 1) {
      if (Date.now() >= deadline) throw new Error('Menu deadline');
      const addresses = await withWingmanDeadline(options.resolveAddresses(url.hostname), remaining());
      if (!addresses.length || !addresses.every(publicMenuAddress)) throw new Error('Menu site unavailable');
      const response = await withWingmanDeadline(options.fetchPage(url.href, { redirect: 'manual', signal: AbortSignal.timeout(remaining()) }), remaining());
      if (response.status >= 300 && response.status < 400) {
        const next = publicMenuUrl(new URL(response.headers.get('location') || '', url).href);
        if (!next || !sameSite(next, initial)) throw new Error('Menu redirect unavailable');
        url = next; continue;
      }
      if (!response.ok || !/text\/(?:html|plain)/i.test(response.headers.get('content-type') || '')) throw new Error('Menu site unavailable');
      if (Number(response.headers.get('content-length')) > MAX_HTML_BYTES) throw new Error('Menu page too large');
      const reader = response.body?.getReader();
      if (!reader) throw new Error('Menu site unavailable');
      const decoder = new TextDecoder();let bytes = 0, html = '', truncated = false;
      try {
        while (true) {
          const chunk = await withWingmanDeadline(reader.read(), remaining());if (chunk.done) break;
          bytes += chunk.value.byteLength;if (bytes > MAX_HTML_BYTES) { truncated = true; break; }
          html += decoder.decode(chunk.value, { stream: true });
        }
      } finally { void reader.cancel().catch(() => {}); }
      return { url, html, truncated, updatedAt: response.headers.get('last-modified') };
    }
    throw new Error('Menu redirect unavailable');
  };
  const evidence: WingmanMenuEvidence[] = [];
  const record = (page: Awaited<ReturnType<typeof read>>) => {
    const parsed = wingMenuText(page.html);
    const text = normalize(page.html.replace(/<[^>]*>/g, ' '));
    const locationMatched = !!options.restaurantName && !!options.city
      && text.includes(normalize(options.restaurantName)) && text.includes(normalize(options.city));
    const source = thirdParty(page.url) ? 'third_party' as const : 'official' as const;
    evidence.push({ url: page.url.href, text: parsed.text, explicitUnavailable: parsed.explicitUnavailable,
      confirmsWings: parsed.confirmsWings && (source === 'official' || locationMatched),
      source, updatedAt: page.truncated ? null : page.updatedAt, locationMatched });
  };
  try {
    const home = await read(root);
    record(home);
    const links: URL[] = [];
    for (const match of home.html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
      if (!/menu|order|delivery|takeout|yelp/i.test(match[1] + ' ' + match[2])) continue;
      try {
        const candidate = publicMenuUrl(new URL(match[1].replace(/&amp;/g, '&'), home.url).href);
        if (candidate && candidate.href !== home.url.href
          && (sameSite(candidate, home.url) || thirdParty(candidate))
          && !links.some(item => item.href === candidate.href)) links.push(candidate);
      } catch { /* Malformed links do not discard other menus. */ }
      if (links.length >= 30) break;
    }
    const targets = [...links.filter(url => sameSite(url, home.url)).slice(0, 3),
      ...links.filter(url => !sameSite(url, home.url)).slice(0, 2)];
    await Promise.all(targets.map(async url => {
      try { record(await read(url)); } catch { /* Failed or blocked source is not negative evidence. */ }
    }));
  } catch { /* Missing evidence stays unknown. */ }
  return evidence;
}
