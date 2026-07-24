const FALLBACK_ROUTE = '/(tabs)/home';

const UUID = '[0-9a-fA-F-]{36}';
const ROUTES = [
  { type: 'rating', pattern: new RegExp(`^buffago://rating/(${UUID})$`), route: (id) => `/profile/history/${id}` },
  { type: 'crawl', pattern: new RegExp(`^buffago://crawl/(${UUID})(?:\\?.*)?$`), route: (id) => `/crawl/${id}` },
  { type: 'streak', pattern: /^buffago:\/\/engagement\/today$/, route: () => '/(tabs)/home?focus=daily-engagement' },
  { type: 'friend_activity', pattern: /^buffago:\/\/friends\/activity$/, route: () => '/(tabs)/leaderboards?tab=friends' },
  { type: 'referrals', pattern: /^buffago:\/\/referrals$/, route: () => '/referrals' },
];

export function parseNotificationDeepLink(url) {
  if (typeof url !== 'string' || url.length > 500) {
    return { ok: false, reason: 'invalid_url', fallback: FALLBACK_ROUTE };
  }
  for (const candidate of ROUTES) {
    const match = candidate.pattern.exec(url);
    if (match) return { ok: true, type: candidate.type, route: candidate.route(match[1]) };
  }
  return { ok: false, reason: 'unsupported_destination', fallback: FALLBACK_ROUTE };
}

export async function resolveNotificationDestination({
  url,
  isAuthenticated,
  canAccess = async () => true,
}) {
  const parsed = parseNotificationDeepLink(url);
  if (!parsed.ok) return parsed;
  if (!isAuthenticated) {
    return {
      ok: false,
      reason: 'authentication_required',
      fallback: `/auth/login?returnTo=${encodeURIComponent(parsed.route)}`,
    };
  }
  try {
    if (!(await canAccess(parsed))) {
      return { ok: false, reason: 'destination_unavailable', fallback: FALLBACK_ROUTE };
    }
    return parsed;
  } catch {
    return { ok: false, reason: 'destination_check_failed', fallback: FALLBACK_ROUTE };
  }
}

export { FALLBACK_ROUTE as NOTIFICATION_FALLBACK_ROUTE };
