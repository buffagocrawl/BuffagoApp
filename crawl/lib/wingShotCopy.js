const REJECTION_REASON_COPY = Object.freeze({
  quality_unusable: 'The video quality was too low to use.',
  too_dark: 'The video was too dark to clearly see the wings.',
  blurry: 'The video was too blurry to clearly see the wings.',
  unsafe_content: 'The video did not meet BuffaGo’s content guidelines.',
  unrelated_content: 'The video did not clearly show the wings or restaurant experience.',
  duplicate: 'This appears to be a duplicate submission.',
  unsupported_media: 'This media format could not be processed.',
});

const SAFE_CATEGORY_COPY = new Set([
  'Does not clearly show wings',
  'Media quality',
  'Duplicate or repeated submission',
  'Privacy concern',
  'Content safety',
  'Sharing rights',
  'Not eligible for featuring',
]);

export const UNKNOWN_WING_SHOT_REJECTION =
  'This Wing Shot did not meet the current submission guidelines.';

/** Maps internal rejection codes to safe user-facing copy. */
export function formatWingShotRejectionReason(reason) {
  const code = String(reason || '').trim().toLowerCase();
  if (REJECTION_REASON_COPY[code]) return REJECTION_REASON_COPY[code];
  if (SAFE_CATEGORY_COPY.has(reason)) return reason;
  return UNKNOWN_WING_SHOT_REJECTION;
}

