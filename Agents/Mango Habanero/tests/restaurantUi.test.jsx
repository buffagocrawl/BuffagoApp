// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {RestaurantQueue} from '../src/RestaurantQueue.jsx';
let container,root,rows,history,posts;
const row={id:'10000000-0000-4000-8000-000000000001',restaurant_name:'Wing Place',address:'1 Main',state_id:1,created_at:'2026-10-12',verification_evidence:{place:{city:'Hartford',lat:41,lng:-72},ai:{wingsProbability:0.4}}};
const click=async label=>act(async()=>{[...container.querySelectorAll('button')].find(b=>b.textContent===label).click();});
const type=async(el,value)=>act(async()=>{Object.getOwnPropertyDescriptor(el.tagName==='TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));});
beforeEach(async()=>{
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;rows=[row];history=[];posts=[];
 vi.stubGlobal('fetch',vi.fn(async(url,options)=>{
  if(options?.method==='POST') {const body=JSON.parse(options.body);posts.push(body);rows=[];history=[{suggestion_id:row.id,action:body.action,reviewer_note:body.note,destination_suggestions:row,reviewed_at:'2026-10-13'}];return {ok:true,json:async()=>({})};}
  return {ok:true,json:async()=>({restaurants:rows,history})};
 }));
 container=document.createElement('div');document.body.append(container);root=createRoot(container);
 await act(async()=>root.render(<RestaurantQueue/>));
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.unstubAllGlobals();});
it('shows submitted details and available verification evidence',()=>{expect(container.textContent).toContain('Wing Place');expect(container.textContent).toContain('1 Main');expect(container.textContent).toContain('wingsProbability');});
it('labels match and wing scores separately and does not round below-threshold scores to 50%',async()=>{
 rows=[{...row,verification_evidence:{ai:{confidence:.95,wingsProbability:.499}}}];await click('Refresh restaurants');
 expect(container.textContent).toContain('Restaurant-match confidence: 95%');expect(container.textContent).toContain('Wing confidence: 49.9%');
 rows=[{...row,verification_evidence:{ai:{confidence:null,wingsProbability:.5}}}];await click('Refresh restaurants');
 expect(container.textContent).toContain('Restaurant-match confidence: Unknown');expect(container.textContent).toContain('Wing confidence: 50%');expect(posts).toHaveLength(0);
});
it('reject requires reason, focuses note, retains history and refreshes pending',async()=>{
 await click('Reject');const note=container.querySelector('textarea');expect(document.activeElement).toBe(note);
 expect([...container.querySelectorAll('button')].find(b=>b.textContent==='Confirm review').disabled).toBe(true);
 await type(note,'Menu has no wings.');await act(async()=>container.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(posts[0]).toMatchObject({action:'reject',note:'Menu has no wings.',destination:null});expect(container.textContent).toContain('No restaurants awaiting review');expect(container.textContent).toContain('Menu has no wings.');
});
it('approval focuses location and submits the reviewed details',async()=>{
 await click('Approve');expect(document.activeElement).toBe(container.querySelector('input'));
 await type(container.querySelector('textarea'),'Menu confirms chicken wings.');await act(async()=>container.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(posts[0].destination).toEqual({name:'Wing Place',address:'1 Main',city:'Hartford',state_id:1,lat:41,lng:-72});
});
it('a failed review remains visible with the selected submission',async()=>{
 await click('Reject');await type(container.querySelector('textarea'),'Menu has no wings.');
 globalThis.fetch=vi.fn(async()=>({ok:false,json:async()=>({error:'Already reviewed. Refresh.'})}));
 await act(async()=>container.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(container.querySelector('form')).not.toBeNull();expect(container.textContent).toContain('Already reviewed. Refresh.');
});

it('clears a previous load failure after a successful refresh',async()=>{
 globalThis.fetch=vi.fn(async()=>({ok:false,json:async()=>({error:'Temporary queue failure.'})}));
 await click('Refresh restaurants');expect(container.textContent).toContain('Temporary queue failure.');
 globalThis.fetch=vi.fn(async()=>({ok:true,json:async()=>({restaurants:[row],history:[]})}));
 await click('Refresh restaurants');expect(container.textContent).not.toContain('Temporary queue failure.');
 expect(container.textContent).toContain('Wing Place');
});

it('renders malformed client-supplied assessment fields without breaking the queue',async()=>{
 const malformed={...row,verification_evidence:{ai:{reasoning:{untrusted:'object'},wingsProbability:{untrusted:'object'}}}};
 globalThis.fetch=vi.fn(async()=>({ok:true,json:async()=>({restaurants:[malformed],history:[]})}));
 await click('Refresh restaurants');
 expect(container.textContent).toContain('Wing Place');
 expect(container.textContent).toContain('No explanation provided.');
 expect(container.textContent).toContain('Wing confidence: Unknown');
});
it('prefills editable approval reason without saving until explicit confirmation',async()=>{
 await click('Approve');expect(container.querySelector('textarea').value).toBe('Verified restaurant location and confirmed wings on the menu.');expect(posts).toHaveLength(0);
 await type(container.querySelector('textarea'),'Reviewer changed reason.');expect(container.querySelector('textarea').value).toBe('Reviewer changed reason.');
 await click('Cancel');await click('Reject');expect(container.querySelector('textarea').value).toBe('');expect(posts).toHaveLength(0);
});
it('renders recovered FishBurger location and source in editable controls',async()=>{
 const fish={...row,restaurant_name:'FishBurger',address:'884 Oakland Park Ave, Columbus, OH 43224',verification_evidence:null,state_id:35,prefill:{details:{name:'FishBurger',address:'884 Oakland Park Ave, Columbus, OH 43224',city:'Columbus',state_id:35,lat:40.0328092,lng:-82.99093},source:'Recovered from matching Wingman log fixture',issue:null}};
 globalThis.fetch=vi.fn(async()=>({ok:true,json:async()=>({restaurants:[fish],states:[{state_id:35,state_name:'Ohio'}],history:[]})}));await click('Refresh restaurants');await click('Approve');
 expect([...container.querySelectorAll('input')].map(e=>e.value)).toEqual(['FishBurger',fish.address,'Columbus','40.0328092','-82.99093']);expect(container.querySelector('select').value).toBe('35');expect(container.textContent).toContain('Recovered from matching Wingman log fixture');
 await type(container.querySelectorAll('input')[2],'Edited city');expect(container.querySelectorAll('input')[2].value).toBe('Edited city');expect(posts).toHaveLength(0);
});
it('shows ambiguity in the approval form',async()=>{
 globalThis.fetch=vi.fn(async()=>({ok:true,json:async()=>({restaurants:[{...row,prefill:{details:{name:'Wing Place',address:'1 Main',city:'',state_id:1,lat:'',lng:''},source:'Submitted details',issue:'Conflicting Wingman matches. Verify manually.'}}],history:[]})}));await click('Refresh restaurants');await click('Approve');expect(container.querySelector('form').textContent).toContain('Conflicting Wingman matches');expect(posts).toHaveLength(0);
});
