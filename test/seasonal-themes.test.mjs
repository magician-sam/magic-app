import test from 'node:test';
import assert from 'node:assert/strict';
import {TestStore} from './store-fixture.mjs';
import {createUser} from '../dist/auth.js';
import {createApp} from '../dist/server.js';
import {themePresets,effectiveTheme,defaultSeasonalTheme} from '../dist/seasonal-themes.js';
import {snapshot,restoreSnapshot} from '../dist/snapshots.js';

test('seasonal dates use Beirut boundaries, include the end day and default safely',()=>{
  assert.equal(new Set(themePresets.map(p=>p.key)).size,12);
  const config={theme:'winter',startsOn:'2026-12-01',endsOn:'2026-12-31',animations:false};
  assert.equal(effectiveTheme(config,new Date('2026-11-30T21:59:59Z')),'standard');
  assert.equal(effectiveTheme(config,new Date('2026-11-30T22:00:00Z')),'winter');
  assert.equal(effectiveTheme(config,new Date('2026-12-31T21:59:59Z')),'winter');
  assert.equal(effectiveTheme(config,new Date('2026-12-31T22:00:00Z')),'standard');
  assert.equal(effectiveTheme({...config,startsOn:'',endsOn:''},new Date('2027-07-01')),'winter');
  assert.equal(effectiveTheme({...config,theme:'not-a-theme'}),'standard');
  assert.equal(effectiveTheme(defaultSeasonalTheme(),new Date('2027-01-07T00:00:00Z')),'standard');
});

test('theme settings are owner-only, tenant-scoped, revision guarded and backed up without affecting prices',async()=>{
  const store=new TestStore(':memory:'),business=await store.createBusiness('Synthetic themes','magic-by-sam'),other=await store.createBusiness('Other synthetic theme','other-theme');
  const password='Synthetic-Theme-42!';await createUser(store,business.id,'owner@example.test',password,'Owner');await createUser(store,other.id,'other@example.test',password,'Other');
  for(const role of ['manager','sales','accountant','assistant','performer'])await createUser(store,business.id,role+'@example.test',password,role,role);
  const origin='https://theme.test',server=createApp(store,origin).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const base='http://127.0.0.1:'+server.address().port;
  const request=async(path,method='GET',body,cookie='')=>{const r=await fetch(base+'/api'+path,{method,headers:{origin,'content-type':'application/json',cookie},body:body===undefined?undefined:JSON.stringify(body)});return{status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};};
  const login=async email=>(await request('/login','POST',{email,password})).cookie;
  const proposed={theme:'summer',startsOn:'2026-01-01',endsOn:'2027-12-31',animations:false};
  try{
    const owner=await login('owner@example.test'),foreign=await login('other@example.test');
    const original=(await request('/public/magic-by-sam')).data;
    assert.equal(original.seasonalTheme.theme,'christmas');
    assert.equal((await request('/manage/themes')).status,401);
    for(const role of ['manager','sales','accountant','assistant','performer']){const cookie=await login(role+'@example.test');assert.equal((await request('/manage/themes','GET',undefined,cookie)).status,403);assert.equal((await request('/manage/themes','PUT',{revision:0,settings:proposed},cookie)).status,403);}
    assert.equal((await request('/manage/themes','PUT',{revision:0,settings:{...proposed,theme:'<script>'}},owner)).status,400);
    assert.equal((await request('/manage/themes','PUT',{revision:0,settings:{...proposed,endsOn:'2026-02-30'}},owner)).status,400);
    assert.equal((await request('/manage/themes','PUT',{revision:0,settings:{...proposed,startsOn:'2027-01-01',endsOn:'2026-01-01'}},owner)).status,400);
    assert.equal((await request('/manage/themes','PUT',{revision:0,settings:{...proposed,discountPercent:15}},owner)).status,400);
    const results=await Promise.all([request('/manage/themes','PUT',{revision:0,settings:proposed},owner),request('/manage/themes','PUT',{revision:0,settings:{...proposed,theme:'winter'}},owner)]);
    assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
    const saved=(await request('/manage/themes','GET',undefined,owner)).data.settings;
    assert.equal(saved.revision,1);assert.equal(saved.animations,false);
    assert.equal((await request('/manage/themes','GET',undefined,foreign)).status,403);
    assert.equal((await request('/manage/themes','PUT',{revision:0,settings:proposed},foreign)).status,403);
    assert.equal((await request('/public/other-theme')).data.seasonalTheme.theme,'standard');
    const publicData=(await request('/public/magic-by-sam')).data;
    assert.equal(publicData.seasonalTheme.theme,saved.theme);assert.deepEqual(publicData.publicPrices,original.publicPrices);assert.deepEqual(publicData.packages,original.packages);assert.equal(Object.hasOwn(publicData.seasonalTheme,'revision'),false);
    const exported=await request('/manage/export','GET',undefined,owner);assert.equal(exported.data.seasonalThemes[0].theme,saved.theme);
    assert.ok((await store.all(business.id,'audit')).some(row=>row.action==='theme.saved'));
    const backup=await snapshot(store),restored=new TestStore(':memory:');assert.equal(backup.version,2);
    try{await restoreSnapshot(restored,backup);assert.deepEqual(await restored.get(business.id,'seasonalThemes','public'),saved);}finally{await restored.db.close?.();}
  }finally{await new Promise(r=>server.close(r));await store.db.close?.();}
});
