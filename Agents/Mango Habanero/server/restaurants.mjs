import { recoverEvidence } from './restaurantEvidence.mjs';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function reviewInput(id, reviewer, body) {
  if (!uuid.test(id || '') || !uuid.test(reviewer || '')) throw new Error('Invalid restaurant or reviewer identifier.');
  if (!['approve', 'reject'].includes(body.action) || typeof body.note !== 'string' || body.note.trim().length < 8 || body.note.length > 2000) throw new Error('Choose an action and enter an 8–2000 character review reason.');
  let destination = null;
  if (body.action === 'approve') {
    const d = body.destination || {};
    if (!['name','address','city'].every(k => typeof d[k] === 'string' && d[k].trim().length && d[k].length <= 500)
      || !Number.isInteger(d.state_id) || d.state_id < 1 || typeof d.lat !== 'number' || !Number.isFinite(d.lat) || Math.abs(d.lat) > 90
      || typeof d.lng !== 'number' || !Number.isFinite(d.lng) || Math.abs(d.lng) > 180) throw new Error('Approval requires a name, address, city, state, latitude and longitude.');
    destination = { name: d.name.trim(), address: d.address.trim(), city: d.city.trim(), state_id: d.state_id, lat: d.lat, lng: d.lng };
  }
  return { p_suggestion_id: id, p_reviewer_id: reviewer, p_action: body.action, p_note: body.note.trim(), p_destination: destination };
}
const errors = {
  restaurant_reviewer_required: 'The configured reviewer does not have an active review role.',
  restaurant_already_reviewed: 'This restaurant was already reviewed. Refresh the queue.',
  restaurant_suggestion_not_found: 'Restaurant submission not found.',
  restaurant_location_required: 'Complete and verify the restaurant location before approval.',
  restaurant_match_ambiguous: 'An existing restaurant may match this submission. Resolve the address conflict before approving.',
  restaurant_state_mismatch: 'The reviewed state must match the submitted state.',
};
export function createRestaurantService({ backend, reviewer }) {
  const checked = async operation => { const { data, error } = await operation; if (error) throw new Error(errors[error.message] || 'Restaurant review could not be confirmed. Refresh and retry.'); return data; };
  const authorize = async () => {
    if (!uuid.test(reviewer || '')) throw new Error('Invalid reviewer configuration.');
    const roles = await checked(backend.from('app_user_roles').select('role').eq('user_id',reviewer).eq('active',true).is('revoked_at',null).in('role',['wing_reviewer','wing_admin']));
    if (!roles?.length) throw new Error(errors.restaurant_reviewer_required);
  };
  return {
    async list() {
      await authorize();
      const restaurants = [];
      for (let offset = 0; ; offset += 500) {
        const page = await checked(backend.from('mango_pending_restaurants').select('*').order('created_at',{ ascending:true }).order('id',{ ascending:true }).range(offset,offset+499));
        restaurants.push(...(page || []));
        if (!page || page.length < 500) break;
      }
      const states = await checked(backend.from('states').select('state_id,state_name,state_code'));
      const history = await checked(backend.from('restaurant_suggestion_reviews').select('*,destination_suggestions(restaurant_name,address,state_id)').order('reviewed_at',{ ascending:false }).limit(50));
      for (const row of restaurants) {
        try {
          let logs=[];
          if (!row.verification_evidence) {
            const columns='id,user_id,state_id,suggestion_id,ai_name,ai_city,place_name,place_address,place_lat,place_lng,place_raw_response,created_at';
            logs=await checked(backend.from('wingman_intake_logs').select(columns).eq('suggestion_id',row.id));
            const time=Date.parse(row.created_at);
            if (!logs?.length && row.user_id && row.address && Number.isFinite(time)) {
              logs=[];
              for(let offset=0;;offset+=500) {
                const page=await checked(backend.from('wingman_intake_logs').select(columns).eq('user_id',row.user_id).eq('state_id',row.state_id)
                  .gte('created_at',new Date(time-30*60*1000).toISOString()).lte('created_at',new Date(time+2*60*1000).toISOString())
                  .order('created_at').order('id').range(offset,offset+499));
                logs.push(...(page || []));if(!page || page.length<500) break;
              }
            }
          }
          row.prefill=recoverEvidence(row,logs || []);
        } catch { row.prefill={...recoverEvidence(row,[]),issue:'Wingman evidence lookup failed. Verify missing details manually.'}; }
      }
      return { restaurants: (restaurants || []).map(row => ({ ...row, state_name: states?.find(state => state.state_id === row.state_id)?.state_name })), states: states || [], history: history || [] };
    },
    async review(id, body) {
      const args = reviewInput(id,reviewer,body);
      await authorize();
      return checked(backend.rpc('mango_review_restaurant', args));
    },
  };
}
