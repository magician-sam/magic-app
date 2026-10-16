import { h, t } from './customer-i18n.js';
import { filterMapPlaces, validCoordinates, type VenueMapPlace, type MapBounds } from './venue-map-data.js';
import type { createVenueMap } from './venue-map-runtime.js';

type Runtime=ReturnType<typeof createVenueMap>;
let stylesheet:Promise<void>|undefined;
function mapStyles() {
  return stylesheet??=new Promise<void>((resolve,reject)=>{
    const link=document.createElement('link');link.rel='stylesheet';link.href='/vendor/leaflet/leaflet.css?v=20261016-map-1';
    link.onload=()=>resolve();link.onerror=()=>{stylesheet=undefined;link.remove();reject(new Error('Map styles unavailable'));};document.head.append(link);
  });
}
export function mountVenueMap(section:HTMLElement,open:(id:string)=>void,signal:AbortSignal) {
  const search=section.querySelector('.mp-venue-search')!;
  const shell=document.createElement('div');shell.className='venue-browser';
  shell.innerHTML=h('<div class="venue-browser-toolbar"><div class="venue-view-switch" role="group" aria-label="Browse places"><button type="button" data-venue-view="list" aria-pressed="true">List</button><button type="button" data-venue-view="map" aria-pressed="false">Map</button></div><div class="venue-map-filters"><label>Place type<select data-map-kind><option value="all">All places</option><option value="playground">Playgrounds</option><option value="venue">Venues</option></select></label><label>Published price (USD)<select data-map-price><option value="">Any price</option><option value="25">Up to $25</option><option value="50">Up to $50</option><option value="100">Up to $100</option></select></label></div></div><div class="venue-map-panel" hidden><div class="venue-map-actions"><button type="button" class="outline small" data-search-map hidden>Search this area</button><button type="button" class="link small" data-reset-map>Show all pins</button></div><p data-map-message role="status"></p><div class="venue-map-canvas" role="region" aria-label="Map of playgrounds and venues" tabindex="0"></div><p class="venue-map-error" role="status" hidden>Map details couldn’t load. You can still use List view.</p><p class="venue-map-unpinned" hidden>Places without a supplied pin remain in List view.</p></div><p class="venue-price-note" hidden>Some places have prices on request. Choose Any price to see them.</p>');
  search.after(shell);
  const panel=shell.querySelector<HTMLElement>('.venue-map-panel')!;
  const summary=document.createElement('p');summary.className='venue-result-summary';summary.setAttribute('role','status');shell.append(summary);
  const canvas=shell.querySelector<HTMLElement>('.venue-map-canvas')!;
  const error=shell.querySelector<HTMLElement>('.venue-map-error')!;
  const areaButton=shell.querySelector<HTMLButtonElement>('[data-search-map]')!;
  const kind=shell.querySelector<HTMLSelectElement>('[data-map-kind]')!;
  const price=shell.querySelector<HTMLSelectElement>('[data-map-price]')!;
  let places:VenueMapPlace[]=[],runtime:Runtime|undefined,bounds:MapBounds|undefined,mapMode=false,loading=false;
  const labels=()=>({explore:t('Explore place'),price:t('From'),request:t('Price on request'),zoomIn:t('Zoom in'),zoomOut:t('Zoom out')});
  function paint(fit=false) {
    const filtered=filterMapPlaces(places,kind.value,price.value?Number(price.value):null,mapMode?bounds:undefined);
    const pinned=filtered.filter(place=>validCoordinates(place.coordinates));
    summary.textContent=filtered.length?`${filtered.length} · ${t('places to explore')}`:t('No places match these filters. Try another filter.');
    const visibleIds=new Set(filtered.map(place=>place.id));
    for(const card of section.querySelectorAll<HTMLElement>('.mp-directory-results .playtown-card,.mp-directory-results .mp-partner-card')) {
      const slug=card.querySelector<HTMLElement>('[data-mp-profile]')?.dataset.mpProfile;
      const id=card.classList.contains('playtown-card')?'playtown':'partner:'+slug;
      card.hidden=mapMode||!visibleIds.has(id);
    }
    section.classList.toggle('venue-map-mode',mapMode);
    shell.querySelector<HTMLElement>('.venue-price-note')!.hidden=!price.value||!places.some(place=>place.minimumPriceUsd===undefined);
    shell.querySelector<HTMLElement>('.venue-map-unpinned')!.hidden=!filtered.some(place=>!validCoordinates(place.coordinates));
    const message=shell.querySelector<HTMLElement>('[data-map-message]')!;
    message.textContent=loading?t('Opening the map…'):pinned.length?`${pinned.length} · ${t('places on this map')}`:t('No places in this map area. Move the map or show all pins.');
    if(runtime&&mapMode&&section.getClientRects().length)runtime.setPlaces(pinned,labels(),fit);
  }
  async function showMap() {
    if(runtime){runtime.resize();paint();return;}
    if(loading)return;
    loading=true;paint();error.hidden=true;
    try {
      const path='/venue-map.js?v=20261016-map-1';
      const [module]=await Promise.all([import(path) as Promise<typeof import('./venue-map-runtime.js')>,mapStyles()]);
      if(signal.aborted||!section.isConnected)return;
      runtime=module.createVenueMap(canvas,open,()=>{areaButton.hidden=false;},()=>{error.hidden=false;});
      loading=false;runtime.resize();paint(true);areaButton.hidden=true;
    } catch {loading=false;error.hidden=false;paint();}
  }
  for(const button of shell.querySelectorAll<HTMLButtonElement>('[data-venue-view]'))button.addEventListener('click',()=>{
    mapMode=button.dataset.venueView==='map';panel.hidden=!mapMode;
    shell.querySelectorAll<HTMLElement>('[data-venue-view]').forEach(node=>node.setAttribute('aria-pressed',String((node.dataset.venueView==='map')===mapMode)));
    if(mapMode)void showMap();paint();
  },{signal});
  for(const select of [kind,price])select.addEventListener('change',()=>{bounds=undefined;paint(true);areaButton.hidden=true;},{signal});
  areaButton.addEventListener('click',()=>{if(runtime){bounds=runtime.bounds();paint();areaButton.hidden=true;}},{signal});
  shell.querySelector('[data-reset-map]')!.addEventListener('click',()=>{bounds=undefined;paint(true);areaButton.hidden=true;},{signal});
  document.addEventListener('customerlanguagechange',()=>paint(),{signal});
  window.addEventListener('hashchange',()=>requestAnimationFrame(()=>{if(mapMode&&section.getClientRects().length){runtime?.resize();paint();}}),{signal});
  signal.addEventListener('abort',()=>runtime?.remove(),{once:true});
  return {
    setPlaces(values:VenueMapPlace[]){places=values;bounds=undefined;paint(true);areaButton.hidden=true;},
    resetFilters(){kind.value='all';price.value='';bounds=undefined;paint(true);},
  };
}
