import 'dotenv/config';
import express from 'express';
import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

const port = Number(process.env.MANGO_API_PORT || 4318);
const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'MANGO_REVIEWER_ID'];
const missing = required.filter((key) => !process.env[key]);
const log = (event, fields = {}) => console.log(JSON.stringify({ event, agent: 'mango-habanero', ...fields, at: new Date().toISOString() }));
if (missing.length) { log('startup_failed', { missing }); process.exitCode = 1; throw new Error(`Missing required environment variables: ${missing.join(', ')}`); }

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const app = express();
app.use(express.json({ limit: '64kb' }));
const correlation = () => crypto.randomUUID();
const idempotency = (prefix, id) => `${prefix}-${id}-${crypto.randomUUID()}`;
const rpc = async (name, args) => { const { data, error } = await supabase.rpc(name, args); if (error) { log('database_operation_failed', { rpc: name, code: error.code }); throw error; } return data; };

app.get('/api/health', (_req, res) => res.json({ ok: true, agent: 'mango-habanero' }));
app.get('/api/submissions', async (_req, res) => { try { const data = await rpc('mango_list_wing_submissions', {}); log('submission_list_requested', { count: data?.length || 0 }); res.json({ submissions: data || [], refreshedAt: new Date().toISOString() }); } catch (error) { res.status(502).json({ error: 'Unable to load Wing Shots right now.' }); } });
app.post('/api/submissions/:id/preview', async (req, res) => { try { const { data, error } = await supabase.rpc('mango_list_wing_submissions', {}); if (error) throw error; const row = (data || []).find((item) => item.submission_id === req.params.id); if (!row) return res.status(404).json({ error: 'Submission not found.' }); const path = row.processed_storage_path || row.thumbnail_storage_path; if (!path) return res.status(404).json({ error: 'No processed private preview is available yet.' }); const expiresIn = Math.min(300, Math.max(30, Number(process.env.MANGO_PREVIEW_SECONDS || 60))); const signed = await supabase.storage.from('wing-submissions').createSignedUrl(path, expiresIn); if (signed.error) throw signed.error; log('signed_preview_generated', { submission_id: req.params.id, expires_in: expiresIn }); res.set('Cache-Control', 'no-store').json({ url: signed.data.signedUrl, expiresIn }); } catch (error) { log('signed_preview_failed', { submission_id: req.params.id }); res.status(502).json({ error: 'Unable to generate a private preview.' }); } });
app.post('/api/submissions/:id/review', async (req, res) => { const { action, reasonCategory = action === 'approve' ? 'standard_acceptable' : '', reviewerNote = '' } = req.body || {}; try { const data = await rpc('mango_review_wing_submission', { p_submission_id: req.params.id, p_action: action, p_reason_category: reasonCategory, p_reviewer_note: reviewerNote, p_reviewer_id: process.env.MANGO_REVIEWER_ID, p_idempotency_key: idempotency(`review-${action}`, req.params.id), p_correlation_id: correlation() }); log(action === 'approve' ? 'submission_approved' : 'submission_rejected', { submission_id: req.params.id }); res.json(data); } catch (error) { log('review_failed', { submission_id: req.params.id, action, code: error.code }); res.status(409).json({ error: error.message?.includes('reason') ? 'A rejection reason is required.' : 'Review action could not be completed.' }); } });
app.post('/api/submissions/:id/priority', async (req, res) => { try { const data = await rpc('mango_set_wing_priority', { p_submission_id: req.params.id, p_reviewer_id: process.env.MANGO_REVIEWER_ID, p_idempotency_key: idempotency('priority', req.params.id), p_correlation_id: correlation() }); log('priority_changed', { submission_id: req.params.id, action: 'set' }); res.json(data); } catch (error) { log('priority_change_failed', { submission_id: req.params.id }); res.status(409).json({ error: 'Only an approved, unposted submission can be prioritized.' }); } });
app.delete('/api/submissions/:id/priority', async (req, res) => { try { const data = await rpc('mango_clear_wing_priority', { p_submission_id: req.params.id, p_reviewer_id: process.env.MANGO_REVIEWER_ID, p_idempotency_key: idempotency('clear-priority', req.params.id), p_correlation_id: correlation() }); log('priority_changed', { submission_id: req.params.id, action: 'clear' }); res.json(data); } catch (error) { log('priority_change_failed', { submission_id: req.params.id, action: 'clear' }); res.status(409).json({ error: 'Priority could not be cleared.' }); } });
app.listen(port, '127.0.0.1', () => log('startup_succeeded', { port, bind: '127.0.0.1' }));
