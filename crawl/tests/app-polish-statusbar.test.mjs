import test from 'node:test';
import assert from 'node:assert/strict';
import { acquireDarkModalStatusBar, currentStatusBarStyle, refreshStatusBarPolicy, bindStatusBarPolicy } from '../lib/statusBarPolicy.js';
test('modal leases restore the app style and foreground retries read current state, never stale dark styles',()=>{
 const styles=[],timers=[];let change,removed=false;
 const unbind=bindStatusBarPolicy({appState:{addEventListener:(_,fn)=>{change=fn;return {remove:()=>removed=true};}},apply:style=>styles.push(style),schedule:(fn,delay)=>{timers.push({fn,delay});return timers.length-1;},cancel:id=>timers[id].cancelled=true});
 assert.equal(styles.at(-1),'light-content');const first=acquireDarkModalStatusBar(),second=acquireDarkModalStatusBar();
 assert.equal(currentStatusBarStyle(),'dark-content');first();assert.equal(styles.at(-1),'dark-content');
 change('active');assert.deepEqual(timers.map(t=>t.delay),[0,150]);second();timers.forEach(t=>t.fn());
 assert.equal(styles.at(-1),'light-content');const third=acquireDarkModalStatusBar();refreshStatusBarPolicy();assert.equal(styles.at(-1),'dark-content');
 change('active');change('background');assert.ok(timers.slice(-2).every(t=>t.cancelled));third();unbind();assert.ok(removed);
 const count=styles.length;refreshStatusBarPolicy();assert.equal(styles.length,count);
});
