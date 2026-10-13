export type WingmanMenuEvidence = { url: string; text: string; explicitUnavailable: boolean };
const MAX_HTML_BYTES = 64000;
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
    .replace(/<[^>]*>/g, ' ').replace(/&(?:nbsp|amp|quot|#39);/gi, ' ').replace(/\s+/g, ' ').trim();
  const fragments = [...text.matchAll(/\bwings?\b/gi)].slice(0, 20).map(match => text.slice(Math.max(0, match.index! - 180), match.index! + 250));
  const excerpt = (fragments.length ? fragments.join('\n') : text.slice(0, 1500)).slice(0, MAX_TEXT);
  return { text: excerpt, explicitUnavailable: /\b(?:no longer (?:serve|offer|have)|do not (?:serve|offer|have)|don['’]t (?:serve|offer|have)|not (?:serving|offering))\s+(?:any\s+)?(?:chicken\s+)?wings\b|\bno (?:chicken )?wings\b|\bwings\s+(?:(?:are|currently|are currently)\s+)?(?:unavailable|discontinued|sold out|no longer available|not available|removed from (?:the )?menu)\b/i.test(text) };
}

// Fetch only a Places-provided public site and one same-origin menu link. Every
// redirect is checked again, private DNS targets are refused, and a missing or
// inaccessible page supplies no positive evidence or replacement score.
export async function loadWingmanMenuEvidence(website: unknown, options: {
  fetchPage: typeof fetch;
  resolveAddresses: (hostname: string) => Promise<string[]>;
}): Promise<WingmanMenuEvidence[]> {
  const root = publicMenuUrl(website);
  if (!root) return [];
  const read = async (initial: URL) => {
    let url = initial;
    for (let redirect = 0; redirect < 2; redirect += 1) {
      const addresses = await options.resolveAddresses(url.hostname);
      if (!addresses.length || !addresses.every(publicMenuAddress)) throw new Error('Menu site unavailable');
      const response = await options.fetchPage(url.href, { redirect: 'manual', signal: AbortSignal.timeout(4000) });
      if (response.status >= 300 && response.status < 400) {
        const next = publicMenuUrl(new URL(response.headers.get('location') || '', url).href);
        if (!next || next.origin !== root.origin) throw new Error('Menu redirect unavailable');
        url = next; continue;
      }
      if (!response.ok || !/text\/(?:html|plain)/i.test(response.headers.get('content-type') || '')) throw new Error('Menu site unavailable');
      if (Number(response.headers.get('content-length')) > MAX_HTML_BYTES) throw new Error('Menu page too large');
      const reader = response.body?.getReader();
      if (!reader) throw new Error('Menu site unavailable');
      const decoder = new TextDecoder();let bytes = 0, html = '';
      try {
        while (true) {
          const chunk = await reader.read();if (chunk.done) break;
          bytes += chunk.value.byteLength;if (bytes > MAX_HTML_BYTES) break;
          html += decoder.decode(chunk.value, { stream: true });
        }
      } finally { await reader.cancel(); }
      return { url, html };
    }
    throw new Error('Menu redirect unavailable');
  };
  const evidence: WingmanMenuEvidence[] = [];
  try {
    const home = await read(root);
    evidence.push({ url: home.url.href, ...wingMenuText(home.html) });
    const link = [...home.html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
      .find(match => /\bmenu\b/i.test(match[1] + ' ' + match[2]));
    const menu = link ? publicMenuUrl(new URL(link[1], home.url).href) : null;
    if (menu && menu.origin === home.url.origin && menu.href !== home.url.href) {
      try { const page = await read(menu);evidence.push({ url: page.url.href, ...wingMenuText(page.html) }); } catch { /* Keep the attributable home-page evidence. */ }
    }
  } catch { /* Missing evidence stays unknown. */ }
  return evidence;
}
