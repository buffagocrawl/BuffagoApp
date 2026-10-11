// Photo retries never call a rating or coin RPC. Keep the committed receipt
// bound to the staged selection even if the user changes screens.
export function createRatingPhotoAttachment({ submit, drafts, client, userId, flow, isCurrent = () => true }) {
  let inFlight = false;
  return async function attach(pending) {
    if (!pending?.ratingId || !pending?.destinationId || !pending?.draft?.session) {
      throw new Error('Committed rating and photo draft required');
    }
    if (inFlight) return null;
    inFlight = true;
    const { draft, ratingId, destinationId, operationId } = pending;
    try {
      const persist = (session = draft.session) => {
        if (!isCurrent()) throw new Error('Account changed');
        draft.session = session;
        return drafts.save({ userId, flow, destinationId, ratingId,
          ratingOperationId: operationId, lifecycle: 'attaching', draft });
      };
      if (!await persist()) throw new Error('This photo draft has been replaced.');
      if (!isCurrent()) throw new Error('Account changed');
      const result = await submit({ client, input: { userId, ratingId, destinationId,
        media: draft.media, consentAccepted: draft.consentAccepted === true,
        attributionPreference: draft.attributionPreference, caption: draft.caption || '',
        submissionSource: 'buffacoin' }, session: draft.session, onSessionChange: persist });
      if (!isCurrent()) return null;
      await drafts.clear(draft.session.correlationId);
      return result;
    } finally { inFlight = false; }
  };
}
