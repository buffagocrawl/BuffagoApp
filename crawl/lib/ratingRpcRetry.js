// Retry only errors that PostgreSQL guarantees aborted the RPC transaction.
// Unknown network/COMMIT outcomes require the existing operation receipt path.
export async function ratingRpcRetry(supabase, name, parameters, pause = ms => new Promise(resolve => setTimeout(resolve, ms)), expectedUserId) {
  if (!['submit_validated_restaurant_rating', 'submit_validated_crawl_rating', 'submit_buffacoin_rating_v1'].includes(name)) {
    throw new Error('unsupported_rating_rpc');
  }
  const frozen = JSON.parse(JSON.stringify(parameters));
  // Raw Supabase clients can switch accounts during backoff. Bind this whole
  // operation to one token; pre-bound clients already carry their own header.
  let client = supabase;
  if (supabase.auth?.getSession) {
    const { data, error } = await supabase.auth.getSession();
    const session = data?.session;
    if (error || !session?.access_token || !session?.user?.id ||
        (expectedUserId && session.user.id !== expectedUserId)) throw new Error('account_changed');
    client = { rpc: (...args) => supabase.rpc(...args).setHeader('Authorization', `Bearer ${session.access_token}`) };
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await client.rpc(name, JSON.parse(JSON.stringify(frozen)));
    if (!['40P01', '40001'].includes(response.error?.code) || attempt === 2) return response;
    await pause(50 * (attempt + 1));
  }
}
