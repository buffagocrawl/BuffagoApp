// Standalone in-memory UI fixture. No dotenv, Supabase client, worker or credentials.
import express from 'express';
import { resolve } from 'node:path';
import { validateReview } from '../server/approval.mjs';
const app = express(); app.use(express.json());
const id = '11111111-1111-4111-8111-111111111111';
const other = '33333333-3333-4333-8333-333333333333';
const items = [id,other].map((submission_id,index) => ({ submission_id, status:'in_review', media_type:'photo', original_object_exists:true,
  original_storage_path:`originals/fixture/${submission_id}/source`, created_at:'2026-10-11T12:00:00Z',
  restaurant:{ name:index ? 'Unrelated fixture photo' : 'Selected fixture photo', city:'Test City',state_code:'NY' }, processing:[] }));
const actions = []; let phase = '';
app.get('/api/submissions', (_req,res) => res.json({ submissions:items, refreshedAt:new Date().toISOString() }));
app.post('/api/submissions/:id/preview', (_req,res) => res.json({ url:'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400"><rect width="640" height="400" fill="#d67b30"/><text x="80" y="200" font-size="36" fill="white">Mock original photo</text></svg>') }));
app.get('/api/submissions/:id/progress', (_req,res) => res.json({ phase }));
app.get('/api/mock-state', (_req,res) => res.json({ actions,items,phase }));
app.post('/api/submissions/:id/review', async (req,res) => {
  try { validateReview(req.params.id,req.body); } catch(error) { return res.status(409).json({ error:error.message }); }
  const item = items.find(i => i.submission_id === req.params.id);
  if (!item || item.status !== 'in_review' || phase) return res.status(409).json({ error:'Already reviewed or busy.' });
  actions.push({ id:req.params.id,...req.body });
  if (req.body.action === 'approve') { phase='Preparing photo…'; await new Promise(r => setTimeout(r,2500)); phase='Approving…'; await new Promise(r => setTimeout(r,1500)); }
  item.status = req.body.action === 'approve' ? 'approved' : 'rejected'; phase=''; res.json({ status:item.status });
});
app.use(express.static(resolve(import.meta.dirname,'../dist')));
app.listen(4327,'127.0.0.1',() => console.log('ISOLATED Mango UI fixture: http://127.0.0.1:4327 (no production access)'));
