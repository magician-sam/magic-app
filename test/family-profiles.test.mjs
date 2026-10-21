import test from 'node:test';
import assert from 'node:assert/strict';
import {TestStore} from './store-fixture.mjs';
import {createApp} from '../dist/server.js';
import {familyChildren,familyAges,familySaveSchema} from '../dist/family-profiles.js';
import {birthdayChildKey} from '../dist/birthday-crm.js';

test('optional family values do not invent birthdays, reject photos/duplicate identities and preserve legacy reminder keys',()=>{
  const legacy={name:'A child',birthday:'2018-02-28'};
  const initial=familyChildren({children:[legacy]},{childrenAges:[8]});
  assert.equal(initial[0].birthday,legacy.birthday);
  assert.equal(birthdayChildKey({...legacy,id:initial[0].id}),birthdayChildKey(legacy));
  const ageOnly={id:'age-child',firstName:'',age:6,birthday:'',interests:'Bubbles'};
  assert.deepEqual(familyAges([ageOnly,{...ageOnly,id:'birthday-child',age:0,birthday:'2018-02-28'}],'2026-02-27'),[6,7]);
  const input={expectedVersion:'a'.repeat(64),children:[ageOnly]};
  assert.equal(familySaveSchema.safeParse(input).success,true);
  assert.equal(familySaveSchema.safeParse({...input,children:[{...ageOnly,photo:'image'}]}).success,false);
  assert.equal(familySaveSchema.safeParse({...input,children:[ageOnly,ageOnly]}).success,false);
  assert.equal(familySaveSchema.safeParse({...input,children:[{...ageOnly,birthday:'2025-02-30'}]}).success,false);
  assert.equal(ageOnly.birthday,'');
  const prior={...ageOnly,id:'dated',firstName:'Child',birthday:'2018-02-28',interests:'Bubbles'};
  assert.equal(familyChildren({children:[{id:'dated',name:'Child',birthday:'2017-02-28'}]},{family:[prior],childrenAges:[]})[0].birthday,'2017-02-28','staff correction wins over stale family snapshot');
  assert.deepEqual(familyChildren({children:[]},{family:[prior],childrenAges:[]}),[],'staff-removed date is not restored');
});

test('family edits are private, version-guarded, preserve preferences and suppress stale birthday drafts on removal',async()=>{
  const store=new TestStore(':memory:');const business=await store.createBusiness('Family test','family-test');await store.createBusiness('Other business','other');
  const origin='https://family.test';const server=createApp(store,origin).listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  const request=async(path,method='GET',body,cookie='')=>{const response=await fetch(base+'/api'+path,{method,headers:{origin,'content-type':'application/json',cookie},body:body===undefined?undefined:JSON.stringify(body)});return {status:response.status,body:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};};
  const register=async username=>request('/customer/family-test/register','POST',{name:username,username,phone:'+12025550123',password:'Family-test-42!'});
  try {
    const first=await register('parent_one'),second=await register('parent_two');assert.equal(first.status,201);
    const parent=(await store.all(business.id,'customers')).find(customer=>customer.name==='parent_one');
    const legacy={name:'Original child',birthday:'2018-02-28'};await store.put(business.id,'customers',{...parent,children:[legacy],offersConsent:false});
    const path='/customer/family-test/family';
    assert.equal((await request(path)).status,401);
    assert.equal((await request('/customer/other/family','GET',undefined,first.cookie)).status,401);
    const original=await request(path,'GET',undefined,first.cookie);assert.equal(original.status,200);
    assert.equal((await request(path,'GET',undefined,second.cookie)).body.children.length,0);
    assert.deepEqual((await store.get(business.id,'customers',parent.id)).children,[legacy],'read does not migrate records');
    const newChild={id:'anonymous',firstName:'',age:5,birthday:'',interests:'Magic and science'};
    const children=[...original.body.children,newChild];
    await store.put(business.id,'birthdayDrafts',{id:'own-draft',customerId:parent.id,childKey:birthdayChildKey(legacy),child:legacy.name,status:'prepared',revision:1});
    await store.put(business.id,'birthdayDrafts',{id:'other-draft',customerId:'other-family',childKey:'irrelevant',child:'Other child',status:'prepared',revision:1});
    const save=body=>request(path,'PUT',body,first.cookie);
    assert.equal((await save({expectedVersion:original.body.version,children:[{...newChild,birthday:'2999-01-01'}]})).status,400);
    assert.equal((await save({expectedVersion:original.body.version,children,customerId:'other-family'})).status,400);
    assert.equal((await save({expectedVersion:original.body.version,children})).status,200);
    assert.equal((await store.get(business.id,'birthdayDrafts','own-draft')).status,'prepared','unchanged legacy child retains dedup key');
    assert.equal((await save({expectedVersion:original.body.version,children:[]})).status,409);
    const stored=await store.get(business.id,'customers',parent.id);assert.equal(stored.offersConsent,false);assert.equal(stored.children.length,1);
    const profile={name:parent.name,username:'parent_one',phone:parent.phone,email:parent.email};
    assert.equal((await request('/customer/family-test/profile','PUT',profile,first.cookie)).status,200);
    assert.equal((await request(path,'GET',undefined,first.cookie)).body.children.length,2,'profile edit preserves richer family data');
    const current=await request(path,'GET',undefined,first.cookie);
    assert.equal((await save({expectedVersion:current.body.version,children:[newChild]})).status,200);
    assert.equal((await store.get(business.id,'birthdayDrafts','own-draft')).status,'suppressed');
    assert.equal((await store.get(business.id,'birthdayDrafts','other-draft')).status,'prepared');
    assert.equal((await store.get(business.id,'customers',parent.id)).children.length,0);
    const me=await request('/customer/family-test/me','GET',undefined,first.cookie);assert.equal(me.body.profile.familyCount,1);assert.deepEqual(me.body.profile.childrenAges,[5]);
    const latest=await request(path,'GET',undefined,first.cookie);assert.equal((await save({expectedVersion:latest.body.version,children:[]})).status,200);
    assert.equal((await request(path,'GET',undefined,first.cookie)).body.children.length,0);
  } finally {await new Promise(resolve=>server.close(resolve));await store.db.close();}
});
