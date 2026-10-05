import test from 'node:test';
import assert from 'node:assert/strict';
import {dateMentions,extractEventDates} from '../scripts/extract-event-dates.mjs';
import {TestStore as Store} from './store-fixture.mjs';
import {createApp} from '../dist/server.js';
import {createUser} from '../dist/auth.js';
test('historical dates flag inferred years and ambiguous dates, reject impossible dates and unrelated chat periods',()=>{
  assert.deepEqual(dateMentions('Birthday 23 February 2024','2024-02-01')[0],{date:'2024-02-23',mention:'23 February 2024',yearInferred:false,dayMonthAmbiguous:false});
  assert.equal(dateMentions('7/8','2024-07-01')[0].dayMonthAmbiguous,true);assert.equal(dateMentions('7/8','2024-07-01')[0].yearInferred,true);assert.deepEqual(dateMentions('31/2/2024','2024-01-01'),[]);
  const c={id:'a',chatIds:['chat'],history:[{enquiryDate:'2024-02-01',lastDiscussed:'2024-02-01'}]};
  const rows=[{chat_id:'chat',timestamp_local:'2024-02-01T10:00:00',content:'My birthday party is 23 February 2024',message_id:'m1'},{chat_id:'chat',timestamp_local:'2025-02-01T10:00:00',content:'Happy birthday on 23 February',message_id:'m2'}];
  const result=extractEventDates([c],rows,'2026-10-05');assert.equal(result[0].dates.length,1);assert.equal(result[0].dates[0].completionVerified,false);
});
test('past date imports are private, create review tasks without bookings, and confirmation schedules a safe anniversary',async()=>{
  const store=new Store(':memory:'),business=await store.createBusiness('Dates','dates'),other=await store.createBusiness('Other','dates-other');const password='Dates-test-42!';
  for(const [email,bid,role]of [['dates@test.example',business.id,'owner'],['dates-manager@test.example',business.id,'manager'],['dates-other@test.example',other.id,'owner']])await createUser(store,bid,email,password,email,role);
  const server=createApp(store,'http://localhost').listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const origin=`http://127.0.0.1:${server.address().port}`;
  const post=async(path,body,cookie)=>{const response=await fetch(origin+'/api'+path,{method:'POST',headers:{origin:'http://localhost','content-type':'application/json',...(cookie?{cookie}:{})},body:JSON.stringify(body)});return{status:response.status,data:await response.json(),headers:response.headers};};const login=async email=>(await post('/login',{email,password})).headers.get('set-cookie').split(';')[0];
  try{
    const owner=await login('dates@test.example'),manager=await login('dates-manager@test.example'),foreign=await login('dates-other@test.example');const id='d'.repeat(32),sourceHash='e'.repeat(64);
    await store.put(business.id,'customers',{id:'customer',name:'Saved parent label',phone:'+96170123456',children:[],offersConsent:false,doNotContact:false});await store.put(business.id,'whatsappCustomerReview',{id,sourceHash,customerId:'customer',nameNeedsReview:true});
    const item={date:'2024-02-29',mention:'29 February 2024',yearInferred:false,dayMonthAmbiguous:false,occasion:'birthday',cancelMentioned:false,enquiryDate:'2024-02-01',evidenceId:'m1',completionVerified:false},input={sourceHash,contacts:[{id,dates:[item]}]};
    assert.equal((await post('/manage/whatsapp/customers/event-dates',input,manager)).status,403);assert.equal((await post('/manage/whatsapp/customers/event-dates',input,foreign)).status,404);
    assert.equal((await post('/manage/whatsapp/customers/event-dates',input,owner)).data.reminders,1);assert.equal((await post('/manage/whatsapp/customers/event-dates',input,owner)).data.saved,0);
    const review=(await store.all(business.id,'reminders'))[0];assert.equal(review.dateNeedsReview,true);assert.equal(review.marketing,true);assert.equal((await store.all(business.id,'bookings')).length,0);
    assert.equal((await post(`/manage/reminders/${review.id}/contact`,{confirmed:true,revision:1,channel:'whatsapp',summary:'Test',date:'2026-10-05'},owner)).status,409);
    assert.equal((await post(`/manage/whatsapp/customers/${id}/event-date`,{candidateDate:item.date,eventDate:item.date,verified:false},owner)).status,400);
    const confirmed=await post(`/manage/whatsapp/customers/${id}/event-date`,{candidateDate:item.date,eventDate:item.date,verified:true},owner);assert.equal(confirmed.status,200);assert.match(confirmed.data.date,/02-28$|02-29$/);
    await post(`/manage/whatsapp/customers/${id}/event-date`,{candidateDate:item.date,eventDate:item.date,verified:true},owner);assert.equal((await store.all(business.id,'reminders')).length,2);
    const customer=await store.get(business.id,'customers','customer');assert.deepEqual(customer.children,[]);assert.equal(customer.offersConsent,false);assert.equal((await store.all(business.id,'contactHistory')).length,0);
    const annual=(await store.all(business.id,'reminders')).find(r=>!r.dateNeedsReview);assert.equal((await post(`/manage/reminders/${annual.id}/contact`,{confirmed:true,revision:1,channel:'whatsapp',summary:'Test',date:'2026-10-05'},owner)).status,409);
  }finally{await new Promise(r=>server.close(r));store.db.close();}
});
