import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { createApprovalService, workerInvocation, validateReview, runWorker, localRequestsOnly } from '../server/approval.mjs';

const id = '11111111-1111-4111-8111-111111111111';
const reviewer = '22222222-2222-4222-8222-222222222222';
const input = { action: 'approve', reasonCategory: 'standard_acceptable', reviewerNote: 'Original photo reviewed and acceptable.' };
function fixture(ready = false) {
  const s = { id, status: 'in_review', media_type: 'photo', reviewed_by: null, reviewer_notes: null };
  const job = { status: 'pending', available_at: new Date(0).toISOString() };
  const state = { authorized: true, blocker: null, objects: new Set(), calls: [], approvalError: false, ambiguous: false };
  const makeReady = () => { s.processed_storage_path = `processed/${id}/primary`; s.thumbnail_storage_path = `thumbnails/${id}/preview`; state.objects.add(s.processed_storage_path); state.objects.add(s.thumbnail_storage_path); job.status = 'succeeded'; };
  if (ready) makeReady();
  const backend = {
    from(table) {
      const filters = []; const query = {
        select() { return query; }, eq(k, v) { filters.push([k,v]); return query; }, is() { return query; }, in() { return query; }, maybeSingle() { return query; },
        then(resolve) { state.calls.push({ table, filters }); return Promise.resolve({ data: table === 'app_user_roles' ? (state.authorized ? [{ role: 'wing_reviewer' }] : []) : table === 'wing_media_submissions' ? s : table === 'wing_photo_derivative_jobs' ? [job] : table === 'wing_admin_actions' ? state.receipt : [], error: null }).then(resolve); }
      }; return query;
    },
    storage: { from: () => ({ list: (prefix, { search }) => Promise.resolve({ data: state.objects.has(`${prefix}/${search}`) ? [{ name: search, id: 'object', metadata: { mimetype: 'image/jpeg', size: 100 } }] : [], error: null }) }) },
    rpc(name, args) {
      if (name === 'wing_photo_processing_blocker') return Promise.resolve({ data: state.blocker, error: null });
      state.calls.push({ name, args });
      return { abortSignal: async () => {
        if (state.approvalError) return { error: { message: 'secret backend details' } };
        s.status = args.p_action === 'approve' ? 'approved' : 'rejected'; s.reviewed_by = reviewer; s.reviewer_notes = args.p_reviewer_note.trim();
        state.receipt = { actor_id: reviewer, action: args.p_action, reason_category: args.p_reason_category, notes: args.p_reviewer_note.trim() };
        if (state.ambiguous) throw new Error('timeout secret');
        return { data: { status: s.status }, error: null };
      } };
    }
  };
  const prepare = vi.fn(async target => { expect(target).toBe(id); makeReady(); });
  return { s, job, state, prepare, makeReady, service: createApprovalService({ backend, reviewer, prepare }) };
}
const approvals = f => f.state.calls.filter(c => c.name === 'mango_review_wing_submission');
describe('selected photo approval', () => {
  it('ready photos skip the worker and preserve reviewer inputs', async () => { const f = fixture(true); await f.service.review(id, input); expect(f.prepare).not.toHaveBeenCalled(); expect(approvals(f)[0].args).toMatchObject({ p_submission_id: id, p_reviewer_id: reviewer, p_reviewer_note: input.reviewerNote }); });
  it('pending preparation is scoped, verified, then approved', async () => { const f = fixture(); await f.service.review(id, input); expect(f.prepare).toHaveBeenCalledTimes(1); expect(approvals(f)).toHaveLength(1); expect(f.state.calls.filter(c => c.table && c.table !== 'app_user_roles').every(c => c.filters.some(([k,v]) => ['id','submission_id'].includes(k) && v === id))).toBe(true); });
  it('preparation failure never approves', async () => { const f = fixture(); f.prepare.mockRejectedValue(new Error('Safe preparation failure.')); await expect(f.service.review(id,input)).rejects.toThrow('Safe preparation failure'); expect(approvals(f)).toHaveLength(0); });
  it('succeeded jobs with missing objects are not ready or reprocessed', async () => { const f = fixture(true); f.state.objects.clear(); await expect(f.service.review(id,input)).rejects.toThrow('operator attention'); expect(f.prepare).not.toHaveBeenCalled(); expect(approvals(f)).toHaveLength(0); });
  it.each(['claimed','retry'])('respects %s leases/retry timing', async status => { const f = fixture(); f.job.status = status; f.job.available_at = f.job.lease_expires_at = new Date(Date.now()+60000).toISOString(); await expect(f.service.review(id,input)).rejects.toThrow(status === 'claimed' ? 'leased' : 'scheduled retry'); expect(f.prepare).not.toHaveBeenCalled(); });
  it('locks concurrent requests before the first asynchronous authorization', async () => { const f = fixture(); let finish; f.prepare.mockImplementation(() => new Promise(resolve => { finish = () => { f.makeReady(); resolve(); }; })); const first = f.service.review(id,input); await vi.waitFor(() => expect(f.service.progress(id)).toBe('Preparing photo…')); await expect(f.service.review(id,input)).rejects.toThrow('already running'); finish(); await first; expect(approvals(f)).toHaveLength(1); });
  it('processing success followed by approval failure reuses media', async () => { const f = fixture(); f.state.approvalError = true; await expect(f.service.review(id,input)).rejects.toThrow('not confirmed'); f.state.approvalError = false; await f.service.review(id,input); expect(f.prepare).toHaveBeenCalledTimes(1); expect(approvals(f)[0].args.p_idempotency_key).toBe(approvals(f)[1].args.p_idempotency_key); });
  it('reconciles an ambiguous approval and prevents another moderation effect', async () => { const f = fixture(true); f.state.ambiguous = true; expect(await f.service.review(id,input)).toMatchObject({ status: 'approved', reconciled: true }); await f.service.review(id,input); expect(approvals(f)).toHaveLength(1); });
  it('rechecks readiness after a worker timeout with completed settlement', async () => { const f = fixture(); f.prepare.mockImplementation(async () => { f.makeReady(); throw new Error('timed out'); }); await f.service.review(id,input); expect(approvals(f)).toHaveLength(1); });
  it('worker timeout without settlement prevents approval', async () => { const f = fixture(); f.prepare.mockRejectedValue(new Error('Photo preparation timed out.')); await expect(f.service.review(id,input)).rejects.toThrow('timed out'); expect(approvals(f)).toHaveLength(0); });
  it.each(['rejected','withdrawn','cancelled'])('concurrent %s prevents approval', async status => { const f = fixture(); f.prepare.mockImplementation(async () => { f.makeReady(); f.s.status = status; }); await expect(f.service.review(id,input)).rejects.toThrow('changed'); expect(approvals(f)).toHaveLength(0); });
  it.each(['blocker','authorization'])('rechecks %s after preparation', async kind => { const f = fixture(); f.prepare.mockImplementation(async () => { f.makeReady(); if (kind === 'blocker') f.state.blocker = 'consent_required'; else f.state.authorized = false; }); await expect(f.service.review(id,input)).rejects.toThrow(kind === 'blocker' ? 'consent_required' : 'authorization'); expect(approvals(f)).toHaveLength(0); });
  it('unauthorized reviewers never prepare or approve', async () => { const f = fixture(); f.state.authorized = false; await expect(f.service.review(id,input)).rejects.toThrow('authorization'); expect(f.prepare).not.toHaveBeenCalled(); });
  it('rejection requires notes and is independent of preparation', async () => { const f = fixture(); const reject = { ...input, action:'reject', reasonCategory:'poor_media_quality' }; await expect(f.service.review(id,{...reject,reviewerNote:'short'})).rejects.toThrow('8–2000'); expect(f.state.calls).toHaveLength(0); await f.service.review(id,reject); expect(f.prepare).not.toHaveBeenCalled(); expect(approvals(f)[0].args.p_action).toBe('reject'); });
  it('construction and progress reads do not process anything', () => { const f = fixture(); expect(f.service.progress(id)).toBe(''); expect(f.state.calls).toHaveLength(0); expect(f.prepare).not.toHaveBeenCalled(); });
});
describe('safe worker invocation', () => {
  const env = { MANGO_PYTHON_EXECUTABLE: 'C:/trusted/python.exe', SUPABASE_URL: 'https://example.invalid', SUPABASE_SERVICE_ROLE_KEY: 'server-secret', WING_MODERATION_PROVIDER_MODE: 'http', PYTHONPATH: 'untrusted', SOCIAL_TOKEN: 'social-secret' };
  it('uses a fixed script, argument array, explicit scope and isolated credentials', () => { const call = workerInvocation(id,env); expect(call.args.slice(1)).toEqual(['--photo-once','--photo-submission-id',id,'--photo-review-only']); expect(call.options.shell).toBe(false); expect(JSON.stringify(call.args)).not.toContain('secret'); expect(call.options.env).toMatchObject({ SUPABASE_SERVICE_ROLE_KEY:'server-secret', WING_MODERATION_PROVIDER_MODE:'manual-review', WING_PROCESSING_ENVIRONMENT:'production', WING_PROCESSING_ALLOW_TEST_PROVIDER:'false' }); expect(call.options.env).not.toHaveProperty('SOCIAL_TOKEN'); expect(call.options.env).not.toHaveProperty('PYTHONPATH'); });
  it('rejects invalid IDs and missing configuration', () => { expect(() => workerInvocation('anything; --drain 100',env)).toThrow('Invalid'); expect(() => validateReview('bad', input)).toThrow('Invalid'); expect(() => workerInvocation(id,{})).toThrow('MANGO_PYTHON'); });
  it('bounds execution and discards potentially sensitive child output', async () => { vi.useFakeTimers(); const child = Object.assign(new EventEmitter(), { stdout: new EventEmitter(), stderr: new EventEmitter(), kill: vi.fn(() => child.emit('close',null)) }); const result = runWorker(id,env,() => child); const assertion = expect(result).rejects.toThrow('timed out'); child.stderr.emit('data',Buffer.from('server-secret')); await vi.advanceTimersByTimeAsync(120000); await assertion; expect(child.kill).toHaveBeenCalledOnce(); vi.useRealTimers(); });
  it('kills an output flood without returning any child text', async () => { const child = Object.assign(new EventEmitter(), { stdout: new EventEmitter(), stderr: new EventEmitter(), kill: vi.fn(() => child.emit('close',null)) }); const result = runWorker(id,env,() => child); const assertion = expect(result).rejects.toThrow('output limit'); child.stdout.emit('data',Buffer.alloc(65537)); await assertion; expect(child.kill).toHaveBeenCalledOnce(); });
});

describe('localhost and origin protection', () => {
  it.each([
    [{ host: '127.0.0.1:4317', origin:'http://127.0.0.1:4317', 'sec-fetch-site':'same-origin' }, 'POST', true],
    [{ host: '127.0.0.1:4318' }, 'GET', true],
    [{ host: 'evil.example:4318', origin:'http://evil.example:4318' }, 'POST', false],
    [{ host: '127.0.0.1:4318', origin:'https://evil.example' }, 'POST', false],
    [{ host: '127.0.0.1:4318' }, 'POST', false],
    [{ host: '127.0.0.1:4318', origin:'http://127.0.0.1:4317' }, 'POST', false],
    [{ host: '127.0.0.1:4318', 'sec-fetch-site':'cross-site' }, 'GET', false]
  ])('checks host and same origin: %j %s', (headers, method, expected) => {
    const res = { status: vi.fn(() => res), json: vi.fn(), set: vi.fn() }; const next = vi.fn();
    localRequestsOnly(4318)({ headers, method },res,next); expect(next).toHaveBeenCalledTimes(expected ? 1 : 0); if (!expected) expect(res.status).toHaveBeenCalledWith(403);
  });
});
