export const CELEBRATION_LEVELS = Object.freeze({
  micro: { duration: 140, scaleFrom: 0.98, haptic: 'light' },
  standard: { duration: 260, scaleFrom: 0.92, haptic: 'medium' },
  major: { duration: 420, scaleFrom: 0.82, haptic: 'success' },
});

export function getCelebrationPlan(level = 'micro', reducedMotion = false) {
  const selected = CELEBRATION_LEVELS[level] || CELEBRATION_LEVELS.micro;
  if (!reducedMotion) return { ...selected, level, animate: true };
  return {
    ...selected,
    level,
    animate: false,
    duration: 0,
    scaleFrom: 1,
  };
}

export function progressDuration(previous, next, reducedMotion = false) {
  if (reducedMotion || Number(previous) === Number(next)) return 0;
  const distance = Math.min(1, Math.abs(Number(next) - Number(previous)));
  return Math.round(140 + distance * 220);
}
