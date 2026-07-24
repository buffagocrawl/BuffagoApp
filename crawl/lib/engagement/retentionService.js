function assertClient(supabase) {
  if (!supabase?.rpc) throw new Error('A Supabase client is required');
}

async function rpc(supabase, name, params = {}) {
  assertClient(supabase);
  const { data, error } = await supabase.rpc(name, params);
  if (error) {
    const wrapped = new Error(`Retention request failed: ${name}`);
    wrapped.cause = error;
    throw wrapped;
  }
  return data;
}

export function loadRetentionDashboard(supabase, { timezone = 'UTC' } = {}) {
  return rpc(supabase, 'get_engagement_dashboard', { p_timezone: timezone });
}

export function recordQualifyingAction(
  supabase,
  { actionType, actionRef, occurredAt = null, timezone = 'UTC' }
) {
  if (!actionType || !actionRef) throw new Error('actionType and actionRef are required');
  return rpc(supabase, 'record_engagement_action', {
    p_action_type: actionType,
    p_action_ref: String(actionRef),
    p_occurred_at: occurredAt,
    p_timezone: timezone,
  });
}

export function claimMissionReward(supabase, assignmentId) {
  if (!assignmentId) throw new Error('assignmentId is required');
  return rpc(supabase, 'claim_engagement_reward', { p_assignment_id: assignmentId });
}

export function updateRetentionPreferences(supabase, preferences) {
  return rpc(supabase, 'update_engagement_preferences', {
    p_timezone: preferences.timezone,
    p_mission_reminders: preferences.missionReminders,
    p_streak_reminders: preferences.streakReminders,
    p_weekly_reminders: preferences.weeklyReminders,
    p_event_alerts: preferences.eventAlerts,
  });
}
