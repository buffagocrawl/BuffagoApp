// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { App } from '../src/main.jsx';

let root, container, items, reviews, finishReview, phase;
const selected = '11111111-1111-4111-8111-111111111111';
const other = '33333333-3333-4333-8333-333333333333';
const response = data => ({ ok:true, json:async () => data });
const buttons = label => [...container.querySelectorAll('button')].filter(b => b.textContent === label);
const click = async button => act(async () => { button.dispatchEvent(new MouseEvent('click',{ bubbles:true })); });
beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true; vi.useFakeTimers();
  items = [selected,other].map(submission_id => ({ submission_id, status:'in_review', original_object_exists:true, media_type:'photo', restaurant:{ name:submission_id === selected ? 'Selected fixture' : 'Unrelated fixture' }, created_at:'2026-10-11T12:00:00Z' }));
  reviews = []; phase='';
  vi.stubGlobal('fetch',vi.fn(async (url,options) => {
    if (url.endsWith('/progress')) return response({ phase });
    if (url.endsWith('/preview')) return response({ url:'data:image/png;base64,fixture' });
    if (url.endsWith('/review')) {
      const body = JSON.parse(options.body); reviews.push({ url, body });
      return new Promise(resolve => { finishReview = (status, error) => {
        if (!error) items = items.map(i => i.submission_id === selected ? { ...i,status } : i);
        phase=''; resolve(error ? { ok:false,json:async () => ({ error }) } : response({ status }));
      }; });
    }
    return response({ submissions:items.map(i => ({ ...i })), refreshedAt:'2026-10-11T12:00:00Z' });
  }));
  vi.spyOn(window,'prompt').mockImplementation(() => { throw new Error('Approval must not prompt'); });
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
  await act(async () => root.render(<App />));
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

it('one click shows scoped progress, blocks double clicks, refreshes and leaves the other submission pending', async () => {
  expect(reviews).toHaveLength(0); expect(fetch.mock.calls.some(([url]) => url.endsWith('/review'))).toBe(false);
  await click(buttons('▶ Load private preview')[0]);
  expect(container.querySelector('img').alt).toBe('Wing Shot preview');
  const approve = buttons('Approve')[0];
  await act(async () => { approve.dispatchEvent(new MouseEvent('click',{ bubbles:true })); approve.dispatchEvent(new MouseEvent('click',{ bubbles:true })); });
  expect(reviews).toHaveLength(1); expect(reviews[0]).toMatchObject({ url:`/api/submissions/${selected}/review`,body:{ action:'approve',reasonCategory:'standard_acceptable',reviewerNote:'Original photo reviewed and acceptable.' } });
  expect([...container.querySelectorAll('.approve,.reject')].every(b => b.disabled)).toBe(true);
  phase='Preparing photo…'; await act(async () => vi.advanceTimersByTimeAsync(450)); expect(container.textContent).toContain('Preparing photo…');
  phase='Approving…'; await act(async () => vi.advanceTimersByTimeAsync(450)); expect(container.textContent).toContain('Approving…');
  await act(async () => finishReview('approved'));
  expect(container.textContent).toContain('Photo approved.'); expect(container.textContent).not.toContain('Selected fixture'); expect(container.textContent).toContain('Unrelated fixture');
  expect(buttons('Approve')).toHaveLength(1); expect(buttons('Approve')[0].disabled).toBe(false);
});

it('shows a safe preparation error without a success toast and enables explicit retry', async () => {
  await click(buttons('Approve')[0]); await act(async () => finishReview(null,'Existing derivative is incompatible; it was preserved.'));
  expect(container.textContent).toContain('Existing derivative is incompatible'); expect(container.querySelector('.toast')).toBe(null);
  expect(buttons('Approve')[0].disabled).toBe(false);
});

it('rejection requires eight trimmed characters and never calls approval/preparation', async () => {
  await click(buttons('Reject')[0]); const select = container.querySelector('select');
  await act(async () => { select.value='poor_media_quality'; select.dispatchEvent(new Event('change',{ bubbles:true })); });
  const confirm = buttons('Confirm rejection')[0]; expect(confirm.disabled).toBe(true);
  const textarea = container.querySelector('textarea'); expect(textarea.placeholder).toContain('Required');
  const enter = async value => act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(textarea,value); textarea.dispatchEvent(new Event('input',{ bubbles:true })); });
  await enter(' short '); expect(confirm.disabled).toBe(true); await enter('Photo is too blurry.'); expect(confirm.disabled).toBe(false);
  await click(confirm); expect(reviews).toHaveLength(1); expect(reviews[0].body).toMatchObject({ action:'reject',reasonCategory:'poor_media_quality',reviewerNote:'Photo is too blurry.' });
  await act(async () => finishReview('rejected')); expect(container.textContent).toContain('Rejected with an audit reason.');
});
