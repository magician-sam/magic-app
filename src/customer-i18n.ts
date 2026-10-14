import { customerLanguages, type CustomerLanguage, hasCustomerCopy, translateCustomerCopy, localeForCustomer, formatCustomerDateText } from './customer-language.js';
export { customerLanguages };
export type { CustomerLanguage };
export const languageStorageKey = 'magic-app:customer-language:v1';
let language: CustomerLanguage = 'en';
let enabled = false;
export function customerLanguage() { return language; }
export function customerLocale() { return localeForCustomer(language); }
export function formatCustomerDate(value: string) {
  return formatCustomerDateText(value,language);
}
export function setCustomerLanguage(value: string) {
  if (!customerLanguages.includes(value as CustomerLanguage)) return;
  language = value as CustomerLanguage;
}
export function enableCustomerTranslations(value = true) { enabled = value; }
export function t(value: string): string { return enabled ? translateCustomerCopy(value,language) : value; }
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const decode = (s: string) => s.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'");
export function copy(input: unknown): string {
  const value = String(input ?? "");
  if (!enabled || !hasCustomerCopy(value)) return escape(value);
  return `<span class="customer-copy" data-customer-copy="${escape(value)}">${escape(t(value))}</span>`;
}
export function dateCopy(value: string) { return `<time data-customer-date="${escape(value)}" datetime="${escape(value)}">${escape(formatCustomerDate(value))}</time>`; }
/** Translate source-owned HTML only. Interpolations, URLs, values and identifiers
 * are opaque. No DOM text replacement and no translation of customer content. */
export function h(parts: TemplateStringsArray | string, ...values: unknown[]): string {
  if (!enabled) return typeof parts === 'string' ? parts : parts.reduce((s, part, i) => s + part + (i < values.length ? String(values[i] ?? '') : ''), '');
  const literals = typeof parts === 'string' ? [parts] : [...parts];
  const marker = '\uE000';
  let source = literals.map((part, i) => part + (i < values.length ? `${marker}${i}\uE001` : '')).join('');
  function text(s: string) {
    return s.split(/(\uE000\d+\uE001)/g).map(piece => piece.includes(marker) ? piece : copy(decode(piece))).join('');
  }
  source = source.replace(/(^|>)([^<>]*)(?=<|$)/g, (_, start: string, content: string) => !start && /^["'=]/.test(content) ? content : start + text(content));
  source = source.replace(/(^|\s)(aria-label|placeholder|title|alt)="([^"]*)"/g, (_, prefix: string, name: string, content: string) => {
    const localized=content.split(/(\uE000\d+\uE001)/g).map(piece=>piece.includes(marker)?piece:escape(t(decode(piece)))).join('');
    return content.includes(marker) ? `${prefix}${name}="${localized}"` : `${prefix}${name}="${localized}" data-customer-${name}="${content}"`;
  });
  const rendered = source.replace(/\uE000(\d+)\uE001/g, (_, i: string) => String(values[Number(i)] ?? ''));
  return rendered.replace(/<option([^>]*)>([\s\S]*?)<\/option>/g, (whole, attrs: string, content: string) => {
    const segments: Array<{key?: string; raw?: string}> = [];
    let cursor=0;
    const pattern=/<span class="customer-copy" data-customer-copy="([^"]*)">([^<]*)<\/span>/g;
    for (const match of content.matchAll(pattern)) {
      if(match.index!>cursor)segments.push({raw:decode(content.slice(cursor,match.index))});
      segments.push({key:decode(match[1])});cursor=match.index!+match[0].length;
    }
    if(!segments.length)return whole;
    if(cursor<content.length)segments.push({raw:decode(content.slice(cursor))});
    return `<option${attrs} data-customer-option-parts="${escape(JSON.stringify(segments))}">${segments.map(part=>escape(part.key!==undefined?t(part.key):part.raw??'')).join('')}</option>`;
  });
}

export function installCustomerLanguageSelector() {
  enableCustomerTranslations();
  try { setCustomerLanguage(localStorage.getItem(languageStorageKey) ?? 'en'); } catch { /* Device storage is optional. */ }
  const apply = () => {
    document.documentElement.lang = language;
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
  };
  apply();
  const sourceTitle=document.title;
  const localizeTitle=()=> { document.title=sourceTitle.split(' · ').map(t).join(' · '); };
  localizeTitle();document.addEventListener('customerlanguagechange',localizeTitle);
  const bar = document.createElement('nav'); bar.className = 'customer-language-bar'; bar.setAttribute('aria-label','English / Français / العربية');
  const label = document.createElement('label'); label.htmlFor = 'customer-language'; label.textContent = '🌐';
  const select = document.createElement('select'); select.id = 'customer-language'; select.setAttribute('aria-label','English / Français / العربية');
  for (const [value, name] of [['en','English'],['fr','Français'],['ar','العربية']]) {
    const option = document.createElement('option'); option.value = value; option.textContent = name; select.append(option);
  }
  select.value = language; bar.append(label, select); document.body.prepend(bar);
  select.addEventListener('change', () => changeLanguage(select.value));
}

export function setCopy(node: Element, value: string) { node.setAttribute('data-customer-text',value); node.textContent=t(value); }

export function customerError(value: string): string {
  if(!enabled)return value;
  const direct=t(value);if(direct!==value)return direct;
  if(!/^[a-zA-Z][\w.]*: /.test(value))return value;
  const labels: Record<string,string>={name:'Your name',phone:'Phone / WhatsApp with country code',email:'Email (optional)',username:'Username',password:'Password',date:'Event date',time:'Event start time',location:'Venue / location',children:'Number of children',childAges:'Children’s ages',audience:'Number of guests',age:'Main audience age'};
  return value.split('; ').map(issue=>{
    const [,key,message]=issue.match(/^([\w.]+): (.*)$/)??[];
    const label=t(Object.hasOwn(labels,key)?labels[key]:'Please check this field.');
    const hint=/email/i.test(message??'')?'Enter a valid email address.':/phone/i.test(message??'')?'Enter a phone number with 7–16 digits':'Please check this field.';
    return label+': '+t(hint);
  }).join(' ');
}

export function changeLanguage(value: string) {
  setCustomerLanguage(value);
  try { localStorage.setItem(languageStorageKey,language); } catch { /* Optional storage. */ }
  document.documentElement.lang=language;document.documentElement.dir=language==='ar'?'rtl':'ltr';
  document.querySelectorAll<HTMLSelectElement>('[data-customer-language], #customer-language').forEach(select => { select.value=language; });
  document.querySelectorAll<HTMLElement>('[data-customer-copy]').forEach(node => { node.textContent=t(node.dataset.customerCopy!); });
  for (const attr of ['aria-label','placeholder','title','alt']) document.querySelectorAll<HTMLElement>(`[data-customer-${attr}]`).forEach(node=>node.setAttribute(attr,t(node.getAttribute(`data-customer-${attr}`)!)));
  document.querySelectorAll<HTMLElement>('[data-customer-text]').forEach(node=> { node.textContent=t(node.dataset.customerText!); });
  document.querySelectorAll<HTMLOptionElement>('option[data-customer-option-parts]').forEach(node=> {
    const parts=JSON.parse(node.dataset.customerOptionParts!) as Array<{key?:string;raw?:string}>;
    node.textContent=parts.map(part=>part.key!==undefined?t(part.key):part.raw??'').join('');
  });
  document.querySelectorAll<HTMLElement>('[data-customer-date]').forEach(node=> { node.textContent=formatCustomerDate(node.dataset.customerDate!); });
  document.querySelectorAll<HTMLOptionElement>('option[data-customer-value]').forEach(node=> { node.value=t(node.dataset.customerValue!); });
  document.querySelectorAll<HTMLElement>('[data-customer-quantity]').forEach(node=> { node.setAttribute('aria-label',t('Quantity:')+' '+t(node.dataset.customerQuantity!)); });
  document.dispatchEvent(new Event('customerlanguagechange'));
}
export function dialogLanguageControl() {
  const fragment=document.createDocumentFragment();if(!enabled)return fragment;
  const bar=document.createElement('div');bar.className='dialog-language';
  const select=document.createElement('select');select.dataset.customerLanguage='';select.setAttribute('aria-label','English / Français / العربية');
  for(const [value,name]of [['en','English'],['fr','Français'],['ar','العربية']]){const option=document.createElement('option');option.value=value;option.textContent=name;select.append(option);}
  select.value=language;select.addEventListener('change',()=>changeLanguage(select.value));bar.append(select);fragment.append(bar);return fragment;
}
