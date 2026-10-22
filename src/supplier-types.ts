export const supplierTypes = [
  ['artist', 'Artist & shows', ['shows', 'science']],
  ['venue', 'Playground & venue', ['places']],
  ['agency', 'Entertainment agency', ['teams']],
  ['food', 'Food & cakes', ['food']],
  ['treats', 'Popcorn, Candy & More', ['food-stations']],
  ['decoration', 'Decoration & flowers', ['styling']],
  ['photo', 'Photography & video', ['capture']],
  ['music', 'Music & sound', ['music']],
  ['equipment', 'Inflatables & equipment', ['inflatables']],
  ['gifts', 'Favours & keepsakes', ['keepsakes']],
  ['transport', 'Transport', []],
  ['other', 'Other service — review needed', []],
] as const;
export type SupplierType = typeof supplierTypes[number][0];
export type SupplierService = {id:string;type:SupplierType;name:string;description:string;priceMode:'quote'|'suggested';suggestedFee:number|null;currency:'USD'|'LBP'|'EUR';tax:'unknown'|'included'|'excluded';duration:number|null;notes:string};
export type SupplierPhoto = {id:string;caption:string;permissionNote:string};
export type SupplierOfficeDraft = {
  id:string;name:string;contactName:string;phone:string;email:string;bio:string;area:string;address:string;notes:string;
  types:SupplierType[];status:'draft'|'review'|'archived';services:SupplierService[];photos:SupplierPhoto[];
  revision:number;createdAt:string;updatedAt:string;createdBy:string;updatedBy:string;submissionDigest:string;
  source:'office';legalAcceptance:null;access:'not_activated';publication:'private';
};
export function supplierCategoryKeys(types:readonly SupplierType[]) {
  return [...new Set(types.flatMap(type=>supplierTypes.find(item=>item[0]===type)?.[2]??[]))];
}
