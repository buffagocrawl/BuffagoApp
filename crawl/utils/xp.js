// utils/xp.js
import { supabase } from '../lib/supabase';

export const XP = {
  RATE_DEST: 25,
  ADD_TAGS: 5,
  COMPLETE_CRAWL: 100,
  FIRST_TIME_ROUTE: 50,
  FIRST_CITY: 25,
  DAILY_FIRST: 15,
  STREAK_3D: 50,
  STREAK_7D: 100,
};

// Ensure the user has a row in "users"
async function ensureUserRow(userId) {
  const { data, error } = await supabase
    .from('users')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle();
  if (!error && data) return true;

  // try insert (ignore conflict)
  const { error: insErr } = await supabase
    .from('users')
    .upsert({ user_id: userId, xp: 0 }, { onConflict: 'user_id', ignoreDuplicates: true });
  return !insErr;
}

/**
 * Grant XP to the signed-in user; returns new xp (number) or null on failure.
 * `toast` is optional; if provided should have a .show(amount, reason) function.
 */
export async function grantXp(amount, reason = '', toast) {
  try {
    const { data: { user } = {}, error: uErr } = await supabase.auth.getUser();
    if (uErr || !user) return null;

    // make sure row exists so update won't 404
    const ok = await ensureUserRow(user.id);
    if (!ok) return null;

    // read -> update (works with standard RLS "user can update own row")
    const { data: cur, error: selErr } = await supabase
      .from('users')
      .select('xp')
      .eq('user_id', user.id)
      .single();
    if (selErr) return null;

    const nextXp = (Number(cur?.xp) || 0) + Number(amount || 0);

    const { data: upd, error: updErr } = await supabase
      .from('users')
      .update({ xp: nextXp })
      .eq('user_id', user.id)
      .select('xp')
      .single();
    if (updErr) return null;

    // fire toast if provided
    try { toast?.show?.(amount, reason); } catch {}
    return upd?.xp ?? nextXp;
  } catch (e) {
    console.warn('[XP] grant failed', e?.message || e);
    return null;
  }
}
