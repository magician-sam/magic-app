import type {Business} from './models.js';
export const categoryBackgroundKeys=['places','teams','shows','offers','science','styling','capture','music','food','inflatables','food-stations','milestones','keepsakes','schools'] as const;
/** Decorative AI concepts are separate from supplied supplier portfolio photos. */
export function categoryBackground(b:Pick<Business,'catalogueAppearance'>,key:string){
  return b.catalogueAppearance?.['category:'+key]?.cover||
    (categoryBackgroundKeys.some(value=>value===key)?'/category-art/'+key+'-v1.webp':'');
}
