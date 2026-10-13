import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { RestaurantQueue } from './RestaurantQueue.jsx';

const reasons = [['poor_media_quality','Poor media quality'],['inappropriate_content','Inappropriate content'],['not_related_to_rating','Not clearly related to the rating'],['duplicate_submission','Duplicate submission'],['copyright_or_ownership','Copyright or ownership concern'],['restaurant_or_attribution','Restaurant or attribution issue'],['other','Other']];
const tabs = [['pending','Pending Review'],['approved','Approved Queue'],['rejected','Rejected'],['posted','Posted / History']];
const pendingStatuses = new Set(['in_review']);
const visibleIn = (tab, item) => tab === 'pending' ? pendingStatuses.has(item.status) : tab === 'approved' ? item.status === 'approved' && !item.featured_at : tab === 'rejected' ? item.status === 'rejected' : item.status === 'posted' || item.featured_at;
const formatDate = (value) => value ? new Date(value).toLocaleString() : '—';
const jobFor = (item, platform) => item.publishing?.find((job) => job.platform === platform) || {};

export function App() {
  const [items, setItems] = useState([]); const [tab, setTab] = useState('pending'); const [busy, setBusy] = useState(''); const [error, setError] = useState(''); const [toast, setToast] = useState(''); const [rejecting, setRejecting] = useState(null); const [reason, setReason] = useState(''); const [note, setNote] = useState(''); const [refreshed, setRefreshed] = useState(null);
  const [restaurantRefresh,setRestaurantRefresh] = useState(0);
  const actionLock = useRef(false); const [progress, setProgress] = useState('');
  const load = async () => { setError(''); try { const response = await fetch('/api/submissions'); if (!response.ok) throw new Error(); const data = await response.json(); setItems(data.submissions || []); setRefreshed(data.refreshedAt); } catch { setError('Could not reach Mango Habanero. Check the backend terminal and retry.'); } };
  useEffect(() => { load(); }, []); useEffect(() => { if (!toast) return undefined; const timer = setTimeout(() => setToast(''), 3000); return () => clearTimeout(timer); }, [toast]);
  const visible = useMemo(() => items.filter((item) => visibleIn(tab, item)).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)), [items, tab]);
  const act = async (id, url, options = {}) => {
    if (actionLock.current) return;
    actionLock.current = true; setBusy(id); setError(''); setProgress(options.body?.action === 'approve' ? 'Checking review…' : 'Saving…');
    const timer = setInterval(async () => { try { const response = await fetch(`/api/submissions/${id}/progress`); const data = await response.json(); if (data.phase) setProgress(data.phase); } catch { /* final request reports failures */ } }, 400);
    try { const response = await fetch(url, { method: options.method || 'POST', headers: {'Content-Type':'application/json'}, body: options.body ? JSON.stringify(options.body) : undefined }); const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Action failed'); await load(); setToast(options.toast || 'Saved.'); }
    catch (caught) { await load(); setError(caught.message || 'Review response was interrupted. Refresh and retry to reconcile.'); }
    finally { clearInterval(timer); actionLock.current = false; setBusy(''); setProgress(''); }
  };
  const approve = (id) => act(id, `/api/submissions/${id}/review`, { body: { action: 'approve', reasonCategory: 'standard_acceptable', reviewerNote: 'Original photo reviewed and acceptable.' }, toast: 'Photo approved.' });
  const reject = async () => { if (!reason || note.trim().length < 8 || actionLock.current) return; const id = rejecting; setRejecting(null); await act(id, `/api/submissions/${id}/review`, { body: { action: 'reject', reasonCategory: reason, reviewerNote: note }, toast: 'Rejected with an audit reason.' }); setReason(''); setNote(''); };
  const priority = items.find((item) => item.is_publish_priority && item.status === 'approved' && !item.featured_at); const counts = Object.fromEntries(tabs.map(([key]) => [key, items.filter((item) => visibleIn(key, item)).length]));
  return <div className="app"><header><div className="brand-mark">🔥</div><div><p className="eyebrow">BUFFAGO / INTERNAL REVIEW</p><h1>Mango Habanero</h1><p className="subtitle">Approved Queue for Jalapeño social publishing</p></div><button className="refresh" onClick={() => tab === 'restaurants' ? setRestaurantRefresh(value => value + 1) : load()}>↻ Refresh</button></header><main><section className="statusbar"><div><strong>Review desk</strong><span className="muted">Private media · service-authorized previews</span></div><span className="last">{refreshed ? `Last refreshed ${formatDate(refreshed)}` : 'Loading queue…'}</span></section><nav>{tabs.map(([key, label]) => <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>{label}<span>{counts[key]}</span></button>)}<button className={tab === 'restaurants' ? 'active' : ''} onClick={() => setTab('restaurants')}>Pending Restaurants</button></nav>{tab === 'restaurants' && <RestaurantQueue refreshKey={restaurantRefresh} />}{priority && <div className="priority-banner"><span>⚡ Make Next</span><strong>{priority.restaurant?.name || 'Selected submission'}</strong><button onClick={() => act(priority.submission_id, `/api/submissions/${priority.submission_id}/priority`, { method: 'DELETE', toast: 'Make Next cleared.' })}>Clear</button></div>}{error && <div className="error"><strong>Something needs attention.</strong> {error}<button onClick={load}>Retry</button></div>}{tab !== 'restaurants' && !error && !visible.length && <div className="empty"><div>🌶️</div><h2>Nothing in {tabs.find((entry) => entry[0] === tab)?.[1]}</h2><p>New Wing Shots and completed reviews will appear here.</p></div>}<div className="grid">{tab !== 'restaurants' && visible.map((item) => <Card key={item.submission_id} item={item} tab={tab} busy={Boolean(busy)} progress={busy === item.submission_id ? progress : ''} approve={approve} reject={() => { setRejecting(item.submission_id); setReason(''); setNote(''); }} prioritize={() => act(item.submission_id, `/api/submissions/${item.submission_id}/priority`, { toast: 'Marked as the next Jalapeño priority.' })} retry={(id) => act(id, `/api/submissions/${id}/retry`, { toast: 'Retry requested.' })} />)}</div></main>{rejecting && <div className="modal-backdrop"><div className="modal"><h2>Reject Wing Shot</h2><p>Select the reason that best explains the decision.</p><select value={reason} onChange={(event) => setReason(event.target.value)}><option value="">Choose a reason…</option>{reasons.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Required reviewer note (at least 8 characters)" maxLength="2000"/><div className="modal-actions"><button className="quiet" onClick={() => setRejecting(null)}>Cancel</button><button className="danger" disabled={!reason || note.trim().length < 8 || Boolean(busy)} onClick={reject}>Confirm rejection</button></div></div></div>}{toast && <div className="toast">✓ {toast}</div>}</div>;
}

function ProcessingSummary({ item }) { const duplicate = item.processing?.some((job) => job.last_error_code === 'DUPLICATE_MEDIA'); return duplicate ? <div className="publishing-summary"><strong>Status: Duplicate media</strong><span>Exact duplicate detected</span><span>Processing stopped</span><span>No publication occurred</span></div> : null; }
function RatingSummary({ item }) { const rating = item.rating || {}; const fields = [['Overall', rating.overall], ['Crispiness', rating.crispiness], ['Sauce', rating.sauce], ['Meat', rating.meat], ['Spice', rating.spice_level]]; return <div className="rating-summary">{fields.filter(([, value]) => value !== null && value !== undefined && value !== '').map(([label, value]) => <span key={label}>{label}: {value}</span>)}</div>; }
function PublishingSummary({ item }) {
  const instagram = jobFor(item, 'instagram');
  const facebook = jobFor(item, 'facebook');
  const error = item.last_error || instagram.failure_reason || facebook.failure_reason;

  return (
    <div className="publishing-summary">
      <strong>Publishing</strong>
      <span>Claim: {item.claim?.state || item.processing_state || 'unclaimed'}</span>
      <span>Location: {item.location_tag?.result || 'caption fallback'}</span>
      <span>
        Instagram: {instagram.status || 'pending'}
        {instagram.external_permalink && (
          <>
            {' · '}
            <a href={instagram.external_permalink} target="_blank" rel="noreferrer">link</a>
          </>
        )}
      </span>
      <span>
        Facebook: {facebook.status || 'pending'}
        {facebook.external_permalink && (
          <>
            {' · '}
            <a href={facebook.external_permalink} target="_blank" rel="noreferrer">link</a>
          </>
        )}
      </span>
      {error && <span className="warning">Last error: {error}</span>}
    </div>
  );
}

function Card({ item, tab, busy, progress, approve, reject, prioritize, retry }) {
  const [url, setUrl] = useState('');
  const [previewBusy, setPreviewBusy] = useState(false);
  const preview = async () => {
    setPreviewBusy(true);
    try {
      const response = await fetch(`/api/submissions/${item.submission_id}/preview`, { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setUrl(data.url);
    } catch (caught) {
      alert(caught.message);
    } finally {
      setPreviewBusy(false);
    }
  };
  const readyForReview = item.status === 'in_review' && item.original_object_exists;
  const readyToPublish = item.processed_object_exists && item.thumbnail_object_exists && item.processing_succeeded;
  const activeMediaJob = item.processing?.some((job) => ['pending', 'claimed', 'retry'].includes(job.status));
  const media = url
    ? (item.media_type === 'video' ? <video controls autoPlay src={url} /> : <img src={url} alt="Wing Shot preview" />)
    : <button className="preview-placeholder" onClick={preview}>{previewBusy ? 'Generating private preview…' : '▶ Load private preview'}</button>;
  const canRetry = item.last_error || item.publishing?.some((job) => job.status === 'retry');

  return (
    <article className={`card ${item.is_publish_priority ? 'selected' : ''}`}>
      <div className="media">{media}</div>
      <div className="card-body">
        <div className="card-head">
          <div>
            <span className="pill">{item.media_type}</span>
            <span className="state">{item.review_state || item.status}</span>
            <h2>{item.restaurant?.name || 'Unknown restaurant'}</h2>
            <p>{[item.restaurant?.city, item.restaurant?.state_code].filter(Boolean).join(', ') || 'Location unavailable'}</p>
          </div>
          {item.is_publish_priority && <span className="priority-label">⚡ NEXT</span>}
        </div>
        <dl>
          <dt>Submission</dt><dd>{item.submission_id}</dd>
          <dt>Contributor</dt><dd>{item.contributor?.username || item.contributor?.display_name || 'Anonymous Wing Tester'}</dd>
          <dt>Attribution</dt><dd>{item.attribution_preference || 'anonymous'}</dd>
          <dt>Uploaded</dt><dd>{formatDate(item.created_at)}</dd>
        </dl>
        <ProcessingSummary item={item} />
        <RatingSummary item={item} />
        <PublishingSummary item={item} />
        <div className="actions">
          <>
            {tab === 'pending' && (
              <>
                <button className="approve" disabled={busy || !readyForReview} onClick={() => approve(item.submission_id)}>{readyForReview ? (busy ? (progress || 'Review in progress…') : 'Approve') : 'Original media unavailable'}</button>
                <button className="reject" disabled={busy} onClick={reject}>Reject</button>
              </>
            )}
            {tab === 'approved' && (
              <>
                <button className="approve" disabled={busy || item.is_publish_priority || !readyToPublish} onClick={prioritize}>{item.is_publish_priority ? 'Make Next set' : readyToPublish ? 'Make Next' : activeMediaJob ? 'Processing media' : 'Awaiting media preparation'}</button>
                {canRetry && <button className="quiet" disabled={busy} onClick={() => retry(item.submission_id)}>Retry</button>}
              </>
            )}
            {tab === 'rejected' && <span className="muted">Rejected {formatDate(item.rejected_at)}</span>}
            {tab === 'posted' && <span className="muted">Posted {formatDate(item.featured_at)}</span>}
          </>
        </div>
      </div>
    </article>
  );
}
const rootElement = document.getElementById('root');
if (rootElement) createRoot(rootElement).render(<App />);
