export const DEFAULT_NOTIFICATION_PREFERENCES = Object.freeze({
  dailyStreakReminders: false,
  streakAtRisk: false,
  comeback: false,
  friendActivity: false,
  crawlProximity: false,
  productAnnouncements: false,
  quietHoursEnabled: true,
  quietStart: '22:00',
  quietEnd: '08:00',
  reminderLocalTime: '18:30',
});

export async function updateNotificationPreferences(supabase, preferences) {
  const value = { ...DEFAULT_NOTIFICATION_PREFERENCES, ...preferences };
  const { data, error } = await supabase.rpc('update_notification_preferences', {
    p_daily_streak_reminders: value.dailyStreakReminders,
    p_streak_at_risk: value.streakAtRisk,
    p_comeback: value.comeback,
    p_friend_activity: value.friendActivity,
    p_crawl_proximity: value.crawlProximity,
    p_product_announcements: value.productAnnouncements,
    p_quiet_hours_enabled: value.quietHoursEnabled,
    p_quiet_start: value.quietStart,
    p_quiet_end: value.quietEnd,
    p_reminder_local_time: value.reminderLocalTime,
    p_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  });
  if (error) throw new Error('Notification preference update failed', { cause: error });
  return data;
}
