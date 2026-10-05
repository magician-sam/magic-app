import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { objects } from './prepare-whatsapp-import.mjs';

// Local-only extraction. Chat text stays in the source CSV, never in the result.
const occasion = /\b(?:birthday|bday|baptism|christening|wedding|school event|kids? party|children'?s party|corporate event|anniversaire|bapteme|baptême|3id miled|3id milad)\b|عيد ميلاد|حفلة|حفله|عيد ابني|عيد بنتي|عماد|تعميد/iu;
const services = /\b(?:magic(?: show)?|magician|science(?: show| lab)?|bubbles?(?: show)?|face paint(?:ing)?|balloon decor(?:ation)?|mascot|characters?|animation show|entertain(?:er|ment))\b|عرض سحر|ساحر|فقاعات|تلوين وجوه|شخصيات/iu;
const enquiry = /\b(?:how much|prices?|pricing|cost|available|availability|book(?:ing)?|interested|looking for|need|want|would like|can you|do you|packages?|quote|rates?|adde(?:h)?|addech|adeh|ade|2addeh|2adeh|bade|baddi|badna|combien|tarif|disponible)\b|قديش|كم سعر|بدي|بدنا|حجز|متوفر|ممكن|اسعار|أسعار/iu;
const customerIntent = /\b(?:my (?:son|daughter|child|kid)|our (?:son|daughter|event|party)|i (?:need|want|would like|am interested)|we (?:need|want|would like)|looking for|can you (?:come|perform)|do you (?:do|have|offer)|bade|baddi|badna|ebne|ebni|bente|benti|mon fils|ma fille)\b|ابني|بنتي|بدنا|بدي/iu;
const structured = /\b(?:event date|date of (?:the )?(?:event|party)|children'?s? ages?|age of (?:the )?kids|how old is|ayya se3a|event location)\b|عمر الولد|عمر الطفل|تاريخ الحفلة/iu;
const supplier = /\b(?:wholesale|qty\s*[=:]|buy \d+ get|we offer|our services|hiring|job vacancy|send (?:me |us )?your cv|router|laserjet|dvr\/nvr|hdd|ups power)\b/iu;
const media = /^(?:Audio|Photo|Video|Location|Sticker|GIF|Document|Contact)$/i;
const unrelated = /\bhappy birthday\b|\b(?:join us|entrance fee|ask for our|our easter packages|our christmas packages|forward this|share this)\b|عقبال|دعاء|انشر/iu;
const names = text => {
  const match = text.match(/\b(?:my name is|i am called|je m'appelle)\s+([\p{L}][\p{L}\p{M}' -]{1,55})(?=[,.!\n]|$)|(?:اسمي|أنا اسمي|انا اسمي)\s+([\p{L}\p{M} ]{2,55})(?=[،.!\n]|$)/u);
  return match ? (match[1] || match[2]).trim() : '';
};
function explicitDates(text) {
  const result = [];
  // Missing years and day/month ambiguity are deliberately NOT resolved.
  for (const match of text.matchAll(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/g)) {
    const value = `${match[1]}-${match[2].padStart(2,'0')}-${match[3].padStart(2,'0')}`;
    if (!Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value) result.push(value);
  }
  for (const match of text.matchAll(/\b(\d{1,2})[/.](\d{1,2})[/.](20\d{2})\b/g)) {
    if (Number(match[1]) <= 12) continue;
    const value = `${match[3]}-${match[2].padStart(2,'0')}-${match[1].padStart(2,'0')}`;
    if (!Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value) result.push(value);
  }
  return [...new Set(result)];
}
function serviceNames(text) {
  const pairs = [['Magic',/\bmagic(?:ian)?\b|ساحر|سحر/iu],['Science',/\bscience\b/iu],['Bubbles',/\bbubbles?\b|فقاعات/iu],['Characters',/\bcharacters?|mascot\b|شخصيات/iu],['Face painting',/face paint|تلوين وجوه/iu],['Animation',/\banimation\b/iu],['Decoration',/balloon decor|\bdecoration\b/iu]];
  return pairs.filter(([,re])=>re.test(text)).map(([name])=>name);
}
function fieldCandidates(rows){
  const dates=new Set(),times=new Set(),venues=new Set(),children=new Set();
  for(const row of rows){const text=row.content;
    for(const m of text.matchAll(/\b(?:\d{1,2}(?:st|nd|rd|th)?\s+(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)|(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+\d{1,2})(?:[, ]+20\d{2})?\b/gi))dates.add(m[0]);
    for(const m of text.matchAll(/\b\d{1,2}[/.]\d{1,2}(?:[/.](?:20)?\d{2})?\b/g))dates.add(m[0]);
    for(const m of text.matchAll(/\b(?:at\s+)?\d{1,2}(?::\d{2}|h\d{0,2})?\s*(?:am|pm)\b|\b\d{1,2}h\d{2}\b/gi))times.add(m[0].replace(/^at\s+/i,''));
    const venue=text.match(/\b(?:location|venue)\s*:\s*([^\n;]{2,80})/i);if(venue)venues.add(venue[1].split(/\b(?:the bday|birthday starts|show starts|time|date)\b/i)[0].trim());
    for(const m of text.matchAll(/\bfor\s+([\p{L}][\p{L}\p{M}' -]{0,35}?)'s birthday\b/gu))children.add(m[1].trim());
    for(const m of text.matchAll(/\bmy (?:son|daughter|child)(?:'s)? name is\s+([\p{L}][\p{L}\p{M}' -]{0,35}?)(?:[,.!\n]|$)/gu))children.add(m[1].trim());
  }
  return {eventDateTextCandidates:[...dates].slice(0,12),timeCandidates:[...times].slice(0,12),venueCandidates:[...venues].filter(Boolean).slice(0,8),childNameCandidates:[...children].slice(0,8)};
}
export function extract(contacts, messages) {
  const groups = new Map(contacts.map(c=>[c.chat_id,{contact:c,messages:[]} ]));
  for (const row of messages) groups.get(row.chat_id)?.messages.push(row);
  const accepted = [], review = [], excluded = [], phones = new Map();
  for (const {contact, messages: rows} of groups.values()) {
    const phone = contact.phone_candidate.replace(/[\s()-]/g,'').replace(/^00/,'+');
    if (!/^\+[1-9]\d{6,14}$/.test(phone)) { excluded.push({chatId:contact.chat_id,reason:'No individual international contact number'}); continue; }
    const useful = rows.filter(r=>r.content.length<=1200 && !media.test(r.content.trim()));
    const clusters = []; let cluster;
    for (const row of useful) {
      const at = Date.parse(row.timestamp_local);
      if (!cluster || at-cluster.last > 21*86400000 || at-cluster.first > 60*86400000) { cluster={rows:[],first:at,last:at};clusters.push(cluster); }
      cluster.rows.push(row);cluster.last=at;
    }
    const history = []; let score = 0, possibleName = '';
    for (const {rows: session} of clusters) {
      const inbound = session.filter(r=>r.direction==='incoming');
      const relevant = session.filter(r=>(occasion.test(r.content)||services.test(r.content))&&!supplier.test(r.content)&&!unrelated.test(r.content));
      const ownerQuestions=session.filter(r=>r.direction==='outgoing' && /age of (?:the )?kids|kids ages?|children.?s? ages?/i.test(r.content)&&/\b(?:date|location|event|birthday)\b/i.test(r.content)&&!supplier.test(r.content));
      if (!relevant.length&&!ownerQuestions.length) continue;
      const qualifying = inbound.filter(r=>!supplier.test(r.content)&&!unrelated.test(r.content) && ((services.test(r.content)&&enquiry.test(r.content)) || (occasion.test(r.content)&&customerIntent.test(r.content))));
      const contextual=session.filter((row,index)=>row.direction==='incoming'&&!supplier.test(row.content)&&!unrelated.test(row.content)&&enquiry.test(row.content)&&session.slice(index+1,index+9).some(reply=>reply.direction==='outgoing'&&services.test(reply.content)&&/\b(?:price|cost|package|my performance|my show)\b|\d\s*\$/i.test(reply.content)&&!supplier.test(reply.content)&&Date.parse(reply.timestamp_local)-Date.parse(row.timestamp_local)<=86400000));
      qualifying.push(...contextual.filter(r=>!qualifying.includes(r)));
      const formResponses=ownerQuestions.flatMap(question=>rows.filter(row=>row.direction==='incoming'&&Date.parse(row.timestamp_local)>=Date.parse(question.timestamp_local)&&Date.parse(row.timestamp_local)-Date.parse(question.timestamp_local)<=86400000).slice(0,3));
      // A voice question followed by a show quote is worth retaining for human
      // review, but the missing recording cannot establish a customer by itself.
      const audioQuestions=session.filter(reply=>reply.direction==='outgoing'&&services.test(reply.content)&&/\b(?:price|cost|my performance|my show)\b|\d\s*\$/i.test(reply.content)&&!supplier.test(reply.content)&&!unrelated.test(reply.content)).flatMap(reply=>{
        const index=rows.indexOf(reply);return rows.slice(Math.max(0,index-8),index).filter(row=>row.direction==='incoming'&&row.content.trim()==='Audio'&&Date.parse(reply.timestamp_local)-Date.parse(row.timestamp_local)<=86400000).slice(-1);
      });
      const question = session.some(r=>r.direction==='outgoing'&&structured.test(r.content));
      const businessResponses = inbound.filter(r=>!supplier.test(r.content)&&!unrelated.test(r.content)&&(occasion.test(r.content)||services.test(r.content)));
      const evidence = qualifying.length ? qualifying : formResponses.length?formResponses:question&&businessResponses.length ? businessResponses : audioQuestions;
      if (!evidence.length) continue;
      const strong = contextual.length>0||formResponses.length>0||evidence.some(r=>customerIntent.test(r.content)) || question&&businessResponses.length>=2;
      score = Math.max(score,strong?2:1);
      for (const row of evidence) possibleName ||= names(row.content);
      const included = relevant.concat(evidence).filter(r=>!media.test(r.content.trim()));
      const eventDates = [...new Set(included.flatMap(r=>explicitDates(r.content)))];
      const requested = [...new Set(included.flatMap(r=>serviceNames(r.content)))];
      const outcomeClues=[];
      const lastEvidence=Date.parse(evidence.at(-1).timestamp_local);
      for(const row of session){
        if(Date.parse(row.timestamp_local)-lastEvidence>7*86400000||supplier.test(row.content)||unrelated.test(row.content))continue;
        if(/\b(?:thank you|thanks|merci)\b/iu.test(row.content)&&/\b(?:show|performance|kids loved|children loved|birthday|party)\b/iu.test(row.content))outcomeClues.push('After-event feedback mentioned (verify completion and date)');
        if(!/\?|\bnot confirmed\b|\bconfirm (?:it|the|this|my)\b/iu.test(row.content)&&/\b(?:we confirm|booking is confirmed|confirmed for|i confirm the booking)\b/iu.test(row.content))outcomeClues.push('Confirmation mentioned (verify final agreement)');
        if(/\b(?:cancel (?:my|our|the) (?:booking|event|party)|booking (?:is |was )?cancelled|event (?:is |was )?cancelled)\b/iu.test(row.content))outcomeClues.push('Cancellation mentioned (verify which event)');
      }
      history.push({ enquiryDate:evidence[0].timestamp_local.slice(0,10), lastDiscussed:evidence.at(-1).timestamp_local.slice(0,10), eventDateCandidates:eventDates, ...fieldCandidates(evidence), services:requested,
        outcomeClues:[...new Set(outcomeClues)],
        status:'enquiry_unverified', evidenceIds:[...new Set(evidence.map(r=>r.message_id))].slice(0,8),
        dateNeedsReview:!eventDates.length, completionVerified:false });
    }
    if (!history.length) { excluded.push({chatId:contact.chat_id,reason:'No supported customer enquiry; keyword matches alone are insufficient'});continue; }
    const incomingSenders = new Set(rows.filter(r=>r.direction==='incoming').map(r=>r.sender_name?.trim()).filter(n=>n&&!/^\+?\d[\d\s()-]+$/.test(n)));
    // Export labels are not a reliable identity and may be a child's name.
    const name = possibleName || `Customer · ${phone.slice(-6)}`;
    const candidate = { id:createHash('sha256').update(contact.source_sha256+':'+phone).digest('hex').slice(0,32), sourceHash:contact.source_sha256, chatIds:[contact.chat_id],
      name, phone, nameNeedsReview:!possibleName, displayNameCandidates:[...incomingSenders].slice(0,3), children:[], history,
      qualification:score===2?'supported_enquiry':'needs_customer_review', offersConsent:false };
    if (phones.has(phone)) { const before=phones.get(phone);before.chatIds.push(contact.chat_id);before.history.push(...history); if(score===2)before.qualification='supported_enquiry';continue; }
    phones.set(phone,candidate);
  }
  for(const candidate of phones.values()) (candidate.qualification==='supported_enquiry'?accepted:review).push(candidate);
  return {accepted,review,excluded};
}
if (process.argv[1]?.endsWith('extract-whatsapp-customers.mjs')&&process.argv[2]) {
  const dir=process.argv[2], out=process.argv[3]||dir;mkdirSync(out,{recursive:true});
  const contacts=[...objects(readFileSync(join(dir,'magic_chat_contacts.csv'),'utf8'))];
  const messages=objects(readFileSync(join(dir,'magic_messages.csv'),'utf8'));
  const result=extract(contacts,messages);
  for(const [kind,rows] of Object.entries(result)) writeFileSync(join(out,`whatsapp-customers-${kind}.json`),JSON.stringify(rows,null,2));
  const manifest={sourceHash:contacts[0].source_sha256,createdAt:new Date().toISOString(),conversations:contacts.length,supportedEnquiries:result.accepted.length,needsReview:result.review.length,excludedChats:result.excluded.length,
    historyEntries:result.accepted.reduce((n,c)=>n+c.history.length,0),verifiedCompletedEvents:0,missingCustomerNames:result.accepted.filter(c=>c.nameNeedsReview).length,
    limits:['Text-only source: audio, images and pins cannot supply missing details.','No completed booking inferred from a keyword.','Explicit date candidates still need review.','Sender labels may refer to children; they do not establish adult identity.']};
  writeFileSync(join(out,'whatsapp-customers-manifest.json'),JSON.stringify(manifest,null,2));
  console.log(JSON.stringify(manifest));
}
