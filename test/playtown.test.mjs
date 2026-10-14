import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { TestStore as Store } from './store-fixture.mjs';
import { createApp } from '../dist/server.js';
import { playtown, playtownMatches } from '../dist/playtown.js';

test('Playtown prices match supplied sheet and bilingual location lookup',()=>{
  assert.deepEqual(playtown.passes.map(p=>p.usd),[15,20,20,25]);
  assert.deepEqual(playtown.memberships.map(p=>[p.basic,p.playtown]),[[125,170],[200,285]]);
  assert.ok(playtownMatches('بيروت','PLAYTOWN')); assert.ok(playtownMatches('Ain El Tineh','kart')); assert.equal(playtownMatches('Tripoli',''),false);
});
test('Play visits require an account; server snapshots prices, validates dates/counts and isolates retries',async()=>{
  const store=new Store(':memory:'); const business=await store.createBusiness('Magic by Sam','magic-by-sam');
  await store.createBusiness('Other','other'); const origin='http://localhost:43241';
  const server=createApp(store,origin).listen(43241,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const request=async(path,body,cookie='')=>{const r=await fetch(origin+'/api'+path,{method:'POST',headers:{origin,'content-type':'application/json',cookie},body:JSON.stringify(body)});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};};
  try {
    const body={requestId:randomUUID(),kind:'visit',date:'2030-10-20',time:'12:00',children:2,childAges:'4 and 7',paymentPreference:'whish',notes:'Local test',passes:[{id:'basic',quantity:1},{id:'playtown-artistic',quantity:1}]};
    const path='/public/magic-by-sam/playgrounds/playtown/requests';
    assert.equal((await request(path,body)).status,401);
    const register=await request('/customer/magic-by-sam/register',{name:'Test parent',phone:'+96170111222',password:'Test-password-42!',username:'playparent'});assert.equal(register.status,201);
    const cookie=register.cookie;
    for(const invalid of [{...body,children:3},{...body,referenceTotalUsd:1},{...body,paymentPreference:'card'},{...body,paymentPreference:'paid'},{...body,date:'2020-01-01'},{...body,passes:[{id:'fake',quantity:2}]},{...body,passes:[{id:'basic',quantity:1},{id:'basic',quantity:1}]}])assert.ok((await request(path,invalid,cookie)).status>=400);
    assert.equal((await request('/public/other/playgrounds/playtown/requests',body,cookie)).status,404);
    const created=await request(path,body,cookie);assert.equal(created.status,201);assert.equal(created.data.status,'requested');
    const again=await request(path,body,cookie);assert.equal(again.data.id,created.data.id);
    let bookings=await store.all(business.id,'bookings');assert.equal(bookings.length,1);
    assert.equal(bookings[0].playgroundRequest.referenceTotalUsd,40);assert.equal(bookings[0].playgroundRequest.passes[1].unitUsd,25);
    assert.equal(bookings[0].paymentPreference,'whish');assert.equal(bookings[0].playgroundRequest.paymentPreference,'whish');
    assert.equal((await store.all(business.id,'money')).length,0,'a payment preference never records money');
    assert.equal(bookings[0].quotes.length,0); assert.equal(bookings[0].customerId!==undefined,true);
    const event=await (await fetch(origin+'/api/event',{headers:{'x-event-token':again.data.path.split('#')[1]}})).json();
    assert.equal(event.booking.playgroundRequest.referenceTotalUsd,40);
    assert.equal(event.booking.paymentPreference,'whish');
    const party=await request(path,{...body,requestId:randomUUID(),kind:'party',paymentPreference:'on_arrival',passes:[]},cookie);assert.equal(party.status,201);
    bookings=await store.all(business.id,'bookings');assert.equal(bookings.find(b=>b.id===party.data.id).playgroundRequest.referenceTotalUsd,null);
    assert.equal(bookings.find(b=>b.id===party.data.id).paymentPreference,'on_arrival');
  }finally{await new Promise(r=>server.close(r));await store.db.close();}
});

