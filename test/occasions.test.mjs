import test from 'node:test';
import assert from 'node:assert/strict';
import {newOccasion,beirutDay,nextOccasionDate,promotionStarts,occasionNeedsReview,occasionReminder,occasionCalendarEntries,occasionPresets} from '../dist/occasions.js';
import {TestStore} from './store-fixture.mjs';
import {createUser} from '../dist/auth.js';
import {createApp} from '../dist/server.js';
import {snapshot,restoreSnapshot} from '../dist/snapshots.js';

test('Lebanese reference dates stay distinct and movable dates never guess a future year',()=>{
  assert.equal(newOccasion('mothers-day','2026-10-22').date,'2027-03-21');
  assert.equal(newOccasion('lebanese-childrens-day','2026-10-22').date,'2027-03-22');
  assert.equal(newOccasion('fathers-day','2026-10-22').date,'2027-06-21');
  assert.equal(newOccasion('world-childrens-day','2026-10-22').date,'2026-11-20');
  for(const id of ['western-easter','orthodox-easter','eid-fitr','eid-adha','school-season']){
    const plan=newOccasion(id,'2026-10-22');assert.equal(plan.date,'');assert.equal(plan.annual,false);assert.equal(plan.verifiedDate,'');
  }
  assert.equal(new Set(occasionPresets.map(p=>p.id)).size,occasionPresets.length);
  assert.equal(beirutDay(new Date('2026-10-21T21:30:00Z')),'2026-10-22');
});

test('annual preparation reminders and calendar markers respect year boundaries and fresh date review',()=>{
  const plan={...newOccasion('new-year','2026-10-22'),id:'example',revision:1,updatedAt:'',verifiedAt:'',verifiedDate:'2027-01-01'};
  assert.equal(promotionStarts(plan,'2026-10-22'),'2026-12-02');
  assert.equal(occasionNeedsReview(plan,'2026-10-22'),false);
  assert.equal(occasionReminder(plan,'2026-12-02').due,true);
  assert.equal(occasionReminder(plan,'2026-12-01').due,false);
  assert.equal(occasionNeedsReview(plan,'2027-01-02'),true,'next year never inherits date confirmation');
  assert.equal(nextOccasionDate({...plan,date:'2024-02-29'},'2025-03-01'),'2028-02-29');
  assert.equal(nextOccasionDate({...plan,date:'2026-02-30'},'2026-01-01'),'');
  assert.deepEqual(occasionCalendarEntries([plan],'2026-12').map(p=>[p.date,p.kind]),[['2026-12-02','preparation']]);
  assert.deepEqual(occasionCalendarEntries([plan],'2027-01').map(p=>[p.date,p.kind]),[['2027-01-01','occasion']]);
  assert.equal(occasionCalendarEntries([{...plan,status:'archived'}],'2027-01').length,0);
  assert.equal(occasionReminder({...plan,annual:false,date:'2026-01-01'},'2026-10-22'),null);
});

test('occasion plans are private, owner-only, scoped, revision-safe and fully recoverable without publishing',async()=>{
  const store=new TestStore(':memory:'),business=await store.createBusiness('Synthetic occasions','magic-by-sam'),other=await store.createBusiness('Other occasion business','occasion-other');
  const password='Synthetic-Occasion-42!';
  await createUser(store,business.id,'owner@example.test',password,'Synthetic owner');
  await createUser(store,other.id,'other@example.test',password,'Other owner');
  for(const role of ['manager','sales','accountant','assistant','performer'])await createUser(store,business.id,role+'@example.test',password,role,role);
  const packages=await store.all(business.id,'packages'),first=packages[0],second=packages[1];
  await store.put(business.id,'packages',{...first,id:'own-bundle',name:'Fictional family bundle',active:true,bundleIds:[first.id,second.id]});
  await store.put(other.id,'packages',{...first,id:'foreign-bundle',active:true,bundleIds:[first.id]});
  const origin='https://occasion.test',server=createApp(store,origin).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const base='http://127.0.0.1:'+server.address().port;
  const request=async(path,method='GET',body,cookie='')=>{const r=await fetch(base+'/api'+path,{method,headers:{origin,'content-type':'application/json',cookie},body:body===undefined?undefined:JSON.stringify(body)});return{status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};};
  const login=async email=>(await request('/login','POST',{email,password})).cookie;
  try{
    const owner=await login('owner@example.test'),foreign=await login('other@example.test'),original=(await request('/public/magic-by-sam')).data;
    assert.equal((await request('/manage/occasions')).status,401);
    for(const role of ['manager','sales','accountant','assistant','performer']){const cookie=await login(role+'@example.test');assert.equal((await request('/manage/occasions','GET',undefined,cookie)).status,403);assert.equal((await request('/manage/occasions','POST',{},cookie)).status,403);}
    const plan={...newOccasion('mothers-day','2030-01-01'),name:'Fictional Mother’s Day',headline:'Celebrate together',adText:'A fictional family celebration draft.',bundleIds:['own-bundle'],notes:'Private planning note'};
    const save=body=>request('/manage/occasions','POST',{revision:0,plan:body},owner);
    assert.equal((await save({...plan,date:'2030-02-30'})).status,400);
    assert.equal((await save({...plan,sourceUrl:'javascript:alert(1)'})).status,400);
    assert.equal((await save({...plan,bundleIds:['foreign-bundle']})).status,400);
    assert.equal((await save({...plan,status:'ready'})).status,400);
    assert.equal((await save({...newOccasion('eid-fitr'),date:'2030-03-01',annual:true})).status,400);
    const created=await save(plan);assert.equal(created.status,200);assert.equal(created.data.revision,1);const saved=created.data;
    assert.equal((await request('/manage/occasions','GET',undefined,foreign)).data.plans.length,0);
    assert.equal((await request('/manage/occasions/'+saved.id,'PUT',{revision:1,plan},foreign)).status,404);
    const reviewed={...plan,status:'ready',verifiedDate:plan.date};
    const concurrent=await Promise.all([request('/manage/occasions/'+saved.id,'PUT',{revision:1,plan:reviewed},owner),request('/manage/occasions/'+saved.id,'PUT',{revision:1,plan:reviewed},owner)]);
    assert.deepEqual(concurrent.map(r=>r.status).sort(),[200,409]);
    const updated=(await request('/manage/occasions','GET',undefined,owner)).data.plans[0];assert.equal(updated.revision,2);assert.ok(updated.verifiedAt);assert.equal(updated.status,'ready');
    assert.equal((await request('/manage/occasions/'+saved.id,'PUT',{revision:2,plan:{...reviewed,date:'2031-03-21'}},owner)).status,400);
    const publicData=(await request('/public/magic-by-sam')).data;
    assert.deepEqual(publicData.packages,original.packages);assert.deepEqual(publicData.publicPrices,original.publicPrices);assert.deepEqual(publicData.seasonalTheme,original.seasonalTheme);
    assert.equal(JSON.stringify(publicData).includes('Private planning note'),false);
    assert.equal((await store.all(business.id,'bookings')).length,0);
    assert.ok((await store.all(business.id,'audit')).some(a=>a.action==='occasion.updated'));
    const exported=await request('/manage/export','GET',undefined,owner);assert.deepEqual(exported.data.occasionPlans,[updated]);
    const backup=await snapshot(store),restored=new TestStore(':memory:');try{await restoreSnapshot(restored,backup);assert.deepEqual(await restored.get(business.id,'occasionPlans',saved.id),updated);}finally{await restored.db.close?.();}
  }finally{await new Promise(r=>server.close(r));await store.db.close?.();}
});
