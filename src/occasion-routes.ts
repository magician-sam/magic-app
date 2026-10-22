import {z} from 'zod';
import type {Express,Request} from 'express';
import type {Business,User,Package} from './models.js';
import type {Store} from './store.js';
import {id} from './store.js';
import {date,requireThat} from './domain.js';
import {writeRoutes} from './write-routes.js';
import {beirutDay,nextOccasionDate,occasionPresets,type OccasionPlan} from './occasions.js';
export const occasionKind='occasionPlans';
const text=(max:number)=>z.string().trim().max(max);
const fields=z.object({name:text(100).min(1),nameFr:text(100),nameAr:text(100),date:z.union([z.literal(''),date]),annual:z.boolean(),leadDays:z.number().int().min(0).max(365),status:z.enum(['draft','ready','archived']),bundleIds:z.array(z.string().min(1).max(100)).max(30).refine(v=>new Set(v).size===v.length,'Choose each bundle only once.'),headline:text(160),adText:text(3000),adTextFr:text(3000),adTextAr:text(3000),offerTerms:text(1500),notes:text(3000),calendarType:z.enum(['observance','public-holiday','custom']),sourceUrl:z.union([z.literal(''),z.url().max(1000).refine(v=>v.startsWith('https://'),'Use an HTTPS source link.')]),verifiedDate:z.union([z.literal(''),date]),presetId:text(60).refine(v=>!v||occasionPresets.some(p=>p.id===v),'Choose a known calendar reference.')}).strict()
  .refine(v=>!v.annual||!!v.date,'Choose a date before enabling annual recurrence.')
  .refine(v=>!v.annual||!v.presetId||!!occasionPresets.find(p=>p.id===v.presetId)?.monthDay,'Confirm this occasion separately for each year; it cannot repeat on a fixed date.')
  .refine(v=>!v.verifiedDate||!!v.sourceUrl,'Add the original source link before confirming the date.')
  .refine(v=>v.status!=='ready'||!!(v.date&&v.headline&&v.adText),'Add an event date, headline and English advertising text before marking the plan ready.');
export function occasionRoutes(app:Express,store:Store){
  type Staff=Request&{user:User;business:Business};
  const owner=(req:Staff)=>requireThat(['owner','admin'].includes(req.user.role),'Only the owner can manage occasion campaigns.',403);
  app.get('/api/manage/occasions',async(request,res)=>{
    const req=request as Staff;owner(req);
    const bundles=(await store.all<Package>(req.business.id,'packages')).filter(p=>p.bundleIds?.length).map(p=>({id:p.id,name:p.name,active:p.active}));
    res.set('Cache-Control','no-store').json({plans:await store.all<OccasionPlan>(req.business.id,occasionKind),bundles,presets:occasionPresets});
  });
  const writes=writeRoutes(app,store);
  const save=async(request:Request,create:boolean)=>{
    const req=request as Staff;owner(req);
    const input=z.object({revision:z.number().int().nonnegative(),plan:fields}).strict().parse(req.body);
    const key=create?id():z.uuid().parse(req.params.id);
    const previous=create?undefined:await store.get<OccasionPlan>(req.business.id,occasionKind,key);
    requireThat(create||previous,'Occasion not found.',404);
    requireThat(input.revision===(previous?.revision??0),'This occasion changed in another window. Reload it before saving.',409);
    if(create)requireThat((await store.all(req.business.id,occasionKind)).length<300,'Archive and reuse an existing occasion; the calendar limit is 300 plans.');
    for(const bundleId of input.plan.bundleIds){const bundle=await store.get<Package>(req.business.id,'packages',bundleId);requireThat(bundle?.bundleIds?.length,'Choose a bundle belonging to this business.');requireThat(input.plan.status!=='ready'||bundle.active,'A linked bundle is inactive. Activate it or keep this plan as a draft.');}
    const target=nextOccasionDate(input.plan);
    requireThat(input.plan.status!=='ready'||(target>=beirutDay()&&input.plan.verifiedDate===target&&!!input.plan.sourceUrl),'Check the original source and confirm this year’s event date before marking the plan ready.');
    const value:OccasionPlan={...input.plan,id:key,revision:input.revision+1,updatedAt:new Date().toISOString(),verifiedAt:input.plan.verifiedDate?(previous?.verifiedDate===input.plan.verifiedDate&&previous?.sourceUrl===input.plan.sourceUrl?previous.verifiedAt:new Date().toISOString()):''};
    await store.put(req.business.id,occasionKind,value);
    await store.audit(req.business.id,req.user.email,create?'occasion.created':'occasion.updated',key,previous??null,value);
    return value;
  };
  writes.post('/api/manage/occasions',async(req,res)=>{res.json(await save(req,true));});
  writes.put('/api/manage/occasions/:id',async(req,res)=>{res.json(await save(req,false));});
}
