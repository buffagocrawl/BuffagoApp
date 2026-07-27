function clampProgress(value, target) {
  return Math.max(0, Math.min(Number(target) || 0, Number(value) || 0));
}

function pluralize(count, singular) {
  return `${count} ${singular}${count === 1 ? '' : 's'}`;
}

function normalizedMissionType(assignment) {
  return String(assignment.mission_type || assignment.action_type || assignment.mission_key || '').toLowerCase();
}

// Presentation only: this maps the authoritative dashboard assignment, never
// assigns a mission or calculates progress from client-side event data.
export function weeklyMissionAction(actionRoute, type) {
  const route = String(actionRoute || '').toLowerCase();
  const kind = String(type || '').toLowerCase();
  if (route === 'ratings' || route === '/(tabs)/ratings' || kind.includes('rating')) return { key: 'ratings', actionLabel: 'Find a wing spot' };
  if (route === 'crawl' || route === '/(tabs)/journey' || kind.includes('crawl') || kind.includes('travel') || kind.includes('distance')) return { key: 'crawl', actionLabel: 'View Crawls' };
  if (route === 'wingdex' || kind.includes('wingdex') || kind.includes('discover') || kind.includes('town') || kind.includes('state')) return { key: 'wingdex', actionLabel: 'Explore Wingdex' };
  if (route === 'referrals' || route === '/referrals' || kind.includes('refer')) return { key: 'referrals', actionLabel: 'Invite a friend' };
  return null;
}

export function weeklyMissionDefinition(assignment, target) {
  const type = normalizedMissionType(assignment);
  const metadata = assignment.metadata && typeof assignment.metadata === 'object' ? assignment.metadata : {};
  const title = String(assignment.title || metadata.title || '').trim();
  const requirement = String(assignment.description || metadata.description || metadata.requirement || '').trim();
  const actionRoute = String(assignment.action_route || metadata.action_route || '').trim();
  if (title && requirement) return { title, requirement, action: weeklyMissionAction(actionRoute, type) };
  if (type.includes('rating')) return { title: title || (target === 1 ? 'Rate a Wing Spot' : 'Rate Wing Spots'), requirement: requirement || `Rate ${pluralize(target, 'wing spot')} before the weekly reset.`, action: weeklyMissionAction(actionRoute, 'rating') };
  if (type.includes('crawl') || type.includes('travel') || type.includes('distance')) {
    const distance = Number(metadata.distance ?? metadata.distance_miles);
    const unit = metadata.distance_unit || (metadata.distance_miles != null ? 'miles' : '');
    const travelRequirement = Number.isFinite(distance) && distance > 0 && unit ? `Travel ${distance} ${unit} during crawls this week.` : null;
    return { title: title || (type.includes('travel') || type.includes('distance') ? 'Travel During Crawls' : 'Complete a Crawl'), requirement: requirement || travelRequirement || `Complete ${pluralize(target, 'crawl stop')} this week.`, action: weeklyMissionAction(actionRoute, 'crawl') };
  }
  if (type.includes('wingdex') || type.includes('discover') || type.includes('town') || type.includes('state')) return { title: title || 'Explore the Wingdex', requirement: requirement || `Discover ${pluralize(target, 'new wing spot')} this week.`, action: weeklyMissionAction(actionRoute, 'wingdex') };
  if (type.includes('refer')) return { title: title || 'Refer a Wing Friend', requirement: requirement || `Refer ${pluralize(target, 'friend')} this week.`, action: weeklyMissionAction(actionRoute, 'referral') };
  return { title: title || 'Mission details are temporarily unavailable.', requirement: requirement || 'We cannot safely describe this assigned mission yet.', action: null };
}

export function deviceTimeZone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; }
}

export function weeklyMissionResetCopy(expiresAt, now = new Date()) {
  const reset = expiresAt ? new Date(expiresAt) : null;
  if (!reset || Number.isNaN(reset.getTime())) return 'Resets at the next weekly boundary.';
  const days = Math.ceil((reset.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
  if (days === 0) return 'Resets today at midnight.';
  if (days === 1) return 'Resets tomorrow.';
  if (days > 1 && days <= 6) return `Ends in ${days} days.`;
  return `Resets ${reset.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}.`;
}

export function buildWeeklyMissionFromAssignment(assignment) {
  if (!assignment || assignment.period_kind !== 'weekly') return null;
  const target = Number(assignment.target);
  if (!Number.isInteger(target) || target <= 0) return null;
  const progress = clampProgress(assignment.progress, target);
  const definition = weeklyMissionDefinition(assignment, target);
  if (definition.title.startsWith('Mission details')) console.warn('[weekly-mission] unknown_definition', { missionKey: assignment.mission_key || null });
  const item = { key: assignment.mission_key || 'weekly_mission', label: definition.title, detail: definition.requirement, current: progress, target, complete: progress >= target };
  return { assignmentId: assignment.id || null, items: [item], mission: item, completedCount: progress >= target ? 1 : 0, totalCount: 1, completionRatio: progress / target, nextMission: progress >= target ? null : definition.action, reward: { kind: 'xp', title: `${Number(assignment.reward_xp) || 0} XP`, detail: 'Reward progress is calculated by BuffaGo after eligible activity.' }, resetCopy: weeklyMissionResetCopy(assignment.expires_at) };
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
