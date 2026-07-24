export async function checkDailyEngagement(supabase, timezone) {
  if (!supabase?.rpc) throw new Error('A Supabase client is required');
  const { data, error } = await supabase.rpc('check_daily_engagement', {
    p_reported_timezone: timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  });
  if (error) throw new Error('Daily engagement check failed', { cause: error });
  return data;
}

export function dailyEngagementViewModel(data, { pending = false } = {}) {
  return {
    localDate: data?.local_date ?? null,
    timezone: data?.timezone ?? 'UTC',
    qualifiedToday: Boolean(data?.qualified_today),
    currentStreak: Number(data?.current_streak) || 0,
    longestStreak: Number(data?.longest_streak) || 0,
    nextEligibleAt: data?.next_eligible_at ?? null,
    pending,
    cta: data?.qualified_today
      ? { label: 'See what friends rated', route: '/(tabs)/leaderboards?tab=friends' }
      : { label: 'Rate, battle, or continue a crawl', route: '/(tabs)/home?focus=qualifying-action' },
  };
}
