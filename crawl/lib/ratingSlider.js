const clampRatingScore = (value) => Math.max(1, Math.min(10, Math.round(Number(value) || 1)));
function ratingScoreAtPosition(x, width, rtl = false, inset = 14) {
  const usable = width - inset * 2;
  if (!Number.isFinite(x) || usable <= 0) return null;
  const fraction = Math.max(0, Math.min(1, (x - inset) / usable));
  return clampRatingScore(1 + 9 * (rtl ? 1 - fraction : fraction));
}
module.exports = { clampRatingScore, ratingScoreAtPosition };
