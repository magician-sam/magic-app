import {snapshot,restoreSnapshot} from '../dist/snapshots.js';
import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {TestStore} from './store-fixture.mjs';import {createApp} from '../dist/server.js';import {createUser} from '../dist/auth.js';
import {serviceRequirementsSchema,serviceRequirementsMatch} from '../dist/service-requirements-schema.js';
import {selectedRequirementGroups,isInflatableService,isFoodStationService} from '../dist/service-requirements.js';
import {guestServiceNames} from '../dist/guest-services.js';import {marketplaceCategoryCards} from '../dist/catalogue-settings.js';
import {matchesMultilingual,multilingualTerms} from '../dist/multilingual-search.js';
import {inspirationPhotoSchema} from '../dist/event-inspiration.js';
import {marketplaceCollections} from '../dist/category-collections.js';
import {categoryBackground,categoryBackgroundKeys} from '../dist/category-backgrounds.js';
import {translateCustomerCopy} from '../dist/customer-language.js';

test('food machines and inflatables have separate discovery, typed inquiries and no budget question',()=>{
  const names=guestServiceNames();assert.equal(names.filter(isInflatableService).length,4);assert.equal(names.filter(isFoodStationService).length,7);
  assert.equal(names.filter(name=>name==='Slush Machine').length,1,'Frisco is an alias of the existing slush offering, not duplicate inventory');
  assert.notEqual(marketplaceCategoryCards.find(c=>c[3]==='food-stations')[2],marketplaceCategoryCards.find(c=>c[3]==='inflatables')[2]);
  const treats=marketplaceCategoryCards.find(c=>c[3]==='food-stations');assert.equal(treats[0],'Popcorn & more');assert.equal(treats[2],'#browse-treats');
  for(const [, , target] of marketplaceCategoryCards)if(target.startsWith('#browse-'))assert.ok(Object.hasOwn(marketplaceCollections,target),'focused category has an explicit route');
  for(const name of names.filter(isFoodStationService)){assert.equal(marketplaceCollections['#browse-treats'].match.test(name),true);assert.equal(marketplaceCollections['#browse-food'].match.test(name),false);assert.equal(marketplaceCollections['#browse-inflatables'].match.test(name),false);}
  assert.equal(marketplaceCollections['#browse-food'].match.test('Food & Beverages'),true);assert.equal(marketplaceCollections['#browse-food'].match.test('Cakes'),true);
  assert.equal(categoryBackgroundKeys.length,marketplaceCategoryCards.length);assert.ok(categoryBackground({},'places').startsWith('/category-art/'));assert.equal(categoryBackground({catalogueAppearance:{'category:places':{cover:'https://example.test/owned.jpg'}}},'places'),'https://example.test/owned.jpg');
  assert.equal(translateCustomerCopy('Slush Machine','en'),'Frisco / Slush');
  assert.deepEqual(selectedRequirementGroups(['Popcorn Station']).map(g=>g.key),['foodStations']);
  assert.deepEqual(selectedRequirementGroups(['Inflatable Castles']).map(g=>g.key),['inflatables']);
  assert.equal(serviceRequirementsSchema.safeParse({decoration:{budget:'100'}}).success,false);
  assert.equal(serviceRequirementsSchema.safeParse({foodStations:{servings:'-1'}}).success,false);
  assert.equal(serviceRequirementsSchema.safeParse({foodStations:{serviceMode:'Invented guaranteed service'}}).success,false);
  assert.equal(serviceRequirementsMatch({foodStations:{}},['Inflatable Castles']),false);
  assert.equal(serviceRequirementsMatch({decoration:{theme:'Purple'},inflatables:{surface:'Grass'}},['Decoration','Inflatable Castles']),true);
  assert.equal(matchesMultilingual(multilingualTerms(['Popcorn Station']),'بوشار'),true);
  assert.equal(matchesMultilingual(multilingualTerms(['Inflatable Castles']),'chateaux gonflables'),true);
  assert.equal(matchesMultilingual(multilingualTerms(['Popcorn Station']),'popcron'),true);
  for(const query of ['frisco','sluch','فريسكو'])assert.equal(matchesMultilingual(multilingualTerms(['Slush Machine']),query),true);
  assert.equal(inspirationPhotoSchema.safeParse({mime:'image/jpeg',data:Buffer.from([255,216,255,1,255,217]).toString('base64')}).success,false,'a JPEG prefix alone is not an image frame');
});

test('separate service enquiries retain structured specifications privately and reject unrelated options',async()=>{
 const store=new TestStore(':memory:'),b=await store.createBusiness('Options fixture','options-fixture');
 await createUser(store,b.id,'options-owner@example.test','Synthetic-options-42!','Test owner');
 const origin='https://options.test',server=createApp(store,origin).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const base='http://127.0.0.1:'+server.address().port;
 const post=async body=>{const response=await fetch(base+'/api/public/options-fixture/enquiries',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)});return{status:response.status,data:await response.json()};};
 try{
   const input={service:'Food & Beverages',name:'Fictional parent',phone:'+12025550123',date:'2026-12-10',location:'Synthetic venue',notes:'Fictional enquiry only',serviceRequirements:{catering:{guests:'60',menu:'Vegetarian buffet',dietary:'Discuss nut allergies',timing:'Lunch'}}};
   const saved=await post(input);assert.equal(saved.status,201);
   const row=await store.get(b.id,'enquiries',saved.data.id);assert.deepEqual(row.serviceRequirements,input.serviceRequirements);
   const login=await fetch(base+'/api/login',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({email:'options-owner@example.test',password:'Synthetic-options-42!'})});const cookie=login.headers.get('set-cookie').split(';')[0];
   const edit=await fetch(base+'/api/manage/enquiries/'+row.id,{method:'PUT',headers:{origin,cookie,'content-type':'application/json'},body:JSON.stringify({...input,revision:0,serviceRequirements:{catering:{guests:'80',menu:'Updated fictional buffet'}}})});assert.equal(edit.status,200);assert.equal((await edit.json()).serviceRequirements.catering.guests,'80');
   assert.equal(row.status,'new');assert.equal((await store.all(b.id,'bookings')).length,0);
   assert.equal((await post({...input,serviceRequirements:{inflatables:{surface:'Grass'}}})).status,400);
   assert.equal((await post({...input,serviceRequirements:{catering:{guests:'-1'}}})).status,400);
   assert.equal((await post({...input,serviceRequirements:{catering:{guaranteedPrice:'1'}}})).status,400);
   const publicResponse=await fetch(base+'/api/public/options-fixture');assert.equal((await publicResponse.text()).includes('Vegetarian buffet'),false);
   const restored=new TestStore(':memory:');try{await restoreSnapshot(restored,await snapshot(store));assert.equal((await restored.get(b.id,'enquiries',saved.data.id)).serviceRequirements.catering.guests,'80');}finally{await restored.db.close();}
 }finally{await new Promise(r=>server.close(r));await store.db.close();}
});

test('combined inquiries preserve private requirements and reference image, enforce scope, and invalidate old quotes on scope edits',async()=>{
  const store=new TestStore(':memory:'),b=await store.createBusiness('Inquiry test','inquiries');const other=await store.createBusiness('Other','other-inquiries');
  const password='Synthetic-inquiry-42!';await createUser(store,b.id,'owner@example.test',password,'Owner');await createUser(store,b.id,'accountant@example.test',password,'Accountant','accountant');await createUser(store,other.id,'other@example.test',password,'Other');
  const origin='https://inquiry.test',server=createApp(store,origin).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
  const request=async(path,method='GET',body,cookie='',token='')=>{const r=await fetch(base+'/api'+path,{method,headers:{origin,'content-type':'application/json',cookie,'x-event-token':token},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};};
  const login=async email=>(await request('/login','POST',{email,password})).cookie;
  try{
    const parent=await request('/customer/inquiries/register','POST',{name:'Synthetic parent',username:'parent_inquiry',phone:'+12025550123',password});
    const owner=await login('owner@example.test'),accountant=await login('accountant@example.test'),foreign=await login('other@example.test');
    const inspiration={mime:'image/jpeg',data:(await readFile(new URL('../public/portfolio/sam-magic-live-1.jpg',import.meta.url))).toString('base64')};
    const event={name:'Synthetic combined event',date:'2030-10-21',time:'15:00',location:'Test venue',occasion:'Birthday',audience:25,age:7,indoor:false,power:true,space:100,packageIds:[],requestedServices:['Decoration','Inflatable Castles','Popcorn Station'],serviceRequirements:{decoration:{theme:'Purple',elements:'Children tables and labels'},inflatables:{surface:'Grass'},foodStations:{servings:'30',serviceMode:'Staffed station with ingredients',dietary:'Discuss nut allergy'}}};
    assert.equal((await request('/public/inquiries/requests','POST',{event,inspiration})).status,401);
    assert.equal((await request('/public/inquiries/requests','POST',{event:{...event,requestedServices:['Inflatable Castles']},inspiration},parent.cookie)).status,400);
    assert.equal((await request('/public/inquiries/requests','POST',{event,inspiration:{mime:'image/svg+xml',data:'PHN2Zy8+'}},parent.cookie)).status,400);
    const created=await request('/public/inquiries/requests','POST',{event,inspiration},parent.cookie);assert.equal(created.status,201,JSON.stringify(created.data));
    const id=created.data.id,token=created.data.path.split('#')[1],photoPath='/manage/bookings/'+id+'/inspiration';
    assert.equal((await request('/event/inspiration')).status,404);assert.equal((await request(photoPath)).status,401);assert.equal((await request(photoPath,'GET',undefined,accountant)).status,403);assert.equal((await request(photoPath,'GET',undefined,foreign)).status,404);
    assert.deepEqual((await request('/event/inspiration','GET',undefined,'',token)).data,inspiration);
    assert.deepEqual((await request(photoPath,'GET',undefined,owner)).data,inspiration);
    const saved=await store.get(b.id,'bookings',id);assert.deepEqual(saved.serviceRequirements,event.serviceRequirements);
    assert.deepEqual((await request('/event','GET',undefined,'',token)).data.booking.serviceRequirements,event.serviceRequirements);
    const accounting=(await request('/manage/state','GET',undefined,accountant)).data.bookings.find(x=>x.id===id);assert.equal(accounting.serviceRequirements,undefined);
    assert.equal(JSON.stringify((await request('/public/inquiries')).data).includes(inspiration.data),false);
    assert.equal(JSON.stringify(await store.all(b.id,'audit')).includes(inspiration.data),false,'raw reference image excluded from audit');
    await store.put(b.id,'bookings',{...saved,status:'quoted',quotes:[{id:'old',name:'Old scope',packageIds:[],amount:20000,deposit:5000,notes:'Old scope'}]});
    const edit={...saved,serviceRequirements:{...event.serviceRequirements,decoration:{theme:'Green'}},travel:30,breakMinutes:10,venueNotes:'',backupPerformerIds:[],checklist:[],performerIds:[]};
    const updated=await request('/manage/bookings/'+id+'/details','PUT',edit,owner);assert.equal(updated.status,200,JSON.stringify(updated.data));assert.equal(updated.data.quotes.length,0);assert.equal(updated.data.status,'availability_pending');
    assert.equal((await request('/manage/bookings/'+id+'/details','PUT',{...edit,removeInspiration:true},owner)).status,409,'stale edit cannot delete reference');
    assert.equal((await request(photoPath,'GET',undefined,owner)).status,200);
    const removed=await request('/manage/bookings/'+id+'/details','PUT',{...edit,revision:updated.data.revision,removeInspiration:true},owner);assert.equal(removed.status,200);assert.equal((await request('/event/inspiration','GET',undefined,'',token)).status,404);assert.equal(await store.get(b.id,'eventInspiration',id),undefined);
  }finally{await new Promise(r=>server.close(r));await store.db.close();}
});
