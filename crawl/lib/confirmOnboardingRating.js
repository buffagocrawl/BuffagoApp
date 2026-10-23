import { loadGuestRatingPreview } from './guestRatingPreview';
import { getWingShotHandoff, isWingShotDestinationId } from './wingShotAuthIntent';
import { ratingRpcRetry } from './ratingRpcRetry';

// Called only by the explicit confirmation button. The preview UUID is an
// operation key, never a rating ID. The existing RPC owns authorization,
// proximity validation, replay receipts, scoring, and photo eligibility.
export async function confirmOnboardingRating({ storage, client, handoffId, userId, locate }) {
  const intent = await getWingShotHandoff({ storage, client, handoffId });
  const preview = await loadGuestRatingPreview(storage);
  if (!intent || intent.userId !== userId || !intent.previewId ||
      preview?.preview_id !== intent.previewId || preview.payload?.destination_id !== intent.destinationId) {
    throw new Error('preview_unavailable');
  }
  const p = preview.payload;
  if (![p.crispiness, p.sauce, p.meat, p.overall].every(n => Number.isInteger(n) && n >= 1 && n <= 10)) throw new Error('invalid_rating_scores');
  const position = await locate();
  const current = await getWingShotHandoff({ storage, client, handoffId });
  if (!current || current.userId !== userId || current.previewId !== intent.previewId) throw new Error('account_changed');
  const { data, error } = await ratingRpcRetry(client, 'submit_validated_restaurant_rating', {
    p_operation_id: preview.preview_id, p_destination_id: intent.destinationId,
    p_latitude: position?.coords?.latitude ?? null, p_longitude: position?.coords?.longitude ?? null,
    p_accuracy_m: position?.coords?.accuracy ?? null,
    p_crispiness: p.crispiness, p_sauce: p.sauce, p_meat: p.meat, p_overall: p.overall,
    p_wings_eaten: 0, p_tag_id: null, p_sauce_style: null, p_flavor_vibe: null,
    p_spice_level: null, p_would_order_again: null,
  }, undefined, userId);
  if (error) throw error;
  if (data?.accepted !== true || !isWingShotDestinationId(data?.rating_id)) throw new Error('rating_receipt_missing');
  return data;
}

export function onboardingRatingError(error) {
  const message = String(error?.message || '');
  if (/location|proximity|permission/i.test(message)) return 'Your rating has not been confirmed as saved. Enable location and retry while at the restaurant. Your local preview stays on this device.';
  if (/preview_unavailable|invalid_rating/.test(message)) return 'This local preview is unavailable. Continue to Home and start a new rating.';
  if (/account_changed/.test(message)) return 'Your account changed. Return Home and sign in again.';
  return 'We could not confirm your rating was saved. Retry safely with the same rating, or continue to Home. Your local preview is retained.';
}
