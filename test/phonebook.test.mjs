import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVcf, phoneKey, matchPhonebook } from '../scripts/match-phonebook.mjs';
import { TestStore as Store } from './store-fixture.mjs';
import { createApp } from '../dist/server.js';
import { createUser } from '../dist/auth.js';

test('phonebook handles Lebanese prefixes, folded and quoted-printable names, conflicts and excludes photos',()=>{
  assert.equal(phoneKey('03 123 456'),'+9613123456');assert.equal(phoneKey('70 123 456'),'+96170123456');assert.equal(phoneKey('00961 3 123456'),'+9613123456');assert.equal(phoneKey('+1 714 448 9333'),'+17144489333');
  const cards=parseVcf('BEGIN:VCARD\r\nVERSION:2.1\r\nFN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:=D8=B3=D8=A7=\r\n=D9=85\r\nTEL;CELL:03123456\r\nPHOTO;ENCODING=BASE64:abcdef\r\n ghijk\r\nEND:VCARD\r\nBEGIN:VCARD\r\nFN:Another\r\n Name\r\nTEL:70123456\r\nEND:VCARD');
  assert.equal(cards[0].name,'سام');assert.equal(cards[1].name,'AnotherName');assert.ok(!JSON.stringify(cards).includes('abcdef'));
  const candidates=[{id:'a',phone:'+9613123456'},{id:'b',phone:'+96170123456'},{id:'c',phone:'+96171123456'}];
  const result=matchPhonebook([...cards,{name:'Different label',phones:['+9613123456']}],candidates);assert.equal(result.matches.length,1);assert.equal(result.conflicts.length,1);assert.equal(result.unmatched,1);
});
test('phonebook enriches only existing enquiries, preserves names and consent, isolates businesses and is retry-safe',async()=>{
  const store=new Store(':memory:'),business=await store.createBusiness('Book','book'),other=await store.createBusiness('Other','other-book');
  const password='Test-book-42!';for(const [email,bid,role]of [['book@test.example',business.id,'owner'],['other-book@test.example',other.id,'owner'],['manager-book@test.example',business.id,'manager']])await createUser(store,bid,email,password,email,role);
  const server=createApp(store,'http://localhost').listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const origin=`http://127.0.0.1:${server.address().port}`;
  const post=async(path,body,cookie)=>{const response=await fetch(origin+'/api'+path,{method:'POST',headers:{origin:'http://localhost','content-type':'application/json',...(cookie?{cookie}:{})},body:JSON.stringify(body)});return {status:response.status,data:await response.json(),headers:response.headers};};
  const login=async email=>(await post('/login',{email,password})).headers.get('set-cookie').split(';')[0];
  try{
    const owner=await login('book@test.example'),foreign=await login('other-book@test.example'),manager=await login('manager-book@test.example');
    for(const [id,phone,name,customerId]of [['a'.repeat(32),'+96170123456','Customer · 123456','customer'],['b'.repeat(32),'+96171123456','Verified Adult','known'],['c'.repeat(32),'+96176123456','Customer · 123456',undefined]])await store.put(business.id,'whatsappCustomerReview',{id,phone,name,customerId,nameNeedsReview:true,displayNameCandidates:[]});
    await store.put(business.id,'customers',{id:'customer',name:'Customer · 123456',phone:'+96170123456',offersConsent:false});await store.put(business.id,'customers',{id:'known',name:'Verified Adult',phone:'+96171123456',offersConsent:true});
    const body={sourceHash:'a'.repeat(64),matches:[{id:'a'.repeat(32),phone:'+96170123456',label:'Parent of Lily'}]};
    assert.equal((await post('/manage/whatsapp/customers/phonebook',body,manager)).status,403);assert.equal((await post('/manage/whatsapp/customers/phonebook',body,foreign)).status,404);
    assert.equal((await post('/manage/whatsapp/customers/phonebook',{...body,matches:[{...body.matches[0],phone:'+96179999999'}]},owner)).status,409);
    assert.equal((await post('/manage/whatsapp/customers/phonebook',body,owner)).data.customerNames,1);assert.equal((await post('/manage/whatsapp/customers/phonebook',body,owner)).data.skipped,1);
    await post('/manage/whatsapp/customers/phonebook',{...body,matches:[{id:'b'.repeat(32),phone:'+96171123456',label:'Other label'},{id:'c'.repeat(32),phone:'+96176123456',label:'Review label'}]},owner);
    const updated=await store.get(business.id,'customers','customer');assert.equal(updated.name,'Parent of Lily');assert.equal(updated.offersConsent,false);assert.equal(updated.phonebookIdentityVerified,false);
    assert.equal((await store.get(business.id,'customers','known')).name,'Verified Adult');assert.equal((await store.get(business.id,'customers','known')).offersConsent,true);
    assert.equal((await store.get(business.id,'whatsappCustomerReview','c'.repeat(32))).customerId,undefined);assert.equal((await store.all(business.id,'customers')).length,2);assert.equal((await store.all(business.id,'bookings')).length,0);
  }finally{await new Promise(r=>server.close(r));store.db.close();}
});
