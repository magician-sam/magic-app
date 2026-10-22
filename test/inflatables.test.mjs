import test from 'node:test';import assert from 'node:assert/strict';import {access,readFile} from 'node:fs/promises';
import {inflatableCatalogue,inflatableItem,inflatablePhoto,inflatableDimensions} from '../dist/inflatable-catalogue.js';
import {inflatableMatchScore} from '../dist/inflatable-search.js';
import {guestServiceNames} from '../dist/guest-services.js';
import {serviceRequirementsMatch} from '../dist/service-requirements-schema.js';
import {TestStore} from './store-fixture.mjs';import {createUser} from '../dist/auth.js';import {createApp} from '../dist/server.js';
import {snapshot,restoreSnapshot} from '../dist/snapshots.js';

test('individual inventory retains independent photos, truthful dimensions and multilingual typo/size search',async()=>{
 assert.equal(inflatableCatalogue.length,177);assert.equal(new Set(inflatableCatalogue.map(i=>i.service)).size,177);assert.equal(new Set(inflatableCatalogue.map(i=>i.id)).size,177);
 for(const item of inflatableCatalogue){await access(new URL('../public'+inflatablePhoto(item),import.meta.url));assert.ok(item.service.length<=80);assert.ok(serviceRequirementsMatch({inflatables:{surface:'Grass'}},[item.service]));}
 const sea=inflatableItem('Inflatable · Sea Slide');assert.deepEqual(sea.dimensions,{length:8,width:5,height:6});assert.notEqual(inflatablePhoto(sea),inflatablePhoto(inflatableItem('Inflatable · Jellyfish Slide')));
 assert.equal(inflatableDimensions(inflatableItem('Inflatable · Pink Ball Pit')),null,'source H5m is questionable, never invent0.5m');
 for(const q of ['shrak','requin','قرش'])assert.notEqual(inflatableMatchScore(inflatableItem('Inflatable · Shark Slide'),q),null);
 assert.equal(inflatableMatchScore(sea,'8 x 5 x 6'),0);assert.equal(inflatableMatchScore(sea,'6 x 5 x 8'),null);assert.equal(inflatableMatchScore(inflatableItem('Inflatable · Fire Truck Slide'),'8 x 5 x 6'),null);
 const settings={catalogueAppearance:{['service:'+sea.service]:{name:'Sky Adventure',nameFr:'Ciel',nameAr:'مغامرة',description:'',descriptionFr:'',descriptionAr:'',cover:'',revision:1,dimensions:{length:7,width:3,height:4}}}};
 assert.equal(inflatableMatchScore(sea,'7×3×4',settings),0);assert.equal(inflatableMatchScore(sea,'sky',settings),0);assert.equal(inflatableMatchScore(sea,'8×5×6',settings),null);
 assert.ok(guestServiceNames([],[],'magic-by-sam').includes(sea.service));assert.ok(!guestServiceNames([],[],'other').includes(sea.service));assert.ok(!guestServiceNames([],[sea.service],'magic-by-sam').includes(sea.service));
 const source=await readFile(new URL('../src/inflatable-catalogue.ts',import.meta.url),'utf8');assert.ok(!source.includes('Downloads'));assert.ok(!source.includes('.pdf'));
});

test('equipment editing, prices and requests share stable identities with authorization and tenant isolation',async()=>{
 const store=new TestStore(':memory:'),b=await store.createBusiness('Fictional equipment','magic-by-sam'),other=await store.createBusiness('Other','other-equipment');const password='Synthetic-inflatable-42!';
 await createUser(store,b.id,'owner@example.test',password,'Owner');await createUser(store,other.id,'other@example.test',password,'Other');await createUser(store,b.id,'accountant@example.test',password,'Accountant','accountant');
 const origin='https://equipment.test',server=createApp(store,origin).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
 const request=async(path,method='GET',body,cookie='')=>{const r=await fetch(base+'/api'+path,{method,headers:{origin,'content-type':'application/json',cookie},body:body===undefined?undefined:JSON.stringify(body)});return{status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};};
 const login=async email=>(await request('/login','POST',{email,password})).cookie;
 try{
  const owner=await login('owner@example.test'),foreign=await login('other@example.test'),accountant=await login('accountant@example.test'),service='Inflatable · Sea Slide',path='/manage/catalogue-appearance/'+encodeURIComponent('service:'+service);
  const data={revision:0,name:'Sea Adventure',cover:'/portfolio/inflatables/sea-slide.webp',dimensions:{length:8,width:5,height:6}};
  assert.equal((await request(path,'PUT',data)).status,401);assert.equal((await request(path,'PUT',data,foreign)).status,404);assert.equal((await request(path,'PUT',data,accountant)).status,403);
  assert.equal((await request(path,'PUT',{...data,dimensions:{length:8,width:5}},owner)).status,400);assert.equal((await request(path,'PUT',{...data,dimensions:{length:0,width:5,height:6}},owner)).status,400);
  const concurrent=await Promise.all([request(path,'PUT',data,owner),request(path,'PUT',{...data,name:'Other name'},owner)]);assert.deepEqual(concurrent.map(r=>r.status).sort(),[200,409]);
  const pub=(await request('/public/magic-by-sam')).data;assert.deepEqual(pub.business.catalogueAppearance['service:'+service].dimensions,data.dimensions);
  const price=await request('/manage/finance/new','PUT',{revision:0,data:{type:'price',name:'Synthetic slide price',notes:'Private supplier notes',serviceId:service,priceMode:'from',salePrice:30000,cost:12000,taxId:'',inclusive:false}},owner);assert.equal(price.status,200,JSON.stringify(price.data));
  assert.equal((await request('/manage/finance/'+price.data.id+'/publish','POST',{revision:price.data.revision},owner)).status,200);
  const priced=(await request('/public/magic-by-sam')).data;assert.equal(priced.publicPrices.find(p=>p.serviceId===service).price,30000);assert.ok(!JSON.stringify(priced).includes('Private supplier notes'));assert.ok(!JSON.stringify(priced.publicPrices).includes('12000'));
  const parent=await request('/customer/magic-by-sam/register','POST',{name:'Synthetic parent',username:'equipment_parent',phone:'+12025550123',password});assert.equal(parent.status,201,JSON.stringify(parent.data));
  const event={name:'Synthetic slide enquiry',date:'2030-10-21',time:'15:00',location:'Fictional venue',occasion:'Birthday',audience:25,age:7,indoor:false,power:true,space:100,packageIds:[],requestedServices:[service,'Inflatable · Jellyfish Slide'],serviceRequirements:{inflatables:{surface:'Grass',dimensions:'20 by20 metres'}}};
  const created=await request('/public/magic-by-sam/requests','POST',{event},parent.cookie);assert.equal(created.status,201,JSON.stringify(created.data));assert.deepEqual((await store.get(b.id,'bookings',created.data.id)).requestedServices,event.requestedServices);
  await request('/manage/guest-services','POST',{action:'hide',name:service},owner);assert.equal((await request('/public/magic-by-sam/requests','POST',{event},parent.cookie)).status,400,'server rejects hidden product');
  const snap=await snapshot(store),restored=new TestStore(':memory:');try{await restoreSnapshot(restored,snap);assert.deepEqual((await restored.business(b.id)).catalogueAppearance['service:'+service].dimensions,data.dimensions);}finally{await restored.db.close();}
 }finally{await new Promise(r=>server.close(r));await store.db.close();}
});
