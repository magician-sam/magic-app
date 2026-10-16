import * as L from 'leaflet';
import type { MapBounds, VenueMapPlace } from './venue-map-data.js';

export type MapLabels={explore:string;price:string;request:string;zoomIn:string;zoomOut:string};
export function createVenueMap(element:HTMLElement,open:(id:string)=>void,moved:()=>void,tileError:()=>void) {
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const map=L.map(element,{scrollWheelZoom:false,zoomAnimation:!reduced,fadeAnimation:!reduced,markerZoomAnimation:!reduced,attributionControl:true});
  map.attributionControl.setPrefix(false);
  const tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{
    minZoom:3,maxZoom:19,keepBuffer:1,referrerPolicy:'strict-origin-when-cross-origin',
    attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>',
  }).addTo(map);
  tiles.on('tileerror',tileError);
  const layer=L.layerGroup().addTo(map);
  map.setView([33.8856221,35.4778697],13);
  map.on('moveend',moved);
  // An open popup can otherwise be clipped after a phone rotates.
  map.on('resize',()=>map.closePopup());
  let current:VenueMapPlace[]=[];
  function fit() {
    const points=current.filter(place=>place.coordinates).map(place=>L.latLng(place.coordinates!.latitude,place.coordinates!.longitude));
    if(points.length)map.fitBounds(L.latLngBounds(points),{padding:[45,45],maxZoom:14,animate:false});
  }
  return {
    setPlaces(places:VenueMapPlace[],labels:MapLabels,fitView=false) {
      current=places;layer.clearLayers();
      element.querySelector('.leaflet-control-zoom-in')?.setAttribute('aria-label',labels.zoomIn);
      element.querySelector('.leaflet-control-zoom-out')?.setAttribute('aria-label',labels.zoomOut);
      for(const place of places) {
        if(!place.coordinates)continue;
        const pin=document.createElement('span');pin.className='venue-price-pin';
        pin.textContent=place.minimumPriceUsd!==undefined?`$${place.minimumPriceUsd}+`:'✦';
        const marker=L.marker([place.coordinates.latitude,place.coordinates.longitude],{
          icon:L.divIcon({html:pin,className:'venue-pin',iconSize:[60,38],iconAnchor:[30,38]}),
          title:place.name,alt:place.name,keyboard:true,
        }).addTo(layer);
        marker.getElement()?.setAttribute('aria-label',place.name+(place.minimumPriceUsd!==undefined?`, ${labels.price} $${place.minimumPriceUsd}`:''));
        const popup=document.createElement('div');popup.className='venue-map-popup';
        popup.dir=document.documentElement.dir==='rtl'?'rtl':'ltr';
        if(place.image){const photo=document.createElement('img');photo.src=place.image;photo.alt='';photo.loading='lazy';popup.append(photo);}
        const name=document.createElement('strong');name.textContent=place.name;
        const address=document.createElement('p');address.textContent=place.address;
        const price=document.createElement('small');price.textContent=place.minimumPriceUsd!==undefined?`${labels.price} $${place.minimumPriceUsd}`:labels.request;
        const action=document.createElement('button');action.type='button';action.textContent=labels.explore;action.addEventListener('click',()=>open(place.id));
        popup.append(name,address,price,action);marker.bindPopup(popup,{maxWidth:240,minWidth:190});
      }
      if(fitView)fit();
    },
    bounds():MapBounds {const b=map.getBounds();return {north:b.getNorth(),south:b.getSouth(),east:b.getEast(),west:b.getWest()};},
    fit,
    resize:()=>map.invalidateSize({pan:false}),
    remove:()=>map.remove(),
  };
}
