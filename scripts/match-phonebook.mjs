import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export function phoneKey(value) {
  let digits=value.replace(/^tel:/i,'').replace(/[^\d+]/g,'').replace(/^\+/,'').replace(/^00/,'');
  if (/^0[1-9]\d{6}$/.test(digits)) digits='961'+digits.slice(1);
  else if (/^(?:[1-9]\d{6}|(?:70|71|76|78|79|81)\d{6})$/.test(digits)) digits='961'+digits;
  else if (/^9610[1-9]\d{6}$/.test(digits)) digits='961'+digits.slice(4);
  return /^[1-9]\d{6,14}$/.test(digits)?'+'+digits:'';
}
function decoded(value,header) {
  if (/ENCODING=QUOTED-PRINTABLE/i.test(header)) {
    const bytes=[];for(let i=0;i<value.length;i++){if(value[i]==='='&&/^[a-f\d]{2}$/i.test(value.slice(i+1,i+3))){bytes.push(parseInt(value.slice(i+1,i+3),16));i+=2;}else bytes.push(...Buffer.from(value[i]));}
    value=Buffer.from(bytes).toString(/CHARSET=(?:WINDOWS-1252|ISO-8859-1)/i.test(header)?'latin1':'utf8');
  }
  return value.replace(/\\[nN]/g,' ').replace(/\\([,;\\])/g,'$1').replace(/[\u0000-\u001f\u007f]/g,'').trim();
}
export function parseVcf(text) {
  const cards=[];let card;
  // Handle both vCard folding and quoted-printable soft line breaks. Photos are never retained.
  const lines=text.replace(/^\uFEFF/,'').replace(/\r\n/g,'\n').replace(/=\n(?!=?BEGIN:VCARD)/g,'').replace(/\n[ \t]/g,'').split('\n');
  for(const line of lines){
    if(line==='BEGIN:VCARD'){card={name:'',fallback:'',phones:[]};continue;}
    if(line==='END:VCARD'){if(card)cards.push({name:card.name||card.fallback,phones:[...new Set(card.phones)]});card=undefined;continue;}
    if(!card)continue;const colon=line.indexOf(':');if(colon<0)continue;const header=line.slice(0,colon),property=header.split(';')[0].split('.').at(-1).toUpperCase(),value=decoded(line.slice(colon+1),header);
    if(property==='FN')card.name=value;
    if(property==='N')card.fallback=value.split(';').slice(0,2).reverse().filter(Boolean).join(' ');
    if(property==='TEL'){const key=phoneKey(value);if(key)card.phones.push(key);}
  }
  return cards;
}
export function matchPhonebook(cards,candidates) {
  const byPhone=new Map();
  for(const card of cards)if(card.name&&card.name.length<=200&&/\p{L}/u.test(card.name))for(const phone of card.phones){const labels=byPhone.get(phone)||new Set();labels.add(card.name.normalize('NFC'));byPhone.set(phone,labels);}
  const matches=[],conflicts=[];let unmatched=0;
  for(const candidate of candidates){const labels=[...(byPhone.get(phoneKey(candidate.phone))||[])];if(!labels.length){unmatched++;continue;}if(labels.length>1){conflicts.push({id:candidate.id,phone:candidate.phone,labels});continue;}matches.push({id:candidate.id,phone:phoneKey(candidate.phone),label:labels[0]});}
  return {matches,conflicts,unmatched,phonebookCards:cards.length};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const [input,candidateFile,folder]=process.argv.slice(2);mkdirSync(folder,{recursive:true});const bytes=readFileSync(input),prepared=JSON.parse(readFileSync(candidateFile,'utf8')),result=matchPhonebook(parseVcf(bytes.toString('utf8')),prepared.candidates);
  writeFileSync(join(folder,'phonebook-matches.json'),JSON.stringify({sourceHash:createHash('sha256').update(bytes).digest('hex'),matches:result.matches},null,2));
  writeFileSync(join(folder,'phonebook-review.json'),JSON.stringify({...result,matches:undefined},null,2));
  console.log(JSON.stringify({cards:result.phonebookCards,matches:result.matches.length,conflicts:result.conflicts.length,unmatched:result.unmatched}));
}
