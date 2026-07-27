// Presentation helpers only. Counts and streak values always originate in the
// challenge RPCs; the client never derives credit from mission progress.
export const challengeLabel = (count) => `${Number(count) || 0} challenge${Number(count) === 1 ? '' : 's'}`;

export function normalizeChallengeLeaderboard(payload) {
  const rows = Array.isArray(payload) ? payload : [];
  return rows.map((row) => ({
    userId: row.user_id,
    rank: Number(row.rank) || 0,
    username: String(row.display_name || row.username || '').trim() || `Winglet_${String(row.user_id || '').slice(0, 6)}`,
    avatarUrl: row.avatar_url || null,
    completions: Number(row.challenge_count) || 0,
    xp: Number(row.challenge_xp) || 0,
    isCurrentUser: Boolean(row.is_current_user),
  }));
}

export async function loadChallengeLeaderboard(client, period) {
  const { data, error } = await client.rpc('get_challenge_leaderboard', {
    p_period: period,
    p_limit: 25,
  });
  if (error) throw error;
  return normalizeChallengeLeaderboard(data);
}

export async function loadPublicChallengeStats(client, userId) {
  const { data, error } = await client.rpc('get_public_challenge_stats', { p_target_user_id: userId });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return row ? {
    total: Number(row.total_completed) || 0,
    thisWeek: Number(row.this_week_completed) || 0,
    currentStreak: Number(row.current_weekly_streak) || 0,
    bestStreak: Number(row.best_weekly_streak) || 0,
  } : null;
}
