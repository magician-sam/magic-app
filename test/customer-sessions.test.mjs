import test from 'node:test';
import assert from 'node:assert/strict';
import {TestStore} from './store-fixture.mjs';
import {createApp} from '../dist/server.js';
import {hash} from '../dist/auth.js';

test('remembered customer sign-in has bounded server expiry and secure cookies; logout and password changes revoke access',async()=>{
  const store=new TestStore(':memory:');
  const business=await store.createBusiness('Session test','sessions');
  const origin='https://sessions.test';
  const server=createApp(store,origin).listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  const password='Session-test-42!';
  const request=async(path,method='GET',body,cookie='')=>{
    const response=await fetch(base+'/api/customer/sessions/'+path,{method,headers:{origin,'content-type':'application/json',cookie},body:body===undefined?undefined:JSON.stringify(body)});
    return {status:response.status,body:await response.json(),header:response.headers.get('set-cookie')||''};
  };
  const cookie=value=>value.split(';')[0];
  const sessionExpiry=async header=>Number((await store.db.prepare('SELECT expires FROM customer_sessions WHERE hash=?').get(hash(cookie(header).split('=')[1]))).expires);
  try {
    const short=await request('register','POST',{name:'Test parent',phone:'+12025550123',username:'session_parent',password});
    assert.equal(short.status,201);
    assert.doesNotMatch(short.header,/Max-Age|Expires=/i);
    assert.match(short.header,/HttpOnly/);assert.match(short.header,/Secure/);assert.match(short.header,/SameSite=Strict/);
    assert.ok(Math.abs(await sessionExpiry(short.header)-Date.now()-8*3600_000)<5000);
    const remembered=await request('login','POST',{username:'session_parent',password,rememberMe:true});
    assert.equal(remembered.status,200);assert.match(remembered.header,/Max-Age=2592000/);
    assert.ok(Math.abs(await sessionExpiry(remembered.header)-Date.now()-30*86400_000)<5000);
    assert.equal((await request('me','GET',undefined,cookie(remembered.header))).status,200);
    const profile={name:'Test parent',phone:'+12025550123',username:'session_parent',email:'parent@example.test',childrenAges:[]};
    assert.equal((await request('profile','PUT',profile,cookie(remembered.header))).status,403);
    assert.equal((await request('profile','PUT',{...profile,currentPassword:'Wrong-password'},cookie(remembered.header))).status,403);
    assert.equal((await request('profile','PUT',{...profile,currentPassword:password,offersConsent:true},cookie(remembered.header))).status,200);
    let me=await request('me','GET',undefined,cookie(remembered.header));
    assert.equal(me.body.profile.email,profile.email);assert.equal(me.body.profile.offersConsent,true);
    assert.equal((await request('profile','PUT',{...profile,name:'Edited name'},cookie(remembered.header))).status,200);
    me=await request('me','GET',undefined,cookie(remembered.header));assert.equal(me.body.profile.offersConsent,true,'omitted consent preserves existing preference');
    assert.equal((await request('profile','PUT',{...profile,offersConsent:false},cookie(remembered.header))).status,200);
    const audit=await store.all(business.id,'audit');
    assert.equal(JSON.stringify(audit).includes(password),false,'password confirmation is never audited');
    assert.equal(JSON.stringify(audit).includes('currentPassword'),false);
    const parent=(await store.all(business.id,'customers'))[0];
    await store.put(business.id,'bookings',{id:'own-event',customerId:parent.id,name:'Own event',date:'2026-10-01',status:'completed',quotes:[],packageIds:[],acceptedQuoteId:''});
    await store.put(business.id,'bookings',{id:'other-event',customerId:'different-family',name:'Other family event',date:'2026-10-01',status:'completed',quotes:[],packageIds:[],acceptedQuoteId:''});
    await store.put(business.id,'reviews',{id:'own-review',bookingId:'own-event',overall:5,text:'Own feedback',privateFeedback:'Excluded private field',photo:'Excluded photo',createdAt:'2026-10-21'});
    await store.put(business.id,'reviews',{id:'other-review',bookingId:'other-event',overall:1,text:'Other family feedback',createdAt:'2026-10-21'});
    const reviews=(await request('me','GET',undefined,cookie(remembered.header))).body.reviews;
    assert.deepEqual(reviews,[{id:'own-review',bookingId:'own-event',eventName:'Own event',overall:5,text:'Own feedback',createdAt:'2026-10-21'}]);
    assert.equal((await request('logout','POST',{},cookie(remembered.header))).status,200);
    assert.equal((await request('me','GET',undefined,cookie(remembered.header))).status,401);
    const next=await request('login','POST',{username:'session_parent',password,rememberMe:true});
    assert.equal((await request('password','POST',{currentPassword:password,password:'New-session-42!'},cookie(next.header))).status,200);
    assert.equal((await request('me','GET',undefined,cookie(next.header))).status,401);
    assert.equal((await request('me','GET',undefined,cookie(short.header))).status,401);
    assert.equal((await request('login','POST',{username:'session_parent',password:'New-session-42!',rememberMe:'true'})).status,400);
  } finally {await new Promise(resolve=>server.close(resolve));await store.db.close();}
});
