export const WING_SHOT_HISTORY_TABS = [
  { value: 'review', label: 'In Review', empty: 'No Wing Shots in review', body: 'New uploads appear here while they are prepared and reviewed.' },
  { value: 'approved', label: 'Approved', empty: 'No approved Wing Shots yet', body: 'Your approved and featured Wing Shots will appear here.' },
  { value: 'failed', label: 'Rejected / Failed', empty: 'No rejected or failed Wing Shots', body: 'Rejected, failed, duplicate, and withdrawn submissions appear here.' },
];

export function wingShotHistoryCollection(row) {
  const status = String(row?.internal_status || row?.display_status || '').toLowerCase();
  if (['approved', 'featured', 'posted', 'not selected yet', 'generation_pending', 'ready_to_post', 'scheduled', 'posting'].includes(status)) return 'approved';
  if (['rejected', 'failed', 'upload failed', 'duplicate video', 'withdrawn'].includes(status)) return 'failed';
  return 'review';
}

export function normalizeJuryCounts(row) {
  if (!row) return null;
  const values = [row.like_count, row.dislike_count, row.neutral_count];
  if (values.some((value) => value == null || !Number.isInteger(Number(value)) || Number(value) < 0)) return null;
  return { likes: Number(row.like_count), dislikes: Number(row.dislike_count), passes: Number(row.neutral_count) };
}

/** Reads persisted Wing Jury aggregates, never photo-gallery vote counters. */
export async function loadWingShotJuryCounts(rows, client) {
  const ids = rows.filter((row) => row.media_type === 'photo' && wingShotHistoryCollection(row) === 'approved').map((row) => row.submission_id);
  if (!ids.length) return rows;
  let persisted = [];
  let ownerCountsAvailable = false;
  // The review-only owner RPC supplies authoritative zeros once approved.
  // Older deployed servers retain their existing public aggregate fallback.
  if (typeof client.rpc === 'function') {
    try {
      const { data, error } = await client.rpc('get_my_wing_shot_jury_counts', { p_submission_ids: ids });
      if (!error && Array.isArray(data)) { persisted = data; ownerCountsAvailable = true; }
    } catch { /* Use the existing aggregate service if the RPC is unavailable. */ }
  }
  try {
    if (!ownerCountsAvailable) {
      const { data, error } = await client.from('wing_jury_photo_vote_counts')
        .select('submission_id,like_count,dislike_count,neutral_count').in('submission_id', ids);
      if (!error) persisted = data || [];
    }
  } catch { /* History and the existing viewer stay usable during network failure. */ }
  const counts = new Map(persisted.map((row) => [row.submission_id, normalizeJuryCounts(row)]));
  // An absent row can also mean RLS withheld it. Do not invent zero votes.
  return rows.map((row) => ({ ...row, jury_counts: counts.get(row.submission_id) ?? null }));
}
