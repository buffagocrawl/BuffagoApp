export function ratingSaveUserMessage(error) {
  const detail = `${error?.code || ''} ${error?.message || ''}`.toLowerCase();
  if (/authentication_required|jwt|not_authenticated/.test(detail)) return 'Please sign in again, then retry your rating.';
  if (/location|proximity|too_far|outside.*radius/.test(detail)) return 'We could not verify that you are at this restaurant. Check location access and try again.';
  if (/network|fetch|timeout|offline/.test(detail)) return 'We could not confirm your rating saved. Check your connection and retry this rating.';
  return 'We could not confirm your rating saved. Please retry this rating.';
}
