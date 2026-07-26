function clampProgress(value, target) {
  return Math.max(0, Math.min(Number(target) || 0, Number(value) || 0));
}

export function deviceTimeZone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; }
}

export function buildWeeklyMissionFromAssignment(assignment) {
  if (!assignment || assignment.period_kind !== 'weekly') return null;
  const target = Number(assignment.target);
  if (!Number.isInteger(target) || target <= 0) return null;
  const progress = clampProgress(assignment.progress, target);
  const label = assignment.description || assignment.title || 'Complete your weekly mission';
  const reset = assignment.expires_at ? new Date(assignment.expires_at) : null;
  return { assignmentId: assignment.id || null, items: [{ key: assignment.mission_key || 'weekly_mission', label, current: progress, target, complete: progress >= target }], completedCount: progress >= target ? 1 : 0, totalCount: 1, completionRatio: progress / target, nextMission: progress >= target ? null : { key: assignment.mission_key || 'weekly_mission', actionLabel: 'Keep exploring' }, reward: { kind: 'xp', title: `${Number(assignment.reward_xp) || 0} XP`, detail: 'Reward progress is calculated by BuffaGo after eligible activity.' }, resetCopy: reset && !Number.isNaN(reset.getTime()) ? `Resets ${reset.toLocaleString()}.` : 'Resets at the next weekly boundary.' };
}

export function weeklyMissionResult(data) {
  const assignments = Array.isArray(data?.assignments) ? data.assignments : [];
  return buildWeeklyMissionFromAssignment(assignments.find((assignment) => assignment?.period_kind === 'weekly'));
}

export async function loadWeeklyMission(client, { timezone = deviceTimeZone() } = {}) {
  const { data, error } = await client.rpc('get_engagement_dashboard', { p_timezone: timezone });
  if (error) {
    const category = error.code === '42501' ? 'authentication_required' : error.code === '42883' ? 'schema_unavailable' : 'backend_unavailable';
    const safeError = new Error(category);
    safeError.category = category;
    throw safeError;
  }
  return weeklyMissionResult(data);
}
