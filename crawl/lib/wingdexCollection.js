// One collection pipeline for Discover, Favorites and Want to Try, before
// FlatList virtualization. Defaults retain the existing Wingdex behavior.
export const WINGDEX_SELECTION_DEFAULTS = Object.freeze({sort:'overall',query:'',selectedTagId:null,locationMode:'radius',radiusMiles:5,stateCodeFilter:null});
const distance = row => row.distanceMi != null && Number.isFinite(Number(row.distanceMi)) ? Number(row.distanceMi) : Infinity;
export function matchesWingdexRestaurant(row, selection, {hasCoordinates=false}={}) {
 const {query='',selectedTagId,locationMode,radiusMiles,stateCodeFilter}=selection;
 if(query.trim() && ![row.name,row.address,row.town,row.stateCode].some(value=>String(value||'').toLowerCase().includes(query.trim().toLowerCase())))return false;
 if(locationMode==='state'&&stateCodeFilter&&row.stateCode!==stateCodeFilter)return false;
 // Unknown distance retains the existing inclusion rule, never treated as zero.
 if(locationMode==='radius'&&hasCoordinates&&Number.isFinite(Number(radiusMiles))&&distance(row)>Number(radiusMiles)&&distance(row)!==Infinity)return false;
 if(selectedTagId==='my'&&!row.ratedByMe)return false;
 if(typeof selectedTagId==='number'&&!(Number(row.countsByTag?.[String(selectedTagId)])>0))return false;
 return true;
}
export function compareWingdexRestaurants(a,b,selection,{pictureCounts={}}={}) {
 if(selection.sort==='nearest')return distance(a)-distance(b);
 if(selection.sort==='photos')return (pictureCounts[String(b.destination_id)]||0)-(pictureCounts[String(a.destination_id)]||0);
 if(selection.sort==='ratings')return (b.count||0)-(a.count||0);
 if(selection.selectedTagId==='my')return (b.myAvgWeight??b.avgWeight??0)-(a.myAvgWeight??a.avgWeight??0);
 if(typeof selection.selectedTagId==='number')return (b.avgWeight??0)-(a.avgWeight??0);
 const aHas=(a.count??0)>0,bHas=(b.count??0)>0;
 if(aHas!==bHas)return aHas?-1:1;
 return aHas?(b.avgWeight??0)-(a.avgWeight??0):distance(a)-distance(b);
}
export function selectWingdexCollection(rows,selection,context={}) {
 return rows.filter(row=>matchesWingdexRestaurant(row,selection,context)).sort((a,b)=>compareWingdexRestaurants(a,b,selection,context));
}
export function wingdexEmptyState(collectionSize,selection) {
 return collectionSize>0&&(selection.query.trim()||selection.selectedTagId!=null||selection.locationMode!=='all')?'filtered':'empty';
}
// Fetch complete collections rather than relying on PostgREST's row cap.
// Callers provide a stable, unique ordering and account/request cancellation.
export async function readAllWingdexRows(createQuery,{isCurrent=()=>true,pageSize=500}={}) {
 const rows=[];
 for(let offset=0;;){
  if(!isCurrent())return {data:[],error:null};
  const result=await createQuery().range(offset,offset+pageSize-1);
  if(result.error)return result;
  const page=result.data||[];
  if(!page.length)return {data:rows,error:null};
  rows.push(...page);
  // Respect a server row cap smaller than the requested page, too.
  offset+=page.length;
 }
}
