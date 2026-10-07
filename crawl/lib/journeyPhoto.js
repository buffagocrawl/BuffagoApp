export function journeyPhotoStatus(status) {
  if (status === 'failed') return 'Upload Failed';
  if (status === 'rejected') return 'Rejected';
  if (status === 'withdrawn') return 'Withdrawn';
  if (['approved', 'generation_pending', 'ready_to_post', 'scheduled', 'posting', 'posted'].includes(status)) return 'Approved';
  return 'In Review';
}
