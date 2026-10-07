// Serialized writes and generation checks prevent late callbacks reviving an
// abandoned draft or overwriting a newer selection. Only metadata is stored.
export const WING_DRAFT_KEY = 'buffago:wing-image-draft:v1';
export const WING_DRAFT_LIFETIME = 15 * 60 * 1000;
export function createWingShotDraftStore(storage, now = Date.now) {
  let queue = Promise.resolve();
  /** @template T @param {() => Promise<T>} fn @returns {Promise<T>} */
  const serial = (fn) => {
    const result = queue.then(fn);
    queue = result.catch(() => {});
    return result;
  };
  const read = async () => {
    try { return JSON.parse(await storage.getItem(WING_DRAFT_KEY)); }
    catch { await storage.removeItem(WING_DRAFT_KEY); return null; }
  };
  const tombstone = (record) => storage.setItem(WING_DRAFT_KEY, JSON.stringify({
    version: 1, cleared: true, createdAt: record.createdAt, correlationId: record.correlationId,
  }));
  return {
    save: (input) => serial(async () => {
      const session = input.draft.session;
      const previous = await read();
      const createdAt = session.createdAt;
      if (!input.userId || !input.destinationId || !session.staging || !Number.isFinite(createdAt)) return false;
      if (previous && (previous.createdAt > createdAt ||
          (previous.createdAt === createdAt && previous.correlationId !== session.correlationId) ||
          (previous.cleared && previous.correlationId === session.correlationId))) return false;
      const record = {
        version: 1, userId: input.userId, destinationId: input.destinationId,
        flow: input.flow, ratingId: input.ratingId ?? null,
        ratingOperationId: input.ratingOperationId ?? null,
        createdAt, expiresAt: createdAt + WING_DRAFT_LIFETIME,
        correlationId: session.correlationId, lifecycle: input.lifecycle ?? 'staged',
        media: { kind: 'photo', mimeType: input.draft.media.mimeType, sizeBytes: input.draft.media.sizeBytes },
        consentAccepted: input.draft.consentAccepted === true,
        attributionPreference: input.draft.attributionPreference ?? null,
        caption: input.draft.caption ?? '',
        session: {
          createdAt, correlationId: session.correlationId, state: session.state,
          reserveIdempotencyKey: session.reserveIdempotencyKey,
          finalizeIdempotencyKey: session.finalizeIdempotencyKey,
          reservation: session.reservation ? { submissionId: session.reservation.submissionId,
            bucket: session.reservation.bucket, uploadPath: session.reservation.uploadPath } : null,
          staging: { bucket: session.staging.bucket, objectPath: session.staging.objectPath,
            correlationId: session.correlationId, uploadCompleted: true },
          uploadCompleted: session.uploadCompleted === true,
          requestFingerprint: session.requestFingerprint ?? null,
        },
      };
      await storage.setItem(WING_DRAFT_KEY, JSON.stringify(record));
      return true;
    }),
    load: (context) => serial(async () => {
      const record = await read();
      if (!record || record.cleared) return null;
      if (record.version !== 1 || record.userId !== context.userId ||
          !Number.isFinite(record.expiresAt) || record.expiresAt <= now() || record.createdAt > now() + 1000) {
        await tombstone(record); return null;
      }
      if ((context.destinationId && context.destinationId !== record.destinationId) ||
          (context.flow && context.flow !== record.flow)) return null;
      return { ...record, draft: {
        media: { ...record.media, uri: '', getUploadBody: async () => { throw new Error('Staged draft has no local bytes'); } },
        session: { ...record.session, restored: true, uploadedObject: null },
        consentAccepted: record.consentAccepted, attributionPreference: record.attributionPreference,
        caption: record.caption,
      } };
    }),
    clear: (correlationId) => serial(async () => {
      const record = await read();
      if (record && !record.cleared && record.correlationId === correlationId) await tombstone(record);
    }),
  };
}
