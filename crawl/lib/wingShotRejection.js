const REJECTION_REASON_COPY = Object.freeze({
  quality_unusable: 'The video quality was too low to use.',
  too_dark: 'The video was too dark to clearly see the wings.',
  blurry: 'The video was too blurry to clearly see the wings.',
  unsafe_content: 'The video did not meet BuffaGo’s content guidelines.',
  unrelated_content: 'The video did not clearly show the wings or restaurant experience.',
  duplicate: 'This appears to be a duplicate submission.',
  unsupported_media: 'This media format could not be processed.',
});

export const UNKNOWN_WING_SHOT_REJECTION =
  'This Wing Shot did not meet the current submission guidelines.';

export function formatWingShotRejectionReason(reason) {
  const normalized = String(reason || '').trim().toLowerCase();
  if (REJECTION_REASON_COPY[normalized]) return REJECTION_REASON_COPY[normalized];

  // The owner-safe RPC may already return approved prose. Never pass through
  // database/enum-looking values to the user.
  if (reason && !/^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/.test(String(reason))) {
    return String(reason);
  }
  return UNKNOWN_WING_SHOT_REJECTION;
}

