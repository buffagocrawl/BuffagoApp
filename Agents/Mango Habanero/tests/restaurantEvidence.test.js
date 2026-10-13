import {it,expect} from 'vitest';
import {recoverEvidence} from '../server/restaurantEvidence.mjs';
const row={id:'suggestion',user_id:'user',state_id:35,restaurant_name:'FishBurger',address:'884 Oakland Park Ave, Columbus, OH 43224',created_at:'2025-01-01T12:00:00Z',verification_evidence:null};
const log={id:'log',user_id:'user',state_id:35,ai_name:'fishburger',place_address:row.address,ai_city:'Columbus',place_lat:40.0328092,place_lng:-82.99093,created_at:'2025-01-01T11:59:00Z'};
it('recovers older FishBurger with two addresses without taking the latest log',()=>{const r=recoverEvidence(row,[log,{...log,id:'other',place_address:'123 Other Road',created_at:row.created_at}]);expect(r.details).toMatchObject({city:'Columbus',lat:40.0328092,lng:-82.99093});expect(r.source).not.toContain('other');});
it('requires every identity dimension and submission time',()=>{for(const change of [{user_id:'other'},{state_id:1},{ai_name:'other'},{place_address:'884 Oakland Park Ave'},{created_at:'2025-01-02'}]) expect(recoverEvidence(row,[{...log,...change}]).details.city).toBe('');});
it('surfaces conflicting logs',()=>{const r=recoverEvidence(row,[log,{...log,id:'conflict',place_lat:41}]);expect(r.issue).toContain('Conflicting');expect(r.details.lat).toBe('');});
it('prefers directly saved evidence and linked logs',()=>{expect(recoverEvidence({...row,verification_evidence:{place:{city:'Direct'}}},[log]).details.city).toBe('Direct');expect(recoverEvidence(row,[log,{...log,suggestion_id:row.id,ai_city:'Linked'}]).details.city).toBe('Linked');});
it('reports missing evidence and handles incomplete consistent matches',()=>{expect(recoverEvidence(row,[]).issue).toContain('No matching');expect(recoverEvidence(row,[{...log,place_lat:null},log]).details.lat).toBe(log.place_lat);});
