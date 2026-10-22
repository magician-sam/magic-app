import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {readFile} from 'node:fs/promises';
import {TestStore} from './store-fixture.mjs';import {createApp} from '../dist/server.js';import {createUser} from '../dist/auth.js';
import {supplierOfficeFields} from '../dist/supplier-office.js';import {supplierCategoryKeys} from '../dist/supplier-types.js';
import {snapshot,restoreSnapshot} from '../dist/snapshots.js';

const details=()=>({name:'Synthetic artist and venue',contactName:'Fictional operator',phone:'+12025550123',email:'office@example.test',bio:'Synthetic application',area:'Test city',address:'Test location',notes:'Office visit',types:['artist','venue'],status:'draft',services:[{id:randomUUID(),type:'artist',name:'Fictional science act',description:'Test performance',priceMode:'suggested',suggestedFee:150,currency:'USD',tax:'unknown',duration:45,notes:'Transport to review'}]});
test('supplier type links preserve identities and office forms cannot forge consent, activation or public prices',()=>{
  const value=details();assert.equal(supplierOfficeFields.safeParse(value).success,true);
  assert.deepEqual(supplierCategoryKeys(['artist','venue','food','treats']),['shows','science','places','food','food-stations']);
  for(const extra of [{legalAcceptance:true},{access:'active'},{publication:'public'},{permissions:{owner:true}},{customerSellingPrice:999}])assert.equal(supplierOfficeFields.safeParse({...value,...extra}).success,false);
  assert.equal(supplierOfficeFields.safeParse({...value,types:['artist','artist']}).success,false);
  assert.equal(supplierOfficeFields.safeParse({...value,types:['food']}).success,false,'offering type must match selected profile types');
  assert.equal(supplierOfficeFields.safeParse({...value,services:[{...value.services[0],suggestedFee:0}]}).success,false);
  assert.equal(supplierOfficeFields.safeParse({...value,services:[{...value.services[0],priceMode:'quote',suggestedFee:150}]}).success,false);
});

test('office registrations are owner-only, tenant-scoped, retry-safe, revision-guarded and never create supplier access',async()=>{
  const store=new TestStore(':memory:');const b=await store.createBusiness('Office synthetic','office-test');const other=await store.createBusiness('Other synthetic','other-office');
  const password='Office-Test-42!';await createUser(store,b.id,'owner@example.test',password,'Owner');await createUser(store,other.id,'other@example.test',password,'Other');
  for(const role of ['performer','assistant','manager','sales','accountant'])await createUser(store,b.id,role+'@example.test',password,role,role);
  const origin='https://office.test';const server=createApp(store,origin).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
  const request=async(path,method='GET',body,cookie='')=>{const r=await fetch(base+'/api'+path,{method,headers:{origin,'content-type':'application/json',cookie},body:body===undefined?undefined:JSON.stringify(body)});return{status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};};
  const login=async email=>(await request('/login','POST',{email,password})).cookie;
  try{
    const owner=await login('owner@example.test'),foreign=await login('other@example.test');
    assert.equal((await request('/manage/supplier-desks')).status,401);
    for(const role of ['performer','assistant','manager','sales','accountant']){const cookie=await login(role+'@example.test');assert.equal((await request('/manage/supplier-desks','GET',undefined,cookie)).status,403);assert.equal((await request('/manage/supplier-desks','POST',{requestId:randomUUID(),details:details()},cookie)).status,403);}
    const input={requestId:randomUUID(),details:details()};const saved=await request('/manage/supplier-desks','POST',input,owner);assert.equal(saved.status,201);
    assert.equal(saved.data.legalAcceptance,null);assert.equal(saved.data.access,'not_activated');assert.equal(saved.data.publication,'private');assert.equal(saved.data.source,'office');
    assert.equal((await request('/manage/supplier-desks','POST',input,owner)).data.id,saved.data.id);
    assert.equal((await request('/manage/supplier-desks','POST',{...input,details:{...input.details,name:'Different payload'}},owner)).status,409);
    const list=await request('/manage/supplier-desks','GET',undefined,foreign);assert.equal(list.data.drafts.length,0);
    assert.equal((await request('/manage/supplier-desks/'+saved.data.id,'PUT',{revision:1,details:input.details},foreign)).status,404);
    const path='/manage/supplier-desks/'+saved.data.id;
    const results=await Promise.all([request(path,'PUT',{revision:1,details:{...input.details,name:'Edited A'}},owner),request(path,'PUT',{revision:1,details:{...input.details,name:'Edited B'}},owner)]);
    assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
    const latest=(await request('/manage/supplier-desks','GET',undefined,owner)).data.drafts[0];assert.equal(latest.revision,2);
    const image={mime:'image/jpeg',data:(await readFile(new URL('../public/portfolio/sam-magic-live-1.jpg',import.meta.url))).toString('base64')};
    assert.equal((await request(path+'/photos','POST',{revision:1,photo:image,caption:'Synthetic photo',permissionNote:'App-owned photo for test'},owner)).status,409);
    const upload=await request(path+'/photos','POST',{revision:2,photo:image,caption:'Synthetic photo',permissionNote:'App-owned photo for test'},owner);assert.equal(upload.status,201);
    assert.equal(upload.data.photos.length,1);const imagePath=path+'/photos/'+upload.data.photos[0].id;
    const bytes=await fetch(base+'/api'+imagePath,{headers:{cookie:owner}});assert.equal(bytes.status,200);assert.match(bytes.headers.get('cache-control'),/no-store/);assert.deepEqual(Buffer.from(await bytes.arrayBuffer()),Buffer.from(image.data,'base64'));
    assert.equal((await fetch(base+'/api'+imagePath,{headers:{cookie:foreign}})).status,404);assert.equal((await fetch(base+'/api'+imagePath)).status,401);
    const publicState=await request('/public/office-test');assert.equal(JSON.stringify(publicState.data).includes(input.details.phone),false);assert.equal(JSON.stringify(publicState.data).includes('supplierOffice'),false);
    const rows=await store.all(b.id,'audit');assert.ok(rows.some(row=>row.action==='supplier-office.photo-added'));assert.equal(JSON.stringify(rows).includes(image.data.slice(0,150)),false);
    const accounts=await store.db.prepare('SELECT count(*) AS n FROM customer_accounts').get();assert.equal(Number(accounts.n),0);
    const archived=await request(path,'PUT',{revision:3,details:{...input.details,status:'archived'}},owner);assert.equal(archived.status,200);assert.equal(archived.data.access,'not_activated');
    assert.equal((await request(path,'PUT',{revision:4,details:{...input.details,legalAcceptance:true}},owner)).status,400);
    const exported=await request('/manage/export','GET',undefined,owner);assert.equal(exported.status,200);assert.equal(exported.data.supplierOfficeDrafts[0].id,saved.data.id);assert.equal(exported.data.supplierOfficePhotos[0].data,image.data);
    const backup=await snapshot(store);assert.equal(backup.version,2,'office drafts add no database tables');
    const restored=new TestStore(':memory:');try{await restoreSnapshot(restored,backup);assert.equal((await restored.get(b.id,'supplierOfficeDrafts',saved.data.id)).status,'archived');assert.equal((await restored.get(b.id,'supplierOfficePhotos',upload.data.photos[0].id)).data,image.data);}finally{await restored.db.close?.();}
  }finally{await new Promise(r=>server.close(r));await store.db.close?.();}
});
