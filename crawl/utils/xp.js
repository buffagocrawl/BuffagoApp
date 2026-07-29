// utils/xp.js
import { supabase } from '../lib/supabase';

export const XP = {
  RATE_DEST: 25,
  ADD_TAGS: 5,
  FIRST_RATING: 50,
  NEW_DESTINATION: 25,
  COMPLETE_CRAWL: 100,
  FIRST_TIME_ROUTE: 50,
  FIRST_CITY: 50,
  FIRST_STATE: 150,
  DAILY_FIRST: 15,
  STREAK_3D: 50,
  STREAK_7D: 100,
};

const SOURCE_BY_REASON = {
  'Rated a destination': 'rating',
  'Added tag': 'rating_detail',
  'First rating': 'first_rating',
  'New restaurant': 'new_destination',
  'New city': 'new_city',
  'New state': 'new_state',
  'Daily first rating': 'daily_first_rating',
  'Completed a crawl': 'crawl_completed',
  'First time this route': 'first_route',
  'Welcome bonus': 'welcome_bonus',
};

function normalizeSource(source, reason) {
  const raw = source || SOURCE_BY_REASON[reason] || reason || 'manual';
  return String(raw)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'manual';
}

function unwrapRpc(data) {
  return Array.isArray(data) ? data[0] : data;
}

/**
 * Grant XP to the signed-in user; returns new xp (number) or null on failure.
 * `toast` is optional; if provided should have a .show(amount, reason) function.
 */
export async function grantXp(amount, reason = '', toast, options = {}) {
  try {
    const { data: { user } = {}, error: uErr } = await supabase.auth.getUser();
    if (uErr || !user) return null;

    const xpAmount = Number(amount || 0);
    if (!Number.isFinite(xpAmount) || xpAmount === 0) return null;

    const source = normalizeSource(options.source, reason);
    const metadata = {
      source_screen: options.sourceScreen ?? null,
      ...options.metadata,
    };

    const { data: awarded, error: awardErr } = await supabase.rpc('claim_verified_progression_xp', {
      p_source: source,
      p_destination_id: options.destinationId ?? null,
      p_crawl_id: options.crawlId ?? null,
      p_route_id: options.routeId ?? null,
      p_metadata: metadata,
    });

    if (!awardErr) {
      const row = unwrapRpc(awarded);
      if (!row?.awarded) return null;
      try { toast?.show?.(Number(row.amount || xpAmount), row.reason || reason); } catch {}
      return Number(row?.xp_after ?? 0);
    }

    // The server derives all amounts and evidence.  A missing or failed RPC is
    // a deployment error, never authorization to mutate a user's XP directly.
    console.warn('[XP] verified progression claim failed', awardErr?.message || awardErr);
    return null;
  } catch (e) {
    console.warn('[XP] grant failed', e?.message || e);
    return null;
  }
}
