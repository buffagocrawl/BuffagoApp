import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { ENABLE_BUFFAVERSE, ENABLE_BUFFAVERSE_PERSONALIZATION } from '../config/features';
import { buildMilestones, chooseNextObjective, normalizeProgressSummary } from '../lib/buffaverse/progression';

export function useBuffaverseProgress({ enabled = true } = {}) {
  const [state, setState] = useState({ loading: Boolean(enabled), error: null, summary: null, disabled: false });
  const load = useCallback(async () => {
    if (!enabled || !ENABLE_BUFFAVERSE) {
      setState({ loading: false, error: null, summary: null, disabled: true });
      return;
    }
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData?.session?.user?.id;
    if (!userId) {
      setState({ loading: false, error: null, summary: null, disabled: false });
      return;
    }
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const [flagResult, levelResult, thresholdsResult, userResult, ratingsResult, crawlsResult, badgesResult] = await Promise.all([
        supabase.from('buffaverse_feature_flags').select('enabled').eq('flag_key', 'buffaverse.enabled').limit(1),
        supabase.from('user_with_level').select('level, xp').eq('user_id', userId).limit(1),
        supabase.from('level_thresholds').select('level, xp_required, level_title').order('level').limit(100),
        supabase.from('users').select('username, social_opt_out').eq('user_id', userId).limit(1),
        supabase.from('destination_ratings').select('id', { count: 'exact', head: true }).eq('user_id', userId),
        supabase.from('crawls').select('crawl_id', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'completed'),
        supabase.from('user_badges').select('badge_id', { count: 'exact', head: true }).eq('user_id', userId),
      ]);
      if (flagResult.error || flagResult.data?.[0]?.enabled !== true) {
        setState({ loading: false, error: null, summary: null, disabled: true });
        return;
      }
      const first = levelResult.data?.[0] || {};
      const level = Number(first.level || 1);
      const thresholds = thresholdsResult.data || [];
      const current = thresholds.find((row) => Number(row.level) === level);
      const next = thresholds.find((row) => Number(row.level) === level + 1);
      const summary = normalizeProgressSummary({
        levelProgress: { level, xp: first.xp, currentThreshold: current?.xp_required, nextThreshold: next?.xp_required },
        title: current?.level_title,
        metrics: { restaurants: ratingsResult.count, crawls: crawlsResult.count, badges: badgesResult.count, states: 0 },
        milestones: buildMilestones({ metrics: { restaurants: ratingsResult.count, crawls: crawlsResult.count, badges: badgesResult.count } }),
        privacyOptOut: Boolean(userResult.data?.[0]?.social_opt_out),
      });
      setState({ loading: false, error: null, summary, disabled: false, objective: chooseNextObjective({ summary, referralEnabled: false }) });
    } catch (error) {
      console.warn('[buffaverse] progress load failed', error?.message || 'unknown');
      setState({ loading: false, error: 'Progress is taking a break. Try again.', summary: null, disabled: false });
    }
  }, [enabled]);
  useEffect(() => { load(); }, [load]);
  return { ...state, reload: load, personalizationEnabled: ENABLE_BUFFAVERSE_PERSONALIZATION };
}
