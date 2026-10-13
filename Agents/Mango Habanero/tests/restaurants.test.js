import { it,expect,vi } from 'vitest';
import { createRestaurantService,reviewInput } from '../server/restaurants.mjs';
const id='10000000-0000-4000-8000-000000000001',reviewer='10000000-0000-4000-8000-000000000002';
const valid={action:'approve',note:'Menu confirms wings.',destination:{name:' Wings ',address:'1 Main',city:'Hartford',state_id:1,lat:41,lng:-72}};
it('validates identifiers, actions, notes and full location before any backend writes',()=>{
 expect(reviewInput(id,reviewer,valid).p_destination.name).toBe('Wings');
 for(const body of [{...valid,note:'short'},{...valid,action:'invalid'},{...valid,destination:{...valid.destination,lat:null}},{...valid,destination:{...valid.destination,lng:181}},{...valid,destination:{...valid.destination,state_id:1.2}}]) expect(()=>reviewInput(id,reviewer,body)).toThrow();
 expect(()=>reviewInput('../other',reviewer,valid)).toThrow();
 expect(reviewInput(id,reviewer,{action:'reject',note:'No wings on menu.',destination:valid.destination}).p_destination).toBeNull();
});
function backend(roles=[{role:'wing_reviewer'}], rpcError=null) {
 const chain=table=>{ const c={}; for(const key of ['select','eq','is','in','order','limit','range']) c[key]=()=>c;
 c.then=resolve=>resolve({data:table==='app_user_roles' ? roles : [],error:null}); return c; };
 return {from:vi.fn(chain),rpc:vi.fn(async()=>({data:{action:'approve'},error:rpcError}))};
}
it('rejects unauthorized reviewer before listing or moderating',async()=>{
 const b=backend([]),s=createRestaurantService({backend:b,reviewer});
 await expect(s.list()).rejects.toThrow('active review role');await expect(s.review(id,valid)).rejects.toThrow('active review role');expect(b.rpc).not.toHaveBeenCalled();
});
it('lists the same pending view used by count and returns review history',async()=>{
 const b=backend(),s=createRestaurantService({backend:b,reviewer});
 expect(await s.list()).toEqual({restaurants:[],states:[],history:[]});expect(b.from).toHaveBeenCalledWith('mango_pending_restaurants');
});
it('uses only the transactional RPC and configured reviewer',async()=>{
 const b=backend(),s=createRestaurantService({backend:b,reviewer});await s.review(id,{...valid,reviewer:'spoofed'});
 expect(b.rpc).toHaveBeenCalledWith('mango_review_restaurant',reviewInput(id,reviewer,valid));
});
it('reports a conflict without exposing database internals',async()=>{
 const b=backend(undefined,{message:'restaurant_already_reviewed'});await expect(createRestaurantService({backend:b,reviewer}).review(id,valid)).rejects.toThrow('already reviewed');
 const other=backend(undefined,{message:'secret SQL details'});await expect(createRestaurantService({backend:other,reviewer}).review(id,valid)).rejects.toThrow('could not be confirmed');
});
