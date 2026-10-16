import { customerTranslations } from './customer-translations.js';

/** Pure customer language core for browser and future native clients.
 * It has no storage, DOM, authentication or booking-rule dependency. */
export const customerLanguages = ['en','fr','ar'] as const;
export type CustomerLanguage = typeof customerLanguages[number];
const patterns=Object.keys(customerTranslations).filter(key=>key.includes('{count}')).map(key=>({key,pattern:new RegExp('^'+key.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace('\\{count\\}','(\\d+)')+'$')}));
function resolve(value: string) {
  if(Object.hasOwn(customerTranslations,value))return {key:value,count:''};
  for(const {key,pattern} of patterns){const match=value.match(pattern);if(match)return {key,count:match[1]};}
  return null;
}
export function hasCustomerCopy(value: string) { return !!resolve(value.trim()); }
export function translateCustomerCopy(value: string,language: CustomerLanguage): string {
  const leading=value.match(/^\s*/)?.[0]??'',trailing=value.match(/\s*$/)?.[0]??'',resolved=resolve(value.trim());
  const translated=resolved?customerTranslations[resolved.key][language]:undefined;
  return translated!==undefined?leading+translated.replace('{count}',resolved!.count)+trailing:value;
}
export function localeForCustomer(language: CustomerLanguage) { return language==='ar'?'ar-LB':language==='fr'?'fr-FR':'en-GB'; }
export function formatCustomerDateText(value: string,language: CustomerLanguage) {
  return new Date(value+'T12:00:00').toLocaleDateString(localeForCustomer(language),{day:'numeric',month:'short',year:'numeric'});
}
