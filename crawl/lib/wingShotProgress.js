export const WING_SHOT_PROGRESS_CAPS = {
  preparing: 90,
  uploading: 90,
  finalizing: 95,
};

export function reconcileDisplayedProgress({ displayed, real, stage }) {
  const cap = WING_SHOT_PROGRESS_CAPS[stage] ?? 100;
  const safeDisplayed = Math.max(0, Math.min(100, displayed || 0));
  const safeReal = Math.max(0, Math.min(100, real || 0));
  return Math.max(safeDisplayed, Math.min(cap, safeReal));
}
