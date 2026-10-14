import { copy, dateCopy, h } from './customer-i18n.js';
const e=(value: string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
/** Known message envelopes translate; stored event names and payment terms
 * remain opaque. Unknown historic wording is preserved verbatim. */
export function noticeTitleView(value: string) {
  const at=value.indexOf(' · ');
  const prefix=at<0?value:value.slice(0,at);
  const known=['Your event is accepted','Your event is confirmed','About your event request','Your event was cancelled','Your event details changed','A new offer from Magic by Sam'];
  if(!known.includes(prefix))return e(value);
  return at<0?copy(value):copy(prefix)+' · '+e(value.slice(at+3));
}
export function noticeBodyView(value: string,kind: string) {
  const known=['Sam has accepted your event and is starting the preparations.','Your event is confirmed. Open your event page for the latest details.','Sam is unable to take this event request. Please contact us if you would like to discuss another date or show.','Your event has been cancelled. Please contact us about any payment or refund.','The details of your event were updated. Please open your event page to review them.','See the latest offer in your account.'];
  if(known.includes(value))return copy(value);
  if(kind!=='confirmed')return e(value);
  const match=value.match(/^Sam has confirmed (.*) for (\d{4}-\d{2}-\d{2}) at (\d{2}:\d{2})\. (.*)Open your private event page for the agreed plan and recorded payments\.$/s);
  if(!match)return e(value);
  const [,name,date,time,rest]=match;
  const payment=rest.startsWith('Payment agreement: ')?copy('Payment agreement:')+' '+e(rest.slice('Payment agreement: '.length)):e(rest);
  return h`<span>${copy('Sam has confirmed')} ${e(name)} ${copy('for')} ${dateCopy(date)} ${copy('at')} ${e(time)}. ${payment}${copy('Open your private event page for the agreed plan and recorded payments.')}</span>`;
}
