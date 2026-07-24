export function resolveBuffaverseSurface({ legendary = null, bossBattle = null, mission = null, offline = false } = {}) {
  if (offline) return { kind: 'offline', title: 'You are offline', primaryAction: 'Retry when connected' };
  const active = [bossBattle && { kind: 'boss_battle', value: bossBattle }, legendary && { kind: 'legendary', value: legendary }, mission && { kind: 'mission', value: mission }].filter(Boolean);
  if (!active.length) return { kind: 'empty', title: 'Nothing active right now', primaryAction: 'Explore restaurants' };
  const winner = active.find((entry) => entry.kind === 'boss_battle') || active.find((entry) => entry.kind === 'legendary') || active[0];
  return { kind: winner.kind, value: winner.value, primaryAction: 'Open event' };
}
