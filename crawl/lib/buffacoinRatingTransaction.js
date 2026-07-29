export async function submitBuffacoinRatingTransaction({
  supabase,
  operationId,
  destinationId,
  stateCode,
  coinCost,
  rating,
}) {
  if (!operationId) throw new Error('operation_id_required');
  const { data, error } = await supabase.rpc('submit_buffacoin_rating_v1', {
    p_operation_id: operationId,
    p_destination_id: destinationId,
    p_state_code: stateCode,
    p_coin_cost: coinCost,
    p_rating: rating,
  });
  if (error) throw error;

  const result = Array.isArray(data) ? data[0] : data;
  if (
    !result?.operation_id ||
    result.operation_id !== operationId ||
    !result.rating_id ||
    !result.crawl_id ||
    !Number.isInteger(result.new_balance)
  ) throw new Error('ambiguous_transaction_result');
  return result;
}
