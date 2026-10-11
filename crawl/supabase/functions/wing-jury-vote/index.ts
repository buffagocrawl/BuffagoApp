// @ts-nocheck
// Trusted authenticated Wing Jury vote boundary. Guests must never reach a write path.
// @ts-ignore
import { createBoundary, eligiblePhoto, HEADERS, respond, UUID, readJuryBody } from '../_shared/wingJury.ts';

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: HEADERS });
  if (request.method !== 'POST') return respond(405, { ok: false, error: 'method_not_allowed' });
  try {
    const body = await readJuryBody(request);
    if (!body) return respond(400, { ok: false, error: 'invalid_request' });
    const { admin, authClient, user } = await createBoundary(request);
    if (!user?.id || user.is_anonymous || !authClient) return respond(401, { ok: false, error: 'authentication_required' });
    const submissionId = typeof body?.submission_id === 'string' ? body.submission_id : '';
    const vote = body?.vote;
    if (!UUID.test(submissionId) || typeof vote !== 'number' || ![-1, 0, 1].includes(vote)) return respond(400, { ok: false, error: 'invalid_vote' });
    const photo = await eligiblePhoto(admin, submissionId);
    if (!photo) return respond(403, { ok: false, error: 'photo_not_eligible' });
    const inserted = await authClient.from('wing_jury_votes').insert({ submission_id: submissionId, user_id: user.id, vote }).select('submission_id,vote,created_at').single();
    let row = inserted.data;
    let existing = false;
    if (inserted.error) {
      if (inserted.error.code !== '23505') return respond(400, { ok: false, error: 'vote_not_saved' });
      const prior = await authClient.from('wing_jury_votes').select('submission_id,vote,created_at').eq('submission_id', submissionId).eq('user_id', user.id).maybeSingle();
      if (prior.error || !prior.data) return respond(409, { ok: false, error: 'existing_vote_unavailable' });
      row = prior.data; existing = true;
    }
    const counts = await authClient.from('wing_jury_photo_vote_counts').select('like_count').eq('submission_id', submissionId).maybeSingle();
    if (counts.error) return respond(503, { ok: false, error: 'vote_count_unavailable' });
    return respond(200, { ok: true, existing_vote: existing, submission_id: row.submission_id, vote: row.vote, created_at: row.created_at, like_count: Number(counts.data?.like_count || 0) });
  } catch { return respond(503, { ok: false, error: 'vote_unavailable' }); }
});
