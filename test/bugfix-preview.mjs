// Fictional, memory-only fixture. Never connect this to production data.
import {Store} from '../dist/store.js';
import {createApp} from '../dist/server.js';
import {createUser} from '../dist/auth.js';
const store = new Store(':memory:');
const business = await store.createBusiness('Fictional regression business', 'magic-by-sam');
for (const role of ['owner','accountant']) await createUser(store, business.id, `audit-${role}@example.test`, 'Synthetic-audit-42!', `Fictional ${role}`, role);
const now = new Date().toISOString();
for (const [id, basis, salary, rate] of [['monthly','monthly',100000,0],['hourly','hourly',0,1500]]) await store.put(business.id,'finance', {
  id, data:{type:'employee',name:`Fictional ${basis} employee`,notes:'Synthetic only',position:'Fixture',email:'',phone:'',startDate:'2026-01-01',endDate:'',salary,payBasis:basis,hourlyRate:rate,taxReference:'',socialReference:'',contractNotes:''},
  status:'draft',archived:false,revision:1,currency:'USD',createdAt:now,updatedAt:now,
});
await store.put(business.id,'performers',{id:'marker',name:'Audit <b data-audit-marker="artist-name">marker</b>',bio:'Fictional output safety fixture only.',categories:['magic'],photo:'',video:'',areas:'Test',active:true,membershipVerified:false});
const origin = 'http://127.0.0.1:3245';
const server = createApp(store, origin).listen(3245,'127.0.0.1');
await new Promise(resolve => server.once('listening',resolve));
const login = await fetch(origin+'/api/login',{method:'POST',headers:{'content-type':'application/json',origin},body:JSON.stringify({email:'audit-owner@example.test',password:'Synthetic-audit-42!'})});
const cookie = login.headers.get('set-cookie')?.split(';')[0];
if (!login.ok || !cookie) throw Error('Fixture owner sign-in failed');
const details = {audience:'supplier',operator:'Fictional test operator',address:'Fictional test address',contact:'fixture@example.test',texts:Object.fromEntries(['en','fr','ar'].map(language=>[language,{summary:'Fictional registration notice for isolated testing only.',terms:'Fictional test terms, no commercial or legal use. '.repeat(12),privacy:'Fictional privacy notice for isolated software testing only. '.repeat(12)}]))};
for (const [path,method,body] of [
  ['/api/manage/registration-agreements/supplier','PUT',{revision:0,details}],
  ['/api/manage/registration-agreements/supplier/publish','POST',{revision:1,reviewConfirmed:true}],
]) {
  const response = await fetch(origin+path,{method,headers:{'content-type':'application/json',origin,cookie},body:JSON.stringify(body)});
  if (!response.ok) throw Error('Fictional fixture agreement setup failed: '+response.status+' '+await response.text());
}
console.log('Fictional bugfix preview ready on 3245. Memory only; no production records or messages.');
