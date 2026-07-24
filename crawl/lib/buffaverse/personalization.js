const MAX_CANDIDATES = 20;

export function chooseBuffaverseNextAction({ candidates = [], completedIds = [], hasLocation = false } = {}) {
  const completed = new Set(completedIds);
  const eligible = candidates.filter((candidate) => candidate && candidate.id && !completed.has(candidate.id) && candidate.enabled !== false).slice(0, MAX_CANDIDATES);
  if (!hasLocation) return { kind: 'location', title: 'Choose a place to explore', reason: 'Location is unavailable; no local claim is made.' };
  if (!eligible.length) return { kind: 'explore', title: 'Explore nearby wings', reason: 'There is not enough verified event activity for a personalized claim.' };
  return { kind: 'event', eventId: eligible[0].id, title: eligible[0].title, reason: eligible[0].reason || 'Selected from available verified event data.' };
}
