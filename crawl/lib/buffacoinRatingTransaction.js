import { ratingRpcRetry } from './ratingRpcRetry.js';

// Only explicit server rejections prove the statement did not commit. A lost
// response, missing receipt or connectivity failure must retain its operation.
export function classifyBuffacoinTransactionError(error, { previouslyDispatched = false } = {}) {
  const code = String(error?.code || '');
  if (previouslyDispatched) {
    // These specific deployed-function failures occur only AFTER its receipt
    // lookup. An early auth/schema/validation rejection cannot rule out an
    // earlier commit whose receipt has not been returned to this device.
    if (code === '42703' && /column c\.created_at does not exist/i.test(error?.message || '')) return 'definitive_failure';
    if (code === 'P0001' && ['insufficient_balance', 'destination_ownership_invalid', 'coin_cost_mismatch'].includes(error?.message)) return 'definitive_failure';
    return 'ambiguous';
  }
  if (['account_changed', 'operation_id_required'].includes(error?.message)) return 'definitive_failure';
  if (/^(22|23|42)/.test(code) || ['P0001', '40001', '40P01', '57014', 'PGRST202', 'PGRST204'].includes(code)) return 'definitive_failure';
  return 'ambiguous';
}

export function isBuffacoinReceipt(result, operationId) {
  return !!result && typeof result.operation_id === 'string' && result.operation_id === operationId &&
    typeof result.rating_id === 'string' && !!result.rating_id &&
    typeof result.crawl_id === 'string' && !!result.crawl_id &&
    Number.isInteger(result.new_balance) && result.new_balance >= 0;
}

export async function submitBuffacoinRatingTransaction({
  supabase,
  operationId,
  destinationId,
  stateCode,
  coinCost,
  rating,
  expectedUserId,
}) {
  if (!operationId) throw new Error('operation_id_required');
  const { data, error } = await ratingRpcRetry(supabase, 'submit_buffacoin_rating_v1', {
    p_operation_id: operationId,
    p_destination_id: destinationId,
    p_state_code: stateCode,
    p_coin_cost: coinCost,
    p_rating: rating,
  }, undefined, expectedUserId);
  if (error) throw error;

  const result = Array.isArray(data) ? data[0] : data;
  if (!isBuffacoinReceipt(result, operationId)) throw new Error('ambiguous_transaction_result');
  return result;
}
