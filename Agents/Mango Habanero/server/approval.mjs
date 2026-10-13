import { spawn } from 'node:child_process';
import { resolve, isAbsolute } from 'node:path';
import crypto from 'node:crypto';

export const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const rejectReasons = ['poor_media_quality','inappropriate_content','not_related_to_rating','duplicate_submission','copyright_or_ownership','restaurant_or_attribution','other'];
export function localRequestsOnly(port, frontendPort = 4317) {
  const allowed = new Set([`127.0.0.1:${port}`, `localhost:${port}`, `127.0.0.1:${frontendPort}`, `localhost:${frontendPort}`]);
  return (req, res, next) => {
    const deny = () => res.status(403).json({ error: 'Local same-origin requests only.' });
    if (!allowed.has(req.headers.host) || (req.headers['sec-fetch-site'] && !['same-origin','same-site','none'].includes(req.headers['sec-fetch-site']))) return deny();
    if (req.headers.origin || !['GET','HEAD'].includes(req.method)) {
      try { const origin = new URL(req.headers.origin); if (origin.protocol !== 'http:' || origin.host !== req.headers.host) return deny(); }
      catch { return deny(); }
    }
    res.set('Cache-Control','no-store'); next();
  };
}
const preparationFailure = job => ({
  EXISTING_DERIVATIVE_INCOMPATIBLE: 'An existing derivative is incompatible with the current source or processing contract. It was preserved; operator attention is required.',
  INVALID_MEDIA: 'The original photo failed safe media validation.',
  DUPLICATE_MEDIA: 'Duplicate media blocked preparation.',
  TRANSIENT_DEPENDENCY_FAILURE: 'A photo-processing dependency was temporarily unavailable. Retry after the scheduled delay.',
  STALE_LEASE: 'The previous processing lease expired. Refresh before retrying.'
}[job?.last_error_code]);
export function validateReview(id, input) {
  if (!uuid.test(id)) throw new Error('Invalid submission ID.');
  const { action, reasonCategory, reviewerNote } = input;
  if (!['approve','reject'].includes(action) || !(action === 'approve' ? ['standard_acceptable','documented_override'] : rejectReasons).includes(reasonCategory)) throw new Error('Choose a valid review reason.');
  if (typeof reviewerNote !== 'string' || reviewerNote.trim().length < 8 || reviewerNote.length > 2000) throw new Error('Review notes must contain 8–2000 characters.');
}

export const workerDirectory = resolve(import.meta.dirname, '../../Jalapeno');
export function workerInvocation(id, env = process.env) {
  if (!uuid.test(id)) throw new Error('Invalid submission ID.');
  if (!env.MANGO_PYTHON_EXECUTABLE || !isAbsolute(env.MANGO_PYTHON_EXECUTABLE)) throw new Error('Set MANGO_PYTHON_EXECUTABLE to the absolute path of Jalapeño’s Python executable.');
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Photo worker credentials are missing.');
  const childEnv = Object.fromEntries(['SystemRoot','WINDIR','PATH','TEMP','TMP','USERPROFILE','APPDATA','LOCALAPPDATA'].filter(k => env[k]).map(k => [k, env[k]]));
  Object.assign(childEnv, { SUPABASE_URL: env.SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY,
    WING_PROCESSING_ENVIRONMENT: 'production', WING_MODERATION_PROVIDER_MODE: 'manual-review',
    WING_PROCESSING_ALLOW_TEST_PROVIDER: 'false', WING_PROCESSING_WORKER_ID: `mango-${crypto.randomUUID()}`,
    PYTHONUNBUFFERED: '1', PYTHONDONTWRITEBYTECODE: '1' });
  return { executable: env.MANGO_PYTHON_EXECUTABLE, args: [resolve(workerDirectory, 'wing_processing_worker_main.py'), '--photo-once', '--photo-submission-id', id.toLowerCase(), '--photo-review-only'],
    options: { cwd: workerDirectory, env: childEnv, shell: false, windowsHide: true, stdio: ['ignore','pipe','pipe'] } };
}
let runningChild;
export function runWorker(id, env = process.env, spawnChild = spawn) {
  const invocation = workerInvocation(id, env);
  if (runningChild) return Promise.reject(new Error('A photo worker is still stopping. Try again shortly.'));
  return new Promise((resolvePromise, reject) => {
    let child;
    try { child = spawnChild(invocation.executable, invocation.args, invocation.options); }
    catch { reject(new Error('Photo worker could not start. Check Python prerequisites.')); return; }
    runningChild = child;
    let bytes = 0; let failure;
    const stop = message => {
      if (failure) return;
      failure = message;
      // Retain the process slot until close, even if termination fails.
      try { child.kill('SIGKILL'); } catch { /* no child output is returned */ }
      reject(new Error(message));
    };
    const timer = setTimeout(() => stop('Photo preparation timed out. Retry after the processing lease expires.'), 120000);
    const consume = chunk => { bytes += chunk.length; if (bytes > 65536) stop('Photo worker exceeded its output limit.'); };
    child.stdout.on('data', consume); child.stderr.on('data', consume);
    child.on('error', () => { clearTimeout(timer); if (!child.pid) runningChild = undefined; reject(new Error('Photo worker could not start. Check Python prerequisites.')); });
    child.on('close', code => { clearTimeout(timer); runningChild = undefined; if (failure || code !== 0) reject(new Error(failure || 'Photo preparation failed. Check the selected submission’s processing status.')); else resolvePromise(); });
  });
}

// Only known contract errors are safe to print. Database details can contain
// submitted text, credentials or URLs, so never serialize the error object.
export function safeReviewError(error) {
  const known = new Set(['creator_reward_rating_ineligible', 'processed_photo_required_for_approval',
    'wing_reviewer_role_required', 'review_submission_not_ready', 'original_media_required_for_review',
    'unsafe_or_failed_media_cannot_be_approved', 'idempotency_key_conflict']);
  return {
    database_error_code: /^(?:[0-9A-Z]{5}|PGRST\d{3})$/.test(error?.code || '') ? error.code : null,
    error_detail: known.has(error?.message) ? error.message
      : ['AbortError', 'TimeoutError'].includes(error?.name) ? 'request_timeout' : 'details_redacted'
  };
}

export function createApprovalService({ backend, reviewer, prepare = runWorker, log = () => {} }) {
  if (typeof reviewer === 'string') reviewer = reviewer.toLowerCase();
  const active = new Map(); let processing = false;
  const emit = (event, fields) => { try { log(event, fields); } catch { /* logging must not change review outcomes */ } };
  const check = async (result, id, stage) => {
    let status = null;
    try { const response = await result; status = response.status || null; if (response.error) throw response.error; return response.data; }
    catch (error) {
      emit('review_verification_failed', { submission_id: id, stage, http_status: status, ...safeReviewError(error) });
      throw new Error('Backend verification unavailable. Refresh and retry.');
    }
  };
  const authorize = async id => {
    if (!uuid.test(reviewer || '')) throw new Error('Reviewer configuration is invalid.');
    const roles = await check(backend.from('app_user_roles').select('role').eq('user_id', reviewer).eq('active', true).is('revoked_at', null).in('role', ['wing_reviewer','wing_admin']), id, 'authorization');
    if (!roles?.length) throw new Error('Reviewer authorization is missing or revoked.');
  };
  const row = async id => {
    const value = await check(backend.from('wing_media_submissions').select('*').eq('id', id).maybeSingle(), id, 'submission_read');
    if (!value) throw new Error('Submission not found.'); return value;
  };
  const object = async (path, id) => {
    const [prefix, name] = [path.slice(0, path.lastIndexOf('/')), path.slice(path.lastIndexOf('/') + 1)];
    const objects = await check(backend.storage.from('wing-submissions').list(prefix, { search: name, limit: 100 }), id, 'derivative_metadata');
    return objects?.some(o => o.name === name && o.id &&
      (o.metadata?.mimetype || o.metadata?.contentType)?.toLowerCase() === 'image/jpeg' && Number(o.metadata?.size) > 0);
  };
  const readiness = async (id, s) => {
    const blocker = await check(backend.rpc('wing_photo_processing_blocker', { p_submission_id: id }), id, 'readiness_blocker');
    if (blocker) throw new Error(`Photo cannot be approved: ${String(blocker).replace(/[^a-z_]/g, '').slice(0, 80)}.`);
    const jobs = await check(backend.from('wing_photo_derivative_jobs').select('*').eq('submission_id', id), id, 'derivative_jobs');
    const legacy = await check(backend.from('wing_processing_jobs').select('status').eq('submission_id', id).eq('job_kind','photo_process'), id, 'legacy_jobs');
    const ready = s.processed_storage_path === `processed/${id}/primary` && s.thumbnail_storage_path === `thumbnails/${id}/preview`
      && [...(jobs || []), ...(legacy || [])].some(j => j.status === 'succeeded')
      && await object(s.processed_storage_path, id) && await object(s.thumbnail_storage_path, id);
    emit('review_readiness_checked', { submission_id: id, stage: 'readiness', ready, job_status: jobs?.[0]?.status || null });
    return { ready, job: jobs?.[0] };
  };
  const completed = async (s, input, key) => {
    if (s.status !== (input.action === 'approve' ? 'approved' : 'rejected') || s.reviewed_by !== reviewer || s.reviewer_notes !== input.reviewerNote.trim()) return false;
    const receipt = await check(backend.from('wing_admin_actions').select('actor_id,action,reason_category,notes')
      .eq('submission_id', s.id).eq('idempotency_key', `mango:${key}`).maybeSingle(), s.id, 'confirmation_receipt');
    return receipt?.actor_id === reviewer && receipt.action === input.action && receipt.reason_category === input.reasonCategory && receipt.notes === input.reviewerNote.trim();
  };
  return {
    progress: id => active.get(id)?.phase || '',
    async review(id, input) {
      validateReview(id, input); id = id.toLowerCase();
      if (active.has(id)) throw new Error('A review is already running for this submission.');
      const operation = { phase: 'Checking review…' }; active.set(id, operation);
      const key = `mango-${crypto.createHash('sha256').update(JSON.stringify([id, reviewer, input.action, input.reasonCategory, input.reviewerNote.trim()])).digest('hex')}`;
      try {
        emit('review_started', { submission_id: id, stage: 'authorization', action: input.action });
        await authorize(id); let s = await row(id);
        if (await completed(s, input, key)) return { status: s.status, reconciled: true };
        if (s.status !== 'in_review') throw new Error('Submission is no longer awaiting review.');
        if (input.action === 'approve' && s.media_type === 'photo') {
          let state = await readiness(id, s);
          if (!state.ready) {
            if (!state.job) throw new Error('Photo preparation job is missing.');
            if (state.job.status === 'claimed' && Date.parse(state.job.lease_expires_at) > Date.now()) throw new Error('Photo preparation is already leased. Retry after it finishes.');
            if (state.job.status === 'retry' && Date.parse(state.job.available_at) > Date.now()) throw new Error('Photo preparation is waiting for its scheduled retry.');
            if (!['pending','retry','claimed'].includes(state.job.status)) throw new Error(preparationFailure(state.job) || 'Photo preparation needs operator attention; existing objects were preserved.');
            if (processing) throw new Error('Another photo is being prepared. Try again shortly.');
            processing = true; operation.phase = 'Preparing photo…';
            let preparationError;
            emit('review_preparation_started', { submission_id: id, stage: 'preparation' });
            try { await prepare(id); } catch (error) { preparationError = error; emit('review_preparation_failed', { submission_id: id, stage: 'preparation', http_status: null, ...safeReviewError(error) }); } finally { processing = false; }
            await authorize(id); s = await row(id);
            if (s.status !== 'in_review') throw new Error('Submission changed during preparation. Refresh the queue.');
            state = await readiness(id, s);
            if (!state.ready) throw new Error(preparationFailure(state.job) || preparationError?.message || 'Photo preparation did not produce verified derivatives.');
          }
          await authorize(id); s = await row(id);
          if (s.status !== 'in_review' || !(await readiness(id, s)).ready) throw new Error('Photo is no longer ready for approval.');
        } else { await authorize(id); s = await row(id); if (s.status !== 'in_review') throw new Error('Submission is no longer awaiting review.'); }
        operation.phase = input.action === 'approve' ? 'Approving…' : 'Rejecting…';
        let rpcStatus = null;
        try {
          emit('review_rpc_started', { submission_id: id, stage: 'moderation_rpc' });
          const { data, error, status } = await backend.rpc('mango_review_wing_submission', { p_submission_id: id, p_action: input.action,
            p_reason_category: input.reasonCategory, p_reviewer_note: input.reviewerNote, p_reviewer_id: reviewer,
            p_idempotency_key: key, p_correlation_id: crypto.randomUUID() }).abortSignal(AbortSignal.timeout(20000));
          rpcStatus = status || null;
          if (error) throw error;
          if (data?.status !== (input.action === 'approve' ? 'approved' : 'rejected')) {
            emit('review_rpc_unexpected_response', { submission_id: id, stage: 'moderation_response', http_status: rpcStatus, response_shape: Array.isArray(data) ? 'array' : data === null ? 'null' : typeof data });
            throw new Error();
          }
          emit('review_confirmed', { submission_id: id, stage: 'moderation_response', http_status: rpcStatus, status: data.status });
          return data;
        } catch (error) {
          emit('review_rpc_failed', { submission_id: id, stage: 'moderation_rpc', http_status: rpcStatus, ...safeReviewError(error) });
          emit('review_confirmation_started', { submission_id: id, stage: 'confirmation' });
          await authorize(id); const current = await row(id);
          if (await completed(current, input, key)) {
            emit('review_confirmed', { submission_id: id, stage: 'confirmation', status: current.status, reconciled: true });
            return { status: current.status, reconciled: true };
          }
          emit('review_not_confirmed', { submission_id: id, stage: 'confirmation', status: current.status });
          if (current.status === 'in_review' && input.action === 'approve' && current.media_type === 'photo' && !(await readiness(id, current)).ready) throw new Error('Photo readiness changed during approval. Refresh before retrying.');
          if (current.status === 'in_review' && error?.message === 'creator_reward_rating_ineligible') throw new Error('Approval was rolled back by the database creator-reward eligibility check. An operator database fix is required before retrying; verified derivatives will be reused.');
          throw new Error(current.status === 'in_review' ? (input.action === 'approve' ? 'Approval was not confirmed. Refresh and retry; prepared media will be reused.' : 'Rejection was not confirmed. Refresh and retry.') : 'Submission changed; review was not confirmed. Refresh the queue.');
        }
      } catch (error) {
        emit('review_failed', { submission_id: id, stage: operation.phase === 'Preparing photo…' ? 'preparation' : operation.phase === 'Checking review…' ? 'preflight' : 'confirmation', http_status: 409, ...safeReviewError(error) });
        throw error;
      } finally { active.delete(id); }
    }
  };
}
