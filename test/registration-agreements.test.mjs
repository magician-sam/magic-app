import test from 'node:test';import assert from 'node:assert/strict';
import {TestStore} from './store-fixture.mjs';import {createApp} from '../dist/server.js';import {createUser} from '../dist/auth.js';
import {activeAgreement,acceptRegistrationAgreement} from '../dist/registration-agreements.js';import {snapshot,restoreSnapshot} from '../dist/snapshots.js';

export const fictionalAgreement=(audience='customer')=>({audience,operator:'Fictional Test Operator',address:'Synthetic address for local tests only',contact:'fictional@example.test',texts:Object.fromEntries(['en','fr','ar'].map(lang=>[lang,{summary:'Fictional registration summary '+lang+'. No real agreement is offered.',terms:'Synthetic terms for automated testing only. '.repeat(4),privacy:'Synthetic privacy notice for automated testing only. '.repeat(4)}]))});

test('published registration versions are immutable and acceptance is bound to account, audience and current text',async()=>{
 const store=new TestStore(':memory:'),b=await store.createBusiness('Legal synthetic','legal-test'),other=await store.createBusiness('Other legal synthetic','other-legal-test');
 const password='Legal-Test-42!';await createUser(store,b.id,'owner@example.test',password,'Owner');await createUser(store,other.id,'other@example.test',password,'Other');await createUser(store,b.id,'manager@example.test',password,'Manager','manager');
 const origin='https://legal.test',server=createApp(store,origin).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
 const request=async(path,method='GET',body,cookie='')=>{const r=await fetch(base+'/api'+path,{method,headers:{origin,'content-type':'application/json',cookie},body:body===undefined?undefined:JSON.stringify(body)});return{status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};};
 const login=async email=>(await request('/login','POST',{email,password})).cookie;
 const account={name:'Synthetic Customer',phone:'+12025550123',email:'customer@example.test',password,username:'legal-customer',offersConsent:false};
 try{
  const owner=await login('owner@example.test'),foreign=await login('other@example.test'),manager=await login('manager@example.test');
  assert.equal((await request('/manage/registration-agreements')).status,401);
  assert.equal((await request('/manage/registration-agreements','GET',undefined,manager)).status,403);
  assert.equal((await request('/public/legal-test/registration-agreements/customer')).data.agreement,null);
  const details=fictionalAgreement(),path='/manage/registration-agreements/customer';
  const placeholder={...fictionalAgreement('supplier'),operator:'[EXACT LEGAL OPERATOR]'};
  await request('/manage/registration-agreements/supplier','PUT',{revision:0,details:placeholder},foreign);
  assert.equal((await request('/manage/registration-agreements/supplier/publish','POST',{revision:1,reviewConfirmed:true},foreign)).status,400,'placeholder operator must never become binding text');
  assert.equal((await request(path,'PUT',{revision:0,details},owner)).status,200);
  assert.equal((await request(path,'PUT',{revision:0,details},owner)).status,409);
  assert.equal((await request(path+'/publish','POST',{revision:1,reviewConfirmed:false},owner)).status,400);
  assert.equal((await request(path+'/publish','POST',{revision:1,reviewConfirmed:true},foreign)).status,409);
  const first=await request(path+'/publish','POST',{revision:1,reviewConfirmed:true},owner);assert.equal(first.status,201);
  assert.equal((await request(path+'/publish','POST',{revision:1,reviewConfirmed:true},owner)).data.id,first.data.id,'retry does not duplicate identical publication');
  const view=(await request('/public/legal-test/registration-agreements/customer?language=ar')).data.agreement;
  assert.equal(view.language,'ar');assert.equal(view.version,first.data.id);assert.equal(view.digest,first.data.digest);assert.equal(view.publishedBy,undefined);assert.equal(view.terms,undefined);
  const doc=await fetch(base+view.termsUrl);assert.equal(doc.status,200);assert.match(doc.headers.get('content-type'),/text\/plain/);assert.match(await doc.text(),/Synthetic terms/);
  assert.equal((await request('/customer/legal-test/register','POST',account)).status,400);
  assert.equal((await request('/customer/legal-test/register','POST',{...account,agreement:{version:first.data.id,language:'ar',accepted:false}})).status,400);
  assert.equal(Number((await store.db.prepare('SELECT count(*) AS n FROM customer_accounts').get()).n),0,'no partial account without agreement');
  const supplierDetails=fictionalAgreement('supplier');await request('/manage/registration-agreements/supplier','PUT',{revision:0,details:supplierDetails},owner);
  const supplier=(await request('/manage/registration-agreements/supplier/publish','POST',{revision:1,reviewConfirmed:true},owner)).data;
  assert.equal((await request('/customer/legal-test/register','POST',{...account,agreement:{version:supplier.id,language:'en',accepted:true}})).status,409,'supplier text cannot stand in for customer terms');
  const registered=await request('/customer/legal-test/register','POST',{...account,agreement:{version:first.data.id,language:'ar',accepted:true}});assert.equal(registered.status,201);
  const receipt=(await request('/customer/legal-test/agreements','GET',undefined,registered.cookie)).data.receipts[0];assert.equal(receipt.version,first.data.id);assert.equal(receipt.digest,first.data.digest);assert.equal(receipt.language,'ar');assert.ok(Date.parse(receipt.acceptedAt));assert.equal(receipt.accountId,undefined);
  assert.equal((await request('/customer/other-legal-test/agreements','GET',undefined,registered.cookie)).status,401);
  assert.equal((await request('/manage/registration-agreements','GET',undefined,foreign)).data.versions.length,0);
  await request(path,'PUT',{revision:1,details:{...details,texts:{...details.texts,en:{...details.texts.en,terms:'Updated terms. '.repeat(12)}}}},owner);
  const next=await request(path+'/publish','POST',{revision:2,reviewConfirmed:true},owner);assert.notEqual(next.data.id,first.data.id);
  const stale=await request('/customer/legal-test/register','POST',{...account,username:'second-customer',agreement:{version:first.data.id,language:'en',accepted:true}});assert.equal(stale.status,409);
  assert.match(await(await fetch(base+view.termsUrl)).text(),/Synthetic terms/,'old accepted text remains accessible');
  const second=await request('/customer/legal-test/register','POST',{...account,username:'second-customer',agreement:{version:next.data.id,language:'en',accepted:true}});assert.equal(second.status,201);
  assert.equal((await request('/customer/legal-test/agreements','GET',undefined,second.cookie)).data.receipts.length,1,'receipt endpoint isolates accounts');
  assert.equal((await request('/customer/legal-test/agreements','GET',undefined,registered.cookie)).data.receipts[0].version,first.data.id);
  const restored=new TestStore(':memory:');try{await restoreSnapshot(restored,await snapshot(store));assert.equal((await activeAgreement(restored,b.id,'customer')).id,next.data.id);assert.equal((await restored.all(b.id,'registrationAgreementAcceptances')).length,2);}finally{await restored.db.close?.();}
 }finally{await new Promise(r=>server.close(r));await store.db.close?.();}
});

test('unpublished supplier terms block enrollment, and draft placeholders cannot activate',async()=>{
 const store=new TestStore(':memory:'),b=await store.createBusiness('Draft only','draft-only');
 try{await assert.rejects(()=>acceptRegistrationAgreement(store,b.id,'synthetic-account','supplier',undefined,true),/final agreements/);assert.equal(await activeAgreement(store,b.id,'supplier'),undefined);}finally{await store.db.close?.();}
});
