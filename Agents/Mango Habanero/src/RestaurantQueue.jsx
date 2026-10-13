import { evidenceDetails } from '../server/restaurantEvidence.mjs';
import React, { useEffect, useRef, useState } from 'react';

const confidenceLabel = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1 ? `${Math.floor((value + Number.EPSILON)*10000)/100}%` : 'Unknown';

export function RestaurantQueue({ refreshKey = 0 }) {
  const [states,setStates] = useState([]);
  const [rows,setRows] = useState([]), [history,setHistory] = useState([]), [error,setError] = useState(''), [loading,setLoading] = useState(true);
  const [selected,setSelected] = useState(null), [note,setNote] = useState(''), [details,setDetails] = useState({}), [busy,setBusy] = useState(false);
  const lock = useRef(false), firstInput = useRef(null);
  const load = async () => {
    setLoading(true); setError('');
    try { const r = await fetch('/api/restaurants'); const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Unable to load restaurants.'); setStates(d.states || []); setRows(d.restaurants || []); setHistory(d.history || []); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { if (!lock.current) load(); }, [refreshKey]);
  useEffect(() => { if (selected) firstInput.current?.focus(); }, [selected]);
  const open = (row,action) => {
    setError(''); setNote(action === 'approve' ? 'Verified restaurant location and confirmed wings on the menu.' : '');
    setDetails(row.prefill?.details || evidenceDetails(row,row.verification_evidence));
    setSelected({ row,action });
  };
  const submit = async e => {
    e.preventDefault(); if (lock.current) return; lock.current=true; setBusy(true); setError('');
    try {
      const destination = selected.action === 'approve' ? { ...details, lat:details.lat === '' ? null : Number(details.lat), lng:details.lng === '' ? null : Number(details.lng) } : null;
      const r = await fetch(`/api/restaurants/${selected.row.id}/review`, { method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:selected.action,note,destination}) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Review could not be confirmed.');
      setSelected(null); await load();
    } catch(e) { setError(e.message); }
    finally { lock.current=false; setBusy(false); }
  };
  return <section aria-label="Restaurant review">
    <div className="statusbar"><strong>Pending Restaurants · {loading ? 'Loading…' : rows.length}</strong><button disabled={busy || loading} onClick={() => {setError('');load();}}>Refresh restaurants</button></div>
    {error && <div className="error" role="alert">{error}</div>}
    {!loading && !rows.length && !error && <div className="empty"><h2>No restaurants awaiting review</h2></div>}
    <div className="grid">{rows.map(row => <article className="card restaurant-card" key={row.id}><div className="card-body">
      <h2>{row.restaurant_name}</h2><dl><dt>Address</dt><dd>{row.address || 'Not provided'}</dd><dt>State</dt><dd>{row.state_name || (row.state_id ?? 'Not provided')}</dd><dt>Submitted</dt><dd>{new Date(row.created_at).toLocaleString()}</dd></dl>
      {row.verification_evidence?.ai && <div className="advisory"><strong>Wingman assessment</strong><p>{typeof row.verification_evidence.ai.reasoning === 'string' ? row.verification_evidence.ai.reasoning : 'No explanation provided.'}</p><p>Restaurant-match confidence: {confidenceLabel(row.verification_evidence.ai.confidence)}</p><p>Wing confidence: {confidenceLabel(row.verification_evidence.ai.wingsProbability)}</p></div>}
      <details><summary>Verification evidence</summary>{row.verification_evidence ? <><p className="warning">Wingman’s findings are advisory. Confirm the location and wings before approving.</p><pre className="restaurant-evidence">{JSON.stringify(row.verification_evidence,null,2)}</pre></> : <p className="warning">{row.prefill?.source || 'No linked evidence was saved for this older submission.'} {row.prefill?.issue || 'Confirm the recovered location and menu before approval.'}</p>}</details>
      <div className="actions"><button className="approve" disabled={busy} onClick={() => open(row,'approve')}>Approve</button><button className="reject" disabled={busy} onClick={() => open(row,'reject')}>Reject</button></div>
    </div></article>)}</div>
    {!!history.length && <details className="restaurant-history"><summary>Recent restaurant reviews</summary>{history.map(r => <article key={r.suggestion_id}><strong>{r.destination_suggestions?.restaurant_name} · {r.action === 'approve' ? 'Approved' : 'Rejected'}</strong><p>{r.reviewer_note}</p><small>{new Date(r.reviewed_at).toLocaleString()} | Reviewer {r.reviewer_id}{r.destination_id ? ` · Restaurant ${r.destination_id}` : ''}</small></article>)}</details>}
    {selected && <div className="modal-backdrop"><form className="modal restaurant-modal" role="dialog" aria-modal="true" aria-labelledby="restaurant-review-title" onSubmit={submit}>
      <h2 id="restaurant-review-title">{selected.action === 'approve' ? 'Approve' : 'Reject'} {selected.row.restaurant_name}</h2>
      {selected.action === 'approve' && <><p>{selected.row.prefill?.source || 'Evidence saved directly on this submission.'}</p>{selected.row.prefill?.issue && <p role="alert" className="warning">{selected.row.prefill.issue}</p>}<label>State<select required value={details.state_id ?? ''} onChange={e => setDetails({...details,state_id:Number(e.target.value)})}>{(states.length ? states : [{state_id:selected.row.state_id,state_name:selected.row.state_name || String(selected.row.state_id)}]).map(s => <option key={s.state_id} value={s.state_id}>{s.state_name}</option>)}</select></label><p>Confirm these details and that the menu includes wings. An existing matching restaurant will be reused.</p>{['name','address','city','lat','lng'].map((key,i) => <label key={key}>{({name:'Restaurant name',address:'Address',city:'City',lat:'Latitude',lng:'Longitude'})[key]}<input ref={i===0 ? firstInput : undefined} required type={['lat','lng'].includes(key) ? 'number' : 'text'} step="any" min={key==='lat' ? -90 : key==='lng' ? -180 : undefined} max={key==='lat' ? 90 : key==='lng' ? 180 : undefined} maxLength={500} value={details[key]} onChange={e => setDetails({...details,[key]:e.target.value})}/></label>)}</>}
      <label>Review reason<textarea ref={selected.action === 'reject' ? firstInput : undefined} required minLength={8} maxLength={2000} value={note} onChange={e => setNote(e.target.value)} placeholder="Required reason (8–2000 characters)"/></label>
      {error && <p role="alert" className="error">{error}</p>}
      <div className="modal-actions"><button type="button" className="quiet" disabled={busy} onClick={() => setSelected(null)}>Cancel</button><button className={selected.action==='approve' ? 'approve' : 'danger'} disabled={busy || note.trim().length<8}>{busy ? 'Saving…' : 'Confirm review'}</button></div>
    </form></div>}
  </section>;
}
