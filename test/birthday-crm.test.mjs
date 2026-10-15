import test from 'node:test';
import assert from 'node:assert/strict';
import { DateTime } from 'luxon';
import { TestStore as Store } from './store-fixture.mjs';
import { birthdayRows, birthdaySettingsSchema, birthdayProfileSchema, generateBirthdays, birthdayContext } from '../dist/birthday-crm.js';
import { customerSchema } from '../dist/domain.js';
import { createUser } from '../dist/auth.js';
import { createApp } from '../dist/server.js';
const business={id:'business',name:'Test',timezone:'Asia/Beirut'};
const customer={id:'family',...customerSchema.parse({name:'Parent',phone:'+96170000000',offersConsent:true,children:[{name:'Child',birthday:'2020-12-25'}]})};
const settings=birthdaySettingsSchema.parse({enabled:true,bundleEnabled:true,bundleName:'Small celebration',bundleDetails:'Owner supplied price and inclusions'});
const profile={id:'family',...birthdayProfileSchema.parse({enabled:true,messageConsent:true})};
const row=(today,changes={},p=profile,bs=[])=>birthdayRows(business,{...customer,...changes},bs,settings,p,today)[0];
test('45-day countdown, five/eight/custom calendar cadence and next-date override',()=>{
  assert.equal(row('2026-11-09').status,'Scheduled');
  assert.equal(row('2026-11-10').candidate.date,'2026-11-10');
  assert.equal(row('2026-11-18',{}, {...profile,intervalDays:8}).candidate.date,'2026-11-18');
  assert.equal(row('2026-11-17',{}, {...profile,intervalDays:7}).candidate.date,'2026-11-17');
  assert.equal(row('2026-11-18',{}, {...profile,nextReminderDate:'2026-11-20'}).status,'Scheduled');
  assert.equal(row('2026-11-18',{}, {...profile,enabled:false}).status,'Paused');
});
test('consent, opt-out, bookings, leap dates, year rollover and one late bundle',()=>{
  assert.equal(row('2026-11-10',{offersConsent:false}).candidate,undefined);
  assert.equal(row('2026-11-10',{doNotContact:true}).status,'Opted out');
  assert.equal(row('2026-11-10',{}, {...profile,messageConsent:false}).status,'Consent required');
  const booking={id:'b',customerId:'family',status:'accepted',date:'2026-12-27',occasion:'Birthday'};
  assert.equal(row('2026-11-10',{},profile,[booking]).candidate,undefined);
  assert.ok(row('2026-11-10',{},profile,[{...booking,status:'cancelled'}]).candidate);
  assert.ok(row('2026-11-10',{},profile,[{...booking,customerId:'other'}]).candidate);
  assert.equal(row('2027-01-03').candidate,undefined);
  const offer=row('2027-01-04').candidate;
  assert.equal(offer.kind,'bundle'); assert.equal(offer.birthday,'2026-12-25');
  assert.equal(row('2027-01-08').candidate.id,offer.id);
  const leap=row('2027-02-28',{children:[{name:'Leap',birthday:'2020-02-29'}]});
  assert.equal(leap.birthday,'2027-02-28');
  assert.equal(birthdayRows(business,{...customer,children:[...customer.children,...customer.children]},[],settings,profile,'2026-11-10').length,1);
});
test('transactional dedup, pause reconciliation, yearly renewal, interval edits and backup-safe history',async()=>{
  const store=new Store(':memory:'); const b=await store.createBusiness('Test','test');
  try{
    await store.put(b.id,'customers',customer); await store.put(b.id,'birthdaySettings',{id:'settings',...settings}); await store.put(b.id,'birthdayProfiles',profile);
    const results=await Promise.all([generateBirthdays(store,b,'2026-11-10'),generateBirthdays(store,b,'2026-11-10')]);
    assert.equal(results.reduce((n,r)=>n+r.added,0),1);
    assert.equal((await generateBirthdays(store,b,'2026-11-11')).added,0);
    await store.put(b.id,'birthdayProfiles',{...profile,intervalDays:8});
    assert.equal((await generateBirthdays(store,b,'2026-11-17')).added,0);
    assert.equal((await generateBirthdays(store,b,'2026-11-18')).added,1);
    await store.put(b.id,'customers',{...customer,doNotContact:true});
    await generateBirthdays(store,b,'2026-11-18');
    assert.ok((await store.all(b.id,'birthdayDrafts')).every(d=>d.status==='suppressed'));
    await store.put(b.id,'customers',customer);
    assert.equal((await generateBirthdays(store,b,'2027-01-04')).added,1);
    assert.equal((await generateBirthdays(store,b,'2027-01-05')).added,0);
    assert.equal((await generateBirthdays(store,b,'2027-11-10')).added,1);
    assert.equal((await store.all(b.id,'contactHistory')).length,0);
    const other=await store.createBusiness('Other','other'); assert.equal((await birthdayContext(store,other)).customers.length,0);
  }finally{store.db.close();}
});
test('API permissions, revisions, tenant isolation and fresh booking/consent checks',async()=>{
  const store=new Store(':memory:'), origin='http://localhost:46602';
  const b=await store.createBusiness('Test','test'), other=await store.createBusiness('Other','other');
  const today=DateTime.now().setZone(b.timezone).toISODate();
  await store.put(b.id,'customers',{...customer,children:[{name:'Child',birthday:today}]});
  await store.put(b.id,'birthdaySettings',{...settings,id:'settings'}); await store.put(b.id,'birthdayProfiles',profile);
  await createUser(store,b.id,'owner@birthday.test','Fixture-only-42!','Owner');
  await createUser(store,other.id,'other@birthday.test','Fixture-only-42!','Other');
  await createUser(store,b.id,'accountant@birthday.test','Fixture-only-42!','Accounting','accountant');
  const server=createApp(store,origin).listen(0,'127.0.0.1'); await new Promise(r=>server.once('listening',r));
  const call=async(path,method='GET',body,cookie)=>{const res=await fetch(`http://127.0.0.1:${server.address().port}/api${path}`,{method,headers:{origin,'content-type':'application/json',...(cookie?{cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});return{status:res.status,data:await res.json(),cookie:res.headers.get('set-cookie')?.split(';')[0]};};
  const login=async email=>(await call('/login','POST',{email,password:'Fixture-only-42!'})).cookie;
  try{
    const owner=await login('owner@birthday.test'), outsider=await login('other@birthday.test'), accountant=await login('accountant@birthday.test');
    assert.equal((await call('/manage/birthdays','GET',undefined,accountant)).status,403);
    assert.equal((await call('/manage/birthdays/customers/family','PUT',profile,outsider)).status,400); // strict unknown id
    const input={enabled:profile.enabled,messageConsent:profile.messageConsent,intervalDays:profile.intervalDays,nextReminderDate:profile.nextReminderDate,revision:profile.revision};
    assert.equal((await call('/manage/birthdays/customers/family','PUT',input,outsider)).status,404);
    assert.equal((await call('/manage/birthdays/customers/family','PUT',input,owner)).status,200);
    assert.equal((await call('/manage/birthdays/customers/family','PUT',input,owner)).status,409);
    await generateBirthdays(store,b); const draft=(await store.all(b.id,'birthdayDrafts')).find(d=>d.status==='prepared'); assert.ok(draft);
    await store.put(b.id,'customers',{...customer,doNotContact:true});
    assert.equal((await call(`/manage/birthdays/${draft.id}/complete`,'POST',{revision:1,note:'Handled'},owner)).status,409);
    assert.equal((await store.all(b.id,'contactHistory')).length,0);
    const exported=await call('/manage/export','GET',undefined,owner); assert.ok(Array.isArray(exported.data.birthdayProfiles));
  }finally{await new Promise(r=>server.close(r));store.db.close();}
});
