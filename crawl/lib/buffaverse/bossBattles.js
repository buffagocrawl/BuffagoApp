export const BOSS_BATTLE_SHOWCASE_FIXTURES = Object.freeze([
  { id: 'boss-live', state: 'live', title: 'The Crispy Crown', restaurantName: 'Northside Wings', progress: 3, target: 10, communityProgress: 24, communityTarget: 100, cta: 'Join the battle' },
  { id: 'boss-cold-start', state: 'cold_start', title: 'A quiet table needs a champion', restaurantName: 'Harbor House', progress: 0, target: 1, communityProgress: 0, communityTarget: 1, cta: 'See the mission' },
  { id: 'boss-completed', state: 'completed', title: 'Battle complete', restaurantName: 'Red Lantern', progress: 10, target: 10, communityProgress: 100, communityTarget: 100, cta: 'View reward reference' },
  { id: 'boss-expired', state: 'expired', title: 'This battle has ended', restaurantName: 'Old Mill Wings', progress: 2, target: 10, communityProgress: 47, communityTarget: 100, cta: 'Browse current battles' },
]);

export function projectBossBattle(event, participation = {}) {
  if (!event || !event.id || !event.title) return null;
  const target = Math.max(1, Number(event.target || 1));
  const progress = Math.min(target, Math.max(0, Number(participation.progress || 0)));
  return { ...event, target, progress, percent: Math.round((progress / target) * 100), communityProgress: Math.max(0, Number(event.communityProgress || 0)), communityTarget: Math.max(1, Number(event.communityTarget || target)) };
}
