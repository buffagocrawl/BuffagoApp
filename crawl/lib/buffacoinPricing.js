import { accountBoundRpc } from './accountBoundary.js';

// Bind the exact quote to the same authenticated account as the payment.
// No fallback to a possibly truncated ratings list or a guessed price.
export async function loadBuffacoinRatingCosts({ supabase, destinationIds, userId, isCurrent = () => true }) {
  const ids = [...new Set(destinationIds)];
  const client = await accountBoundRpc(supabase, userId, isCurrent);
  const costs = {};
  for (let offset = 0; offset < ids.length; offset += 100) {
    if (!isCurrent()) throw new Error('account_changed');
    const batch = ids.slice(offset, offset + 100);
    const { data, error } = await client.rpc('get_my_buffacoin_rating_costs', { p_destination_ids: batch });
    if (!isCurrent()) throw new Error('account_changed');
    if (error) throw error;
    if (!Array.isArray(data) || data.length !== batch.length) throw new Error('buffacoin_quote_unavailable');
    const remaining = new Set(batch);
    for (const row of data) {
      if (!remaining.delete(row.destination_id) || !Number.isSafeInteger(row.coin_cost) || row.coin_cost < 1) throw new Error('buffacoin_quote_unavailable');
      costs[row.destination_id] = row.coin_cost;
    }
  }
  return costs;
}

export async function refreshBuffacoinRatingQuote({ supabase, destinationId, userId, isCurrent }) {
  return (await loadBuffacoinRatingCosts({ supabase, destinationIds: [destinationId], userId, isCurrent }))[destinationId];
}
