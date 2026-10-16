import type { PublicPartner } from './marketplace-public.js';
import { playtown } from './playtown.js';

export type MapBounds = { north:number; south:number; east:number; west:number };
export type VenueMapPlace = {
  id:string; name:string; address:string; kind:'playground'|'venue'; image?:string;
  coordinates?:{latitude:number;longitude:number}; minimumPriceUsd?:number;
};
export function validCoordinates(value: VenueMapPlace['coordinates']): boolean {
  return !!value&&Number.isFinite(value.latitude)&&Number.isFinite(value.longitude)
    &&Math.abs(value.latitude)<=90&&Math.abs(value.longitude)<=180;
}
export function placeInBounds(place:VenueMapPlace,bounds:MapBounds) {
  if(!validCoordinates(place.coordinates))return false;
  const {latitude,longitude}=place.coordinates!;
  if(latitude<bounds.south||latitude>bounds.north)return false;
  if(bounds.east-bounds.west>=360)return true;
  const wrap=(value:number)=>((value+180)%360+360)%360-180;
  const west=wrap(bounds.west),east=wrap(bounds.east);
  return west<=east?longitude>=west&&longitude<=east:longitude>=west||longitude<=east;
}
/** Consume approved public projections only; never geocode an unpublished address. */
export function venueMapPlaces(partners:readonly PublicPartner[],includePlaytown:boolean):VenueMapPlace[] {
  const result:VenueMapPlace[]=includePlaytown?[{
    id:'playtown',name:playtown.name,address:playtown.address,kind:'playground',
    image:'/playgrounds/playtown/play-2.jpg',coordinates:playtown.coordinates,
    minimumPriceUsd:Math.min(...playtown.passes.map(pass=>pass.usd)),
  }]:[];
  for(const partner of partners) {
    if(partner.kind!=='venue_operator')continue;
    const location=partner.location;
    const coordinates=location?.coordinates;
    result.push({id:'partner:'+partner.slug,name:partner.name,
      address:location?[...new Set([location.area,location.city,location.address].filter(Boolean))].join(', '):'',
      kind:/playground|aire.{0,10}jeux|ملاعب|ملعب/i.test(partner.categories.join(' '))?'playground':'venue',
      image:partner.media?.find(media=>media.kind==='photo')?.url,
      ...(validCoordinates(coordinates)?{coordinates}:{}),
    });
  }
  return [...new Map(result.map(place=>[place.id,place])).values()];
}
export function filterMapPlaces(places:readonly VenueMapPlace[],kind:string,maximumPrice:number|null,bounds?:MapBounds) {
  return places.filter(place=>(kind==='all'||place.kind===kind)
    &&(maximumPrice===null||(place.minimumPriceUsd!==undefined&&place.minimumPriceUsd<=maximumPrice))
    &&(!bounds||placeInBounds(place,bounds)));
}
