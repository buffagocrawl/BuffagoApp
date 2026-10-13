const darkModals=new Set();
const listeners=new Set();
export const currentStatusBarStyle=()=>darkModals.size?'dark-content':'light-content';
export function refreshStatusBarPolicy(){for(const listener of listeners)listener(currentStatusBarStyle());}
export function acquireDarkModalStatusBar(){
  const lease={};darkModals.add(lease);refreshStatusBarPolicy();
  return ()=>{darkModals.delete(lease);refreshStatusBarPolicy();};
}
export function bindStatusBarPolicy({appState,apply,schedule=setTimeout,cancel=clearTimeout}){
  const timers=new Set();const sync=()=>apply(currentStatusBarStyle());
  listeners.add(sync);sync();
  const subscription=appState.addEventListener('change',state=>{
    for(const timer of timers)cancel(timer);timers.clear();
    if(state==='active')for(const delay of [0,150]){
      const timer=schedule(()=>{timers.delete(timer);sync();},delay);timers.add(timer);
    }
  });
  return ()=>{listeners.delete(sync);subscription.remove();for(const timer of timers)cancel(timer);timers.clear();};
}
