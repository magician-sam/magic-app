import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {readFile} from 'node:fs/promises';
import {TestStore} from './store-fixture.mjs';import {createApp} from '../dist/server.js';import {createUser} from '../dist/auth.js';import {snapshot,restoreSnapshot} from '../dist/snapshots.js';

test('supplier signup, private services/photos, identity review and availability remain isolated and retry safe',async()=>{
 const store=new TestStore(':memory:'),b=await store.createBusiness('Synthetic supplier platform','supplier-test'),other=await store.createBusiness('Other supplier business','supplier-other');
 const password='Supplier-Test-42!';await createUser(store,b.id,'owner@example.test',password,'Owner');await createUser(store,other.id,'other@example.test',password,'Other');await createUser(store,b.id,'manager@example.test',password,'Manager','manager');
 const origin='https://supplier.test',server=createApp(store,origin).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
 const request=async(path,method='GET',body,cookie='')=>{const r=await fetch(base+'/api'+path,{method,headers:{origin,'content-type':'application/json',cookie},body:body===undefined?undefined:JSON.stringify(body)});return{status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};};
 const login=async email=>(await request('/login','POST',{email,password})).cookie;
 const applicant={name:'Fictional artist and venue',phone:'+12025550123',email:'supplier@example.test',password,username:'test-supplier',offersConsent:false,supplierTypes:['artist','venue']};
 try{
  const owner=await login('owner@example.test'),foreign=await login('other@example.test'),manager=await login('manager@example.test');
  const current='/supplier/supplier-test';assert.equal((await request(current+'/register','POST',applicant)).status,503);
  assert.equal(Number((await store.db.prepare('SELECT count(*) AS n FROM customer_accounts').get()).n),0);
  const details={audience:'supplier',operator:'Synthetic Supplier Operator',address:'Fictional test address',contact:'test@example.test',texts:Object.fromEntries(['en','fr','ar'].map(lang=>[lang,{summary:'Synthetic registration summary '+lang+' for testing only.',terms:'Fictional local supplier terms only. '.repeat(5),privacy:'Fictional local privacy notice only. '.repeat(5)}]))};
  await request('/manage/registration-agreements/supplier','PUT',{revision:0,details},owner);const version=(await request('/manage/registration-agreements/supplier/publish','POST',{revision:1,reviewConfirmed:true},owner)).data.id;
  const register=async(username,types=['artist','venue'])=>request(current+'/register','POST',{...applicant,username,supplierTypes:types,agreement:{version,language:'en',accepted:true}});
  const first=await register('test-supplier');assert.equal(first.status,201);const second=await register('other-supplier',['food']);assert.equal(second.status,201);
  const cookie=first.cookie,secondCookie=second.cookie;let profile=(await request(current+'/me','GET',undefined,cookie)).data.profile;const supplierId=profile.id;
  assert.equal(profile.identityStatus,'pending');assert.equal(profile.source,'self');assert.equal((await request(current+'/me')).status,401);
  assert.equal((await request('/supplier/supplier-other/me','GET',undefined,cookie)).status,401);
  assert.equal((await request('/manage/supplier-applications','GET',undefined,manager)).status,403);assert.equal((await request('/manage/supplier-applications','GET',undefined,foreign)).data.applications.length,0);
  const ownDetails={name:profile.name,contactName:'Fictional contact',phone:profile.phone,email:profile.email,area:'Synthetic city',address:'',bio:'Fictional biography',types:profile.types,services:[{id:randomUUID(),type:'artist',name:'Synthetic show',description:'Fictional show',priceMode:'suggested',suggestedFee:150,currency:'USD',tax:'unknown',duration:45,notes:'Test travel'}]};
  assert.equal((await request(current+'/profile','PUT',{revision:1,details:{...ownDetails,identityStatus:'approved'}},cookie)).status,400);
  const raced=await Promise.all([request(current+'/profile','PUT',{revision:1,details:ownDetails},cookie),request(current+'/profile','PUT',{revision:1,details:ownDetails},cookie)]);assert.deepEqual(raced.map(r=>r.status).sort(),[200,409]);profile=(await request(current+'/me','GET',undefined,cookie)).data.profile;assert.equal(profile.services[0].suggestedFee,150);
  const image={mime:'image/jpeg',data:(await readFile(new URL('../public/portfolio/sam-magic-live-1.jpg',import.meta.url))).toString('base64')};
  const uploaded=await request(current+'/photos','POST',{revision:profile.revision,photo:image,caption:'App-owned synthetic test',permissionNote:'Owned app asset, local test only'},cookie);assert.equal(uploaded.status,201);profile=uploaded.data;
  const photoPath=current+'/photos/'+profile.photos[0].id;assert.equal((await request(photoPath,'GET',undefined,secondCookie)).status,404);assert.equal((await fetch(base+'/api'+photoPath)).status,401);const bytes=await fetch(base+'/api'+photoPath,{headers:{cookie}});assert.match(bytes.headers.get('cache-control'),/private, no-store/);assert.deepEqual(Buffer.from(await bytes.arrayBuffer()),Buffer.from(image.data,'base64'));
  const booking={id:randomUUID(),date:'2026-11-01',time:'12:00',status:'requested',revision:1};await store.put(b.id,'bookings',booking);
  const job={requestId:randomUUID(),details:{accountId:supplierId,bookingId:booking.id,kind:'artist',date:booking.date,time:booking.time,area:'Test city',description:'Fictional show availability only'}};
  assert.equal((await request('/manage/supplier-availability','POST',job,owner)).status,403,'no work access before identity review');
  const review='/manage/supplier-applications/'+supplierId+'/review';assert.equal((await request(review,'POST',{revision:profile.revision,decision:'approved',note:'Synthetic identity reviewed',identityChecked:true},foreign)).status,404);
  const approved=await request(review,'POST',{revision:profile.revision,decision:'approved',note:'Synthetic identity reviewed',identityChecked:true},owner);assert.equal(approved.status,200);assert.equal(approved.data.identityStatus,'approved');
  const dispatch=await request('/manage/supplier-availability','POST',job,owner);assert.equal(dispatch.status,201);assert.equal((await request('/manage/supplier-availability','POST',job,owner)).data.id,dispatch.data.id);
  assert.equal((await request('/manage/supplier-availability','POST',{...job,details:{...job.details,description:'Changed payload'}},owner)).status,409);
  const desk=(await request(current+'/me','GET',undefined,cookie)).data;assert.equal(desk.jobs.length,1);assert.equal(desk.notices.length,1);assert.equal(desk.jobs[0].bookingId,undefined);assert.equal(desk.jobs[0].digest,undefined);
  const another=(await request(current+'/me','GET',undefined,secondCookie)).data;assert.equal(another.jobs.length,0);assert.equal(another.notices.length,0);
  const reply=current+'/jobs/'+dispatch.data.id+'/reply';assert.equal((await request(reply,'POST',{revision:1,answer:'available'},secondCookie)).status,404);
  const replies=await Promise.all([request(reply,'POST',{revision:1,answer:'available'},cookie),request(reply,'POST',{revision:1,answer:'unavailable'},cookie)]);assert.deepEqual(replies.map(r=>r.status).sort(),[200,409]);
  assert.equal((await store.get(b.id,'bookings',booking.id)).status,'requested','availability never confirms the event');
  const notice=current+'/notices/'+desk.notices[0].id+'/read';assert.equal((await request(notice,'POST',{},secondCookie)).status,404);assert.equal((await request(notice,'POST',{},cookie)).status,200);
  const freshJob={...job,requestId:randomUUID()};const pending=await request('/manage/supplier-availability','POST',freshJob,owner);assert.equal(pending.status,201);await store.put(b.id,'bookings',{...booking,revision:2,time:'13:00'});
  assert.equal((await request(current+'/jobs/'+pending.data.id+'/reply','POST',{revision:1,answer:'available'},cookie)).status,409,'event changes invalidate availability replies');
  assert.equal((await request(current+'/me','GET',undefined,cookie)).data.jobs.find(j=>j.id===pending.data.id).status,'changed','supplier sees that the event needs a new request');
  assert.equal((await request('/manage/supplier-availability/'+pending.data.id+'/cancel','POST',{revision:1},owner)).status,200);
  assert.equal((await request(current+'/jobs/'+pending.data.id+'/reply','POST',{revision:1,answer:'available'},cookie)).status,409);
  const edited=await request(current+'/profile','PUT',{revision:approved.data.revision,details:ownDetails},cookie);assert.equal(edited.status,200);assert.equal(edited.data.identityStatus,'pending','changed profile needs fresh identity review');
  const publicCatalog=await request('/public/supplier-test');assert.equal(JSON.stringify(publicCatalog.data).includes(applicant.email),false);assert.equal(JSON.stringify(publicCatalog.data).includes('Fictional artist'),false);
  const restored=new TestStore(':memory:');try{await restoreSnapshot(restored,await snapshot(store));assert.equal((await restored.get(b.id,'supplierApplications',supplierId)).services[0].suggestedFee,150);assert.equal((await restored.get(b.id,'supplierApplicationPhotos',profile.photos[0].id)).data,image.data);}finally{await restored.db.close?.();}
 }finally{await new Promise(r=>server.close(r));await store.db.close?.();}
});
