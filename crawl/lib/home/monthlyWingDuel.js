/** Completion is evaluated against the active server-provided duel set. */
export function currentWingDuelCompletion(activeOptions, votesByBattleId) {
  const ids = (Array.isArray(activeOptions) ? activeOptions : [])
    .map((option) => option?.id)
    .filter((id) => id !== null && id !== undefined);

  return ids.length > 0 && ids.every((id) => {
    const choice = Number(votesByBattleId?.[id]);
    return choice === 1 || choice === 2;
  });
}
