import { readFileSync,writeFileSync,mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { objects } from './prepare-whatsapp-import.mjs';
const monthNames=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
const eventContext=/birthday|bday|party|baptism|wedding|event|show|performance|date of|event date|anniversaire|3id miled|3id milad|عيد ميلاد|حفلة|حفله|عماد|تعميد|عرض|الحفل/iu;
export function dateMentions(text,at){
  const found=[],valid=(year,month,day)=>{const d=`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;return !Number.isNaN(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d?d:'';};
  const add=(token,day,month,year,ambiguous=false)=>{let inferred=!year;if(!year){year=Number(at.slice(0,4));const d=valid(year,month,day);if(d&&d<at.slice(0,10))year++;}const date=valid(year,month,day);if(date)found.push({date,mention:token,yearInferred:inferred,dayMonthAmbiguous:ambiguous});};
  for(const m of text.matchAll(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/g))add(m[0],+m[3],+m[2],+m[1]);
  for(const m of text.matchAll(/\b(\d{1,2})[/.](\d{1,2})(?:[/.]((?:20)?\d{2}))?\b/g))add(m[0],+m[1],+m[2],m[3]?(m[3].length===2?2000+Number(m[3]):+m[3]):undefined,+m[1]<=12&&+m[2]<=12);
  const months='jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';
  for(const m of text.matchAll(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${months})(?:[, ]+(20\\d{2}))?\\b`,'gi')))add(m[0],+m[1],monthNames.indexOf(m[2].slice(0,3).toLowerCase())+1,m[3]?+m[3]:undefined);
  for(const m of text.matchAll(new RegExp(`\\b(${months})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:[, ]+(20\\d{2}))?\\b`,'gi')))add(m[0],+m[2],monthNames.indexOf(m[1].slice(0,3).toLowerCase())+1,m[3]?+m[3]:undefined);
  return found;
}
export function extractEventDates(candidates,messages,today){
  const chats=new Map();for(const c of candidates)for(const id of c.chatIds)chats.set(id,c);
  const rows=new Map();for(const row of messages)if(chats.has(row.chat_id)){const bucket=rows.get(row.chat_id)||[];bucket.push(row);rows.set(row.chat_id,bucket);}
  const byId=new Map();
  for(const [chatId,session]of rows){const c=chats.get(chatId);for(let i=0;i<session.length;i++){
    const row=session[i];if(row.content.length>1200)continue;
    // Restrict to a supported enquiry period. A personal message in the same chat is insufficient.
    const stamp=Date.parse(row.timestamp_local),period=c.history.find(h=>stamp>=Date.parse(h.enquiryDate)-2*86400000&&stamp<=Date.parse(h.lastDiscussed)+21*86400000);if(!period)continue;
    const nearby=session.slice(Math.max(0,i-2),i+3).filter(r=>Math.abs(Date.parse(r.timestamp_local)-stamp)<=2*86400000).map(r=>r.content).join(' ');
    if(!eventContext.test(nearby)||/happy birthday|wholesale|buy \d+ get|join us|entrance fee|forward this/iu.test(row.content))continue;
    const dates=dateMentions(row.content,row.timestamp_local).filter(d=>d.date<today&&Math.abs(Date.parse(d.date)-stamp)<=180*86400000);
    for(const d of dates){const entries=byId.get(c.id)||[];if(!entries.some(e=>e.date===d.date))entries.push({...d,occasion:/birthday|bday|anniversaire|عيد ميلاد|3id milad|3id miled/iu.test(nearby)?'birthday':'event',cancelMentioned:/cancel|لغيت|الغاء|إلغاء/iu.test(nearby),enquiryDate:period.enquiryDate,evidenceId:row.message_id,completionVerified:false});byId.set(c.id,entries);}
  }}
  return [...byId].map(([id,dates])=>({id,dates:dates.slice(0,30)}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const [source,details,folder,today]=process.argv.slice(2);mkdirSync(folder,{recursive:true});const prepared=JSON.parse(readFileSync(details,'utf8')),contacts=extractEventDates(prepared.candidates,objects(readFileSync(source,'utf8')),today);writeFileSync(join(folder,'historical-event-dates.json'),JSON.stringify({sourceHash:prepared.sourceHash,contacts},null,2));console.log(JSON.stringify({contacts:contacts.length,dateCandidates:contacts.reduce((n,c)=>n+c.dates.length,0),supportedCustomers:contacts.filter(c=>prepared.candidates.find(p=>p.id===c.id).qualification==='supported_enquiry').length}));}
