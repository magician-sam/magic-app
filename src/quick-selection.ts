import {multilingualMatchScore} from './multilingual-search.js';

export type QuickChoice={key:string;kind:'show'|'service';title:string;group:string;terms:readonly string[];includes?:readonly string[]};
export function quickSelectionMatches(items:readonly QuickChoice[],query:string){
  const scored=items.map(item=>({item,score:multilingualMatchScore([item.title,...item.terms],query)}));
  const exact=scored.some(row=>row.score===0);
  return scored.filter(row=>row.score!==null&&(!exact||row.score===0)).map(row=>row.item);
}

/** Additive and atomic: existing choices are never removed by this shortcut. */
export function planQuickSelection(items:readonly QuickChoice[],existing:readonly string[],requested:readonly string[]):{keys:string[];added:string[];error?:never}|{error:'unavailable'|'overlap'|'limit';keys?:never;added?:never}{
  const available=new Map(items.map(item=>[item.key,item]));
  const keys=[...new Set(existing)],added:string[]=[];
  for(const key of new Set(requested)){
    if(keys.includes(key))continue;
    const item=available.get(key);if(!item)return{error:'unavailable'};
    if(item.kind==='show'){
      const included=item.includes??[key];
      if(keys.some(selected=>{const other=available.get(selected);return other?.kind==='show'&&(other.includes??[other.key]).some(part=>included.includes(part));}))return{error:'overlap'};
    }
    keys.push(key);added.push(key);
  }
  if(keys.filter(key=>(available.get(key)?.kind??(key.startsWith('show:')?'show':'service'))==='show').length>12||keys.filter(key=>(available.get(key)?.kind??(key.startsWith('show:')?'show':'service'))==='service').length>30)return{error:'limit'};
  return{keys,added};
}
