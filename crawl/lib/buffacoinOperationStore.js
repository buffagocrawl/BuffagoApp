import { submitBuffacoinRatingTransaction, classifyBuffacoinTransactionError, isBuffacoinReceipt } from './buffacoinRatingTransaction.js';

export const BUFFACOIN_OPERATION_KEY = 'buffago:buffacoin-rating-operation:v1';
const queues = new WeakMap();
const inFlight = new WeakMap();
const copy = (value) => JSON.parse(JSON.stringify(value));
const keyFor = (userId) => `${BUFFACOIN_OPERATION_KEY}:${encodeURIComponent(userId)}`;

// This record has no expiry: an unknown financial outcome must survive restart
// until the same account reconciles it. Never store tokens or photo bytes.
export function createBuffacoinOperationStore(storage) {
  const serial = (fn) => {
    const previous = queues.get(storage) || Promise.resolve();
    const next = previous.catch(() => {}).then(fn);
    queues.set(storage, next);
    return next;
  };
  const read = async (userId) => {
    if (!userId) throw new Error('account_changed');
    const raw = await storage.getItem(keyFor(userId));
    if (!raw) return null;
    // Do not delete corrupt records: doing so could permit a second debit.
    const record = JSON.parse(raw);
    if (record.version !== 1 || record.userId !== userId || !record.operationId || record.request?.operationId !== record.operationId ||
        !['prepared','submitting','ambiguous','definitive_failure','committed'].includes(record.status)) throw new Error('invalid_buffacoin_operation_record');
    if (record.status === 'committed' && !isBuffacoinReceipt(record.receipt,record.operationId)) return { ...record, status: 'ambiguous', receipt: null };
    return record;
  };
  return {
    storage,
    load: (userId) => serial(() => read(userId)),
    prepare: ({ userId, operationId, destinationId, stateCode, coinCost, rating }) => serial(async () => {
      if (!userId || !operationId || !destinationId) throw new Error('operation_id_required');
      const request = copy({ operationId, destinationId, stateCode, coinCost, rating });
      const existing = await read(userId);
      if (existing) {
        if (existing.operationId !== operationId) throw new Error('buffacoin_operation_unresolved');
        if (JSON.stringify(existing.request) !== JSON.stringify(request)) throw new Error('buffacoin_operation_payload_changed');
        return existing;
      }
      const record = { version: 1, userId, operationId, request, status: 'prepared', receipt: null };
      await storage.setItem(keyFor(userId), JSON.stringify(record));
      return record;
    }),
    update: ({ userId, operationId, status, receipt = null, errorCode = null, errorMessage = null }) => serial(async () => {
      const record = await read(userId);
      if (!record || record.operationId !== operationId) throw new Error('buffacoin_operation_replaced');
      const next = { ...record, status, receipt: receipt ? copy(receipt) : record.receipt, errorCode, errorMessage };
      await storage.setItem(keyFor(userId), JSON.stringify(next));
      return next;
    }),
    clear: ({ userId, operationId }) => serial(async () => {
      const record = await read(userId);
      if (!record || record.operationId !== operationId) return false;
      if (!['committed', 'definitive_failure', 'prepared'].includes(record.status)) throw new Error('buffacoin_operation_unresolved');
      await storage.removeItem(keyFor(userId));
      return true;
    }),
  };
}

// Explicit retry reconciles the original operation using its frozen payload.
// The server receipt/idempotency lock makes this safe after a lost response.
export function reconcileBuffacoinOperation({ store, supabase, userId, isCurrent = () => true }) {
  let active = inFlight.get(store.storage);
  if (!active) { active = new Map(); inFlight.set(store.storage, active); }
  if (active.has(userId)) return active.get(userId);
  const operation = (async () => {
    const record = await store.load(userId);
    if (!record) throw new Error('buffacoin_operation_missing');
    if (!isCurrent()) throw new Error('account_changed');
    if (record.status === 'committed' && isBuffacoinReceipt(record.receipt,record.operationId)) return { status: 'committed', receipt: record.receipt, record };
    if (record.status === 'definitive_failure') return { status: record.status, errorCode: record.errorCode, error: {code:record.errorCode,message:record.errorMessage}, record };
    await store.update({ userId, operationId: record.operationId, status: 'submitting' });
    let receipt;
    try {
      if (!isCurrent()) throw new Error('account_changed');
      // Callers with an auth-less client must supply an account-bound RPC client.
      receipt = await submitBuffacoinRatingTransaction({ supabase, ...record.request, expectedUserId: userId });
    } catch (error) {
      const status = classifyBuffacoinTransactionError(error, { previouslyDispatched: record.status !== 'prepared' });
      const next = await store.update({ userId, operationId: record.operationId, status, errorCode: error?.code || null, errorMessage: error?.message || null });
      return { status, error, record: next };
    }
    // If persistence fails after commit, the on-disk submitting record remains
    // unresolved and retries the same operation; it can never create a new ID.
    const next = await store.update({ userId, operationId: record.operationId, status: 'committed', receipt });
    return { status: 'committed', receipt, record: next };
  })();
  active.set(userId, operation);
  void operation.finally(() => { if (active.get(userId) === operation) active.delete(userId); }).catch(() => {});
  return operation;
}
