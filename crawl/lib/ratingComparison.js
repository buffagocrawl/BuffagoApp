export function comparisonFor(user, community) {
  if (!Number.isFinite(Number(user)) || !Number.isFinite(Number(community))) {
    return { delta: null, symbol: '=', color: '#F5A623' };
  }
  const delta = Number(user) - Number(community);
  return {
    delta,
    symbol: Math.abs(delta) <= 0.2 ? '=' : delta > 0 ? '▲' : '▼',
    color: Math.abs(delta) <= 0.2 ? '#F5A623' : delta > 0 ? '#58D68D' : '#FF6B6B',
  };
}

export function comparisonMessage(key, delta) {
  if (delta == null) return 'No community average yet.';
  if (delta >= 1) return { overall: 'You were feeling these wings way more than the crowd.', crispiness: 'Crunch champion detected.', sauce: 'That sauce clearly understood the assignment.', meat: 'You found these wings seriously satisfying.' }[key];
  if (delta >= 0.3) return 'You scored this a little higher than the BuffaGo community.';
  if (delta <= -1) return { overall: 'The crowd loved these more than you did. Tough judge.', crispiness: 'You demanded more crunch. Respect.', sauce: 'The sauce did not win you over.', meat: 'You expected a meatier wing.' }[key];
  if (delta <= -0.3) return 'You were a little tougher than the average rater.';
  return 'You and the BuffaGo community are wing-to-wing on this one.';
}

export function personalityFor(user, community) {
  const values = ['overall', 'crispiness', 'sauce', 'meat'].map((key) => Number(user?.[key]));
  if (values.every((value) => value >= 9)) return { title: 'CERTIFIED WING OPTIMIST', body: 'You found something to love in every bite.' };
  if (Math.max(...values) - Math.min(...values) <= 0.5) return { title: 'BALANCED WING JUDGE', body: 'You weigh the whole wing experience.' };
  if (values.every((value, index) => { const key = ['overall', 'crispiness', 'sauce', 'meat'][index]; return community?.[key] != null && value < Number(community[key]); })) return { title: 'THE TOUGH CRITIC', body: 'You keep every wing stop honest.' };
  const categories = ['crispiness', 'sauce', 'meat'];
  const highest = categories.sort((a, b) => Number(user[b]) - Number(user[a]))[0];
  return {
    crispiness: { title: 'CRUNCH COMMANDER', body: 'You rewarded the crunch more than anything else.' },
    sauce: { title: 'SAUCE BOSS', body: 'You know exactly what a great sauce should do.' },
    meat: { title: 'MEATY WING MAVERICK', body: 'You found the satisfying center of the wing.' },
  }[highest];
}
