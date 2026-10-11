// @ts-nocheck
// Post-verdict reveal boundary. Authenticated reveals require a committed vote;
// guest reveals require only the session-local verdict signal from the app.
// @ts-ignore
import { createBoundary, eligiblePhoto, HEADERS, respond, UUID, readJuryBody } from '../_shared/wingJury.ts';

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: HEADERS });
  if (request.method !== 'POST') return respond(405, { ok: false, error: 'method_not_allowed' });
  try {
    const body = await readJuryBody(request);
    if (!body) return respond(400, { ok: false, error: 'invalid_request' });
    const { admin, authClient, user } = await createBoundary(request);
    const submissionId = typeof body?.submission_id === 'string' ? body.submission_id : '';
    if (!UUID.test(submissionId)) return respond(400, { ok: false, error: 'invalid_photo' });
    const photo = await eligiblePhoto(admin, submissionId);
    if (!photo) return respond(404, { ok: false, error: 'photo_unavailable' });
    const authenticated = Boolean(user?.id && !user.is_anonymous);
    if (authenticated) {
      const vote = await admin.from('wing_jury_votes').select('submission_id').eq('submission_id', submissionId).eq('user_id', user.id).maybeSingle();
      if (vote.error || !vote.data) return respond(403, { ok: false, error: 'vote_required' });
    } else if (body?.guest_verdict_registered !== true) {
      return respond(403, { ok: false, error: 'guest_verdict_required' });
    }
    const destination = await admin.from('destinations').select('id,name,address,city,lat,lng').eq('id', photo.destination_id).maybeSingle();
    if (destination.error || !destination.data) return respond(404, { ok: false, error: 'restaurant_unavailable' });
    const ratings = await admin.rpc('wing_jury_restaurant_rating_summary', { p_destination_id: photo.destination_id });
    const summary = ratings.data;
    if (ratings.error || !summary || !Number.isInteger(summary.rating_count) || summary.rating_count < 0
      || !(summary.average_weight_score === null || (typeof summary.average_weight_score === 'number' && Number.isFinite(summary.average_weight_score))))
      return respond(503, { ok: false, error: 'reveal_unavailable' });
    const personalResult = authenticated
      ? await admin.from('destination_ratings').select('weight_score,created_at').eq('destination_id', photo.destination_id).eq('user_id', user.id).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(1)
      : { data: [], error: null };
    if (personalResult.error) return respond(503, { ok: false, error: 'reveal_unavailable' });
    const personal = personalResult.data?.[0] || null;
    const counts = await admin.from('wing_jury_photo_vote_counts').select('like_count').eq('submission_id', submissionId).maybeSingle();
    if (counts.error) return respond(503, { ok: false, error: 'reveal_unavailable' });
    const [favorite, want] = authenticated ? await Promise.all([
      admin.from('user_destination_favorites').select('destination_id').eq('user_id', user.id).eq('destination_id', photo.destination_id).maybeSingle(),
      admin.from('user_want_to_try').select('destination_id').eq('user_id', user.id).eq('destination_id', photo.destination_id).maybeSingle(),
    ]) : [{ data: null, error: null }, { data: null, error: null }];
    if (favorite.error || want.error) return respond(503, { ok: false, error: 'reveal_unavailable' });
    return respond(200, { ok: true, restaurant: destination.data, photo_like_count: Number(counts.data?.like_count || 0), restaurant_rating: { average_weight_score: summary.average_weight_score, rating_count: summary.rating_count }, personal_rating: personal ? { weight_score: personal.weight_score, created_at: personal.created_at } : null, favorite: Boolean(favorite.data), want_to_try: Boolean(want.data), save_action: authenticated ? (personal ? 'favorite' : 'want_to_try') : 'sign_in_to_save' });
  } catch { return respond(503, { ok: false, error: 'reveal_unavailable' }); }
});
