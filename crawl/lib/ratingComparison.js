export const COMPARISON_TOLERANCE = 0.1;
const METRICS = ['overall', 'crispiness', 'sauce', 'meat'];

const finiteScore = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

export function averageBeforeSubmission(rows, excludedRatingId = null) {
  const excluded = excludedRatingId == null ? null : String(excludedRatingId);
  const safeRows = (Array.isArray(rows) ? rows : []).filter((row) => (
    excluded == null || row?.id == null || String(row.id) !== excluded
  ));
  return Object.fromEntries(METRICS.map((key) => {
    const values = safeRows.map((row) => finiteScore(row?.[key])).filter((value) => value != null);
    return [key, values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null];
  }));
}

export function formatScore(value) {
  const score = finiteScore(value);
  return score == null ? '—' : score.toFixed(1);
}

export function formatDifference(delta) {
  const value = finiteScore(delta);
  if (value == null || Math.abs(value) < 0.05) return '0.0';
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}`;
}

export function overallComparisonCopy(delta, hasCommunity = true) {
  if (!hasCommunity || !Number.isFinite(Number(delta))) return 'Community comparison unavailable right now.';
  if (Math.abs(Number(delta)) <= COMPARISON_TOLERANCE) return 'You and the wing world are basically sharing a basket.';
  return Number(delta) > 0 ? 'You brought more wing love than the crowd.' : 'The crowd was a little more generous this time.';
}

export function comparisonFor(user, community) {
  const userScore = finiteScore(user);
  const communityScore = finiteScore(community);
  if (userScore == null || communityScore == null) {
    return { delta: null, symbol: '—', color: '#F5A623' };
  }
  const delta = userScore - communityScore;
  return {
    delta,
    symbol: Math.abs(delta) <= COMPARISON_TOLERANCE ? '=' : delta > 0 ? '▲' : '▼',
    color: Math.abs(delta) <= COMPARISON_TOLERANCE ? '#F5A623' : delta > 0 ? '#287A46' : '#A83D18',
  };
}

export function comparisonMessage(key, delta) {
  if (!Number.isFinite(Number(delta))) return 'No community average yet.';
  if (Math.abs(delta) <= COMPARISON_TOLERANCE) return 'You and the wing world agree.';
  if (delta >= 1) return { overall: 'You found a hidden heavyweight — you rated these wings way more than the crowd.', crispiness: 'Crunch champion detected.', sauce: 'That sauce understood the assignment.', meat: 'You found a seriously satisfying wing.' }[key] || 'You rated this higher than the crowd.';
  if (delta > COMPARISON_TOLERANCE) return 'A little more wing love from you.';
  if (delta <= -1) return { overall: 'Hot take alert.', crispiness: 'You demanded more crunch. Respect.', sauce: 'The sauce did not win you over.', meat: 'You expected a meatier wing.' }[key] || 'You were not buying the hype.';
  return 'The crowd was a little more impressed.';
}

export function personalityFor(user, community) {
  const values = METRICS.map((key) => finiteScore(user?.[key]));
  const available = values.filter((value) => value != null);
  if (available.length && available.every((value) => value >= 9)) return { title: 'CERTIFIED WING OPTIMIST', body: 'You found something to love in every bite.' };
  if (available.length >= 2 && Math.max(...available) - Math.min(...available) <= 0.5) return { title: 'BALANCED WING JUDGE', body: 'You weigh the whole wing experience.' };
  if (available.length && METRICS.every((key) => user?.[key] == null || (community?.[key] != null && Number(user[key]) < Number(community[key])))) return { title: 'THE TOUGH CRITIC', body: 'You keep every wing stop honest.' };
  const categories = ['crispiness', 'sauce', 'meat'].filter((key) => finiteScore(user?.[key]) != null);
  const highest = categories.sort((a, b) => Number(user[b]) - Number(user[a]))[0];
  return ({
    crispiness: { title: 'CRUNCH COMMANDER', body: 'You rewarded the crunch more than anything else.' },
    sauce: { title: 'SAUCE BOSS', body: 'You know exactly what a great sauce should do.' },
    meat: { title: 'MEATY WING MAVERICK', body: 'You found the satisfying center of the wing.' },
  }[highest] || { title: 'WING WORLD EXPLORER', body: 'Your take is now part of the BuffaGo wing world.' });
}
