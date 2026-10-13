// Conservative legacy recovery: full identity and a bounded submission session.
const normalize = value => typeof value === 'string' ? value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim() : '';
const text = value => typeof value === 'string' && value.trim() ? value.trim() : undefined;
const coordinate = (value,limit) => typeof value === 'number' && Number.isFinite(value) && Math.abs(value)<=limit ? value : undefined;
export function evidenceDetails(row,evidence) {
  const p=evidence?.place || {}, s=evidence?.submittedDetails || {}, a=evidence?.ai || {};
  return {name:text(row.restaurant_name) || text(p.name) || text(a.normalizedName) || '',address:text(row.address) || text(p.address) || text(s.address) || text(a.address) || '',
    city:text(row.city) || text(p.city) || text(s.city) || text(a.city) || '',state_id:row.state_id,
    lat:coordinate(row.lat,90) ?? coordinate(p.lat,90) ?? coordinate(s.lat,90) ?? coordinate(a.lat,90) ?? '',
    lng:coordinate(row.lng,180) ?? coordinate(p.lng,180) ?? coordinate(s.lng,180) ?? coordinate(a.lng,180) ?? ''};
}
export function recoverEvidence(row,logs) {
  if (row.verification_evidence) return {details:evidenceDetails(row,row.verification_evidence),source:'Evidence saved directly on this submission.',issue:null};
  const linked=logs.filter(l=>l.suggestion_id===row.id);
  const time=Date.parse(row.created_at);
  const matches=linked.length ? linked : logs.filter(l=>!l.suggestion_id && row.user_id && l.user_id===row.user_id && l.state_id===row.state_id
    && normalize(row.restaurant_name) && normalize(l.ai_name || l.place_name)===normalize(row.restaurant_name)
    && normalize(row.address) && normalize(l.place_address)===normalize(row.address)
    && Number.isFinite(time) && Date.parse(l.created_at)>=time-30*60*1000 && Date.parse(l.created_at)<=time+2*60*1000);
  const base=evidenceDetails(row,null);
  if (!matches.length) return {details:base,source:'Submitted name, address and state.',issue:'No matching Wingman evidence in the submission window. Verify missing details manually.'};
  const details=matches.map(l=>evidenceDetails(row,{place:{city:l.place_raw_response?.city || l.ai_city,lat:l.place_lat,lng:l.place_lng}}));
  const conflicts=['city','lat','lng'].filter(k=>new Set(details.map(d=>d[k]).filter(v=>v!=='')).size>1);
  if (conflicts.length || matches.some(l=>normalize(l.place_address)!==normalize(row.address))) return {details:base,source:'Submitted name, address and state.',issue:`Conflicting Wingman matches (${conflicts.join(', ') || 'address'}). Verify the location manually; no recovered location was selected.`};
  const merged={...base};for(const d of details) for(const k of ['city','lat','lng']) if(d[k]!=='') merged[k]=d[k];
  return {details:merged,source:`Recovered from ${linked.length ? 'directly linked' : 'matching user, state, normalized name, full address and submission-time'} Wingman logs: ${matches.map(l=>`${l.id} (${l.created_at})`).join(', ')}`,issue:null};
}
