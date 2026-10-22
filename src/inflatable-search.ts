import {inflatableDimensions,inflatableSearchTerms,type InflatableItem} from './inflatable-catalogue.js';
import {catalogueSearchTerms,type CatalogueAppearance} from './catalogue-settings.js';
import {multilingualMatchScore} from './multilingual-search.js';
/** Explicit L×W×H queries compare the full ordered size; text retains typo tolerance. */
export function inflatableMatchScore(item:InflatableItem,query:string,settings:{catalogueAppearance?:Record<string,CatalogueAppearance>}={}){
 const appearance=settings.catalogueAppearance?.['service:'+item.service];
 const match=query.trim().match(/^(\d+(?:[.,]\d+)?)\s*m?\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*m?\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*m?$/i);
 if(match){const size=inflatableDimensions(item,appearance);return size&&[size.length,size.width,size.height].every((value,i)=>value===Number(match[i+1].replace(',','.')))?0:null;}
 return multilingualMatchScore([...inflatableSearchTerms(item,appearance),...catalogueSearchTerms(settings,'service:'+item.service)],query);
}
