import type {Business,Catalog} from './models.js';
import {copy,h,customerLanguage,setCopy,t} from './customer-i18n.js';
import {catalogueNameCopy} from './catalogue-copy.js';
import {inflatableMatchScore} from './inflatable-search.js';
import {inflatableDimensions,inflatableGroups,type InflatableItem} from './inflatable-catalogue.js';
const e=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function inflatableSizeBlock(item:InflatableItem,business:Pick<Business,'catalogueAppearance'>,detail=false){
 const size=inflatableDimensions(item,business.catalogueAppearance?.['service:'+item.service]);
 return `<div class="inflatable-size">${size?`<dl>${(['length','width','height'] as const).map((key,i)=>`<div><dt>${copy(['Length','Width','Height'][i])}</dt><dd dir="ltr">${size[key]} <span>${copy('m')}</span></dd></div>`).join('')}</dl>`:h('<p class="inflatable-size-pending">Size to confirm</p>')}${detail?h('<p class="inflatable-clearance">Equipment dimensions only. Extra safety space, access, supervision and utilities must be confirmed before booking.</p>'):''}</div>`;
}
export function inflatableCard(item:InflatableItem,business:Pick<Business,'catalogueAppearance'|'currency'>,photos:{url:string;caption:string}[],price:NonNullable<Catalog['publicPrices']>[number]|undefined,selected:boolean){
 const money=price&&price.priceMode!=='quote'?`${price.priceMode==='from'?copy('From')+' ':''}${e(new Intl.NumberFormat('en-US',{style:'currency',currency:business.currency}).format(price.price/100))}${price.taxApplied?' · '+copy('VAT included'):''}`:copy('Price Upon Request');
 return `<article class="show-card inflatable-card" data-guest-name="${e(item.service.toLowerCase())}" data-inflatable-id="${item.id}" data-inflatable-group="${item.group}"><button type="button" class="show-art inflatable-art" data-enquiry-details="${e(item.service)}" aria-label="${e(item.name)}">${photos[0]?`<img src="${e(photos[0].url)}" alt="${e(item.name)}" loading="lazy" decoding="async">`:'<span aria-hidden="true">✦</span>'}<span class="inflatable-photo-open" aria-hidden="true">↗</span></button><div class="show-body"><span class="inflatable-kind">${copy(inflatableGroups[item.group])}</span><h3><button type="button" class="show-title" data-enquiry-details="${e(item.service)}">${catalogueNameCopy(business,'service:'+item.service,item.name)}</button></h3>${inflatableSizeBlock(item,business)}<p class="inflatable-price">${money}</p><div class="inflatable-actions"><button type="button" class="outline" data-enquiry-details="${e(item.service)}">${copy('Details')}</button><button type="button" class="${selected?'secondary':''}" data-add-guest="${e(item.service)}">${copy(selected?'✓ In your event box':'＋ Add to my event')}</button></div></div></article>`;
}
let query='',group='';
/** Independent controls: no shared search value or venue query state. */
export function mountInflatableBrowser(root:HTMLElement,business:Pick<Business,'catalogueAppearance'>,signal:AbortSignal){
 const section=root.querySelector<HTMLElement>('#inflatables'),cards=[...root.querySelectorAll<HTMLElement>('[data-inflatable-id]')];
 if(!section||!cards.length)return ()=>{};
 const tools=document.createElement('div');tools.className='inflatable-tools';
 tools.innerHTML=h('<div class="inflatable-search-heading"><span aria-hidden="true">✦</span><div><h3>Find your next big adventure.</h3><p>Search an attraction, colour or size.</p></div></div>')+`<div class="inflatable-search-controls"><label for="inflatable-query">${copy('Search inflatables')}<input id="inflatable-query" aria-label="${e(t('Search inflatables'))}" type="search" autocomplete="off" placeholder="${e(customerLanguage()==='fr'?'Requin, château, 8 x 5 x 6…':customerLanguage()==='ar'?'قرش، قلعة، 8 x 5 x 6…':'Shark, castle, 8 x 5 x 6…')}"></label><label for="inflatable-type">${copy('Attraction type')}<select id="inflatable-type" aria-label="${e(t('Attraction type'))}"><option value="">${e(t('All attractions'))}</option>${Object.entries(inflatableGroups).map(([key,label])=>`<option value="${key}">${e(t(label))}</option>`).join('')}</select></label><button type="button" class="outline inflatable-clear" aria-label="${e(t('Clear filters'))}">${copy('Clear')}</button></div><p class="inflatable-results" role="status" aria-live="polite"></p>`;
 section.querySelector('h3')?.after(tools);
 const input=tools.querySelector<HTMLInputElement>('input')!,select=tools.querySelector<HTMLSelectElement>('select')!,count=tools.querySelector<HTMLElement>('[role=status]')!;
 input.value=query;select.value=group;
 const empty=document.createElement('div');empty.className='inflatable-empty';empty.hidden=true;empty.innerHTML=h('<h3>No adventures found just yet.</h3><p>Try a shorter name, choose another type or clear the filters.</p>');tools.after(empty);
 let active=false;
 const paint=()=>{
  if(!active)return;
  const scored=cards.map(card=>{const item=inflatableById(card.dataset.inflatableId!);return{card,score:item&&(!group||card.dataset.inflatableGroup===group)?inflatableMatchScore(item,query,business):null};});
  const exact=scored.some(row=>row.score===0);let found=0;
  for(const {card,score}of scored){card.hidden=score===null||(exact&&score!==0);if(!card.hidden)found++;}
  count.innerHTML=copy('{count} attractions'.replace('{count}',String(found)))+(query&&!exact&&found?' · '+copy('Showing close spelling matches.'):'');empty.hidden=found>0;
  setCopy(select.options[0],'All attractions');
  for(const option of [...select.options].slice(1))setCopy(option,inflatableGroups[option.value as keyof typeof inflatableGroups]);
  input.setAttribute('aria-label',t('Search inflatables'));select.setAttribute('aria-label',t('Attraction type'));tools.querySelector('.inflatable-clear')!.setAttribute('aria-label',t('Clear filters'));
  input.placeholder=customerLanguage()==='fr'?'Requin, château, 8 x 5 x 6…':customerLanguage()==='ar'?'قرش، قلعة، 8 x 5 x 6…':'Shark, castle, 8 x 5 x 6…';
 };
 input.addEventListener('input',()=>{query=input.value;paint();},{signal});select.addEventListener('change',()=>{group=select.value;paint();},{signal});
 tools.querySelector('button')!.addEventListener('click',()=>{query='';group='';input.value='';select.value='';paint();input.focus();},{signal});
 input.addEventListener('keydown',ev=>{if(ev.key==='Escape'){query='';input.value='';paint();}if(ev.key==='Enter'){ev.preventDefault();input.blur();}},{signal});
 document.addEventListener('customerlanguagechange',paint,{signal});
 return (next:boolean)=>{const leaving=active&&!next;active=next;tools.hidden=!next;empty.hidden=true;if(leaving){query='';group='';input.value='';select.value='';cards.forEach(card=>card.hidden=false);}if(next)paint();};
}
import {inflatableCatalogue} from './inflatable-catalogue.js';
const byId=new Map(inflatableCatalogue.map(item=>[item.id,item]));
const inflatableById=(id:string)=>byId.get(id);

