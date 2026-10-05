import test from 'node:test';
import assert from 'node:assert/strict';
import { extract } from '../scripts/extract-whatsapp-customers.mjs';
import { TestStore as Store } from './store-fixture.mjs';
import { createApp } from '../dist/server.js';
import { createUser } from '../dist/auth.js';

const sourceHash='b'.repeat(64);
test('customer extraction rejects broadcasts, preserves missing adult names and distinguishes enquiry dates',()=>{
  const contacts=['customer','supplier','greeting','group','arabizi','duplicate'].map((chat_id,i)=>({chat_id,source_sha256:sourceHash,phone_candidate:chat_id==='group'?'':chat_id==='duplicate'?'+96170000100':`+9617000010${i}`}));
  const texts=['I want a magic show for my daughter birthday on 2026-11-14','We offer magic show packages. Buy 20 get free!','Happy birthday bro','I want a bubble show','baddi bubble show la benti','I need science show'];
  const rows=contacts.map((c,i)=>({chat_id:c.chat_id,message_id:`m${i}`,content:texts[i],direction:'incoming',sender_name:i===0?'Lily':'',timestamp_local:'2026-10-05T10:00:00'}));
  const result=extract(contacts,rows);
  assert.equal(result.accepted.length,2);assert.equal(result.review.length,0);assert.equal(result.excluded.length,3);
  const customer=result.accepted.find(c=>c.phone==='+96170000100');
  assert.equal(customer.nameNeedsReview,true);assert.ok(customer.name.startsWith('Customer'));assert.deepEqual(customer.children,[]);
  assert.equal(customer.history[0].enquiryDate,'2026-10-05');assert.deepEqual(customer.history[0].eventDateCandidates,['2026-11-14']);
  assert.equal(customer.chatIds.length,2);assert.equal(customer.history[0].completionVerified,false);assert.equal(customer.offersConsent,false);
  assert.ok(!JSON.stringify(result).includes(texts[0]));
  assert.doesNotThrow(()=>extract([contacts[0]],[{...rows[0],content:'I want magic show on 2026-99-99'}]));
});
test('lean customer import is scoped, retry-safe, preserves existing consent and requires complete extraction before cleanup',async()=>{
  const store=new Store(':memory:'),business=await store.createBusiness('Test','lean-test'),other=await store.createBusiness('Other','lean-other');
  const password='Test-lean-import-42!';
  for(const [email,bid,role]of [['lean@test.example',business.id,'owner'],['other@test.example',other.id,'owner'],['manager@test.example',business.id,'manager']])await createUser(store,bid,email,password,email,role);
  const server=createApp(store,'http://localhost').listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const origin=`http://127.0.0.1:${server.address().port}`;
  const request=async(path,body,cookie)=>{const r=await fetch(origin+'/api'+path,{method:body?'POST':'GET',headers:{origin:'http://localhost','content-type':'application/json',...(cookie?{cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});return{status:r.status,data:await r.json(),headers:r.headers};};
  const login=async(email)=>(await request('/login',{email,password})).headers.get('set-cookie').split(';')[0];
  try{
    const owner=await login('lean@test.example'),foreign=await login('other@test.example'),manager=await login('manager@test.example');
    await store.put(business.id,'whatsappImports',{id:sourceHash,counts:{contact:2,messages:1,review:1}});
    for(const [chatId,phone]of [['c1','+96170000123'],['c2','+96170000124']])await store.put(business.id,'whatsappContacts',{id:`${sourceHash}:${chatId}`,rows:[{phone_candidate:phone}]});
    await store.put(business.id,'whatsappMessages',{id:`${sourceHash}:messages_c1_0000000`,rows:[{content:'private conversation'}]});
    await store.put(other.id,'whatsappMessages',{id:`${sourceHash}:messages_c1_0000000`,rows:[{content:'other business'}]});
    const candidate={id:'a'.repeat(32),sourceHash,chatIds:['c1'],name:'Customer · 000123',phone:'+96170000123',nameNeedsReview:true,displayNameCandidates:[],children:[],history:[{enquiryDate:'2025-02-04',lastDiscussed:'2025-02-05',eventDateCandidates:['2025-03-15'],services:['Magic'],status:'enquiry_unverified',evidenceIds:['m1'],dateNeedsReview:false,completionVerified:false}],qualification:'supported_enquiry',offersConsent:false};
    const body={sourceHash,candidates:[candidate]};
    assert.equal((await request('/manage/whatsapp/customers/import',body,manager)).status,403);
    assert.equal((await request('/manage/whatsapp/customers/import',body,foreign)).status,409);
    assert.equal((await request('/manage/whatsapp/customers/import',{sourceHash,candidates:[{...candidate,phone:'+96170000999'}]},owner)).status,409);
    assert.equal((await request('/manage/whatsapp/customers/import',body,owner)).data.created,1);
    assert.equal((await request('/manage/whatsapp/customers/import',body,owner)).data.created,0);
    const customers=await store.all(business.id,'customers');assert.equal(customers.length,1);assert.equal(customers[0].offersConsent,false);
    assert.equal((await store.all(business.id,'bookings')).length,0);assert.equal((await store.all(business.id,'contactHistory')).length,1);
    const summary=(await store.all(business.id,'contactHistory'))[0];assert.equal(summary.date,'2025-02-04');assert.ok(summary.summary.includes('verify'));assert.ok(!summary.summary.includes('private conversation'));
    const pending={...candidate,id:'c'.repeat(32),chatIds:['c2'],phone:'+96170000124',qualification:'needs_customer_review'};
    await request('/manage/whatsapp/customers/import',{sourceHash,candidates:[pending]},owner);
    assert.equal((await store.all(business.id,'customers')).length,1);
    assert.equal((await request('/manage/whatsapp/customers/'+pending.id+'/approve',{verified:false,customer:{name:'Reviewed person',phone:pending.phone}},owner)).status,400);
    assert.equal((await request('/manage/whatsapp/customers/'+pending.id+'/approve',{verified:true,customer:{name:'Reviewed person',phone:pending.phone}},owner)).status,200);
    assert.equal((await store.all(business.id,'customers')).length,2);
    assert.equal((await request('/manage/whatsapp/customers/complete',{sourceHash,expected:3,backupSha256:sourceHash},owner)).status,409);
    assert.equal((await store.all(business.id,'whatsappMessages')).length,1);
    assert.equal((await request('/manage/whatsapp/customers/complete',{sourceHash,expected:2,backupSha256:sourceHash},owner)).status,200);
    assert.equal((await store.all(business.id,'whatsappMessages')).length,0);assert.equal((await store.all(other.id,'whatsappMessages')).length,1);
    assert.equal((await store.all(business.id,'customers')).length,2);assert.equal((await request('/manage/database-page',null,owner)).status,403);
    assert.equal((await request('/manage/database-page',null,manager)).status,403);
  }finally{await new Promise(r=>server.close(r));store.db.close();}
});
test('paged backups preserve complete records, cap response bytes and reject unknown tables',async()=>{
  const store=new Store(':memory:'),business=await store.createBusiness('Backup','paged-backup');
  await createUser(store,business.id,'backup@test.example','Test-backup-42!','Owner','owner');
  for(let i=0;i<30;i++)await store.put(business.id,'whatsappMessages',{id:String(i),content:'x'.repeat(120000)});
  const server=createApp(store,'http://localhost').listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const origin=`http://127.0.0.1:${server.address().port}`;
  try{
    const login=await fetch(origin+'/api/login',{method:'POST',headers:{origin:'http://localhost','content-type':'application/json'},body:JSON.stringify({email:'backup@test.example',password:'Test-backup-42!'})});const cookie=login.headers.get('set-cookie').split(';')[0];
    const get=path=>fetch(origin+'/api/manage/database-page'+path,{headers:{cookie}});
    const manifest=await(await get('')).json(),table=manifest.tables.find(t=>t.table==='records');
    let after=0,done=false;const records=[];
    while(!done){const response=await get(`?table=records&after=${after}&ceiling=${table.ceiling}`);assert.equal(response.status,200);const text=await response.text();assert.ok(Buffer.byteLength(text)<2300000);const page=JSON.parse(text);records.push(...page.rows);after=page.next;done=page.done;}
    assert.equal(records.length,table.count);assert.equal(records.filter(r=>r.kind==='whatsappMessages').length,30);assert.ok(!JSON.stringify(records).includes('__backup_rowid'));
    assert.equal((await get('?table=unknown&ceiling=1')).status,400);
    assert.equal((await get('?table=records')).status,400);
  }finally{await new Promise(r=>server.close(r));store.db.close();}
});
