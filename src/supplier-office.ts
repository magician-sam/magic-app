import type {Express, Request} from 'express';
import {z} from 'zod';
import {createHash} from 'node:crypto';
import type {Store} from './store.js';
import {id} from './store.js';
import type {User, Business} from './models.js';
import {requireThat} from './domain.js';
import {writeRoutes} from './write-routes.js';
import {inspirationPhotoSchema, type InspirationPhoto} from './event-inspiration.js';
import {supplierTypes, supplierCategoryKeys, type SupplierOfficeDraft} from './supplier-types.js';

const typeSchema=z.enum(supplierTypes.map(item=>item[0]));
const service=z.object({id:z.uuid(),type:typeSchema,name:z.string().trim().min(1).max(200),description:z.string().trim().max(2000),
  priceMode:z.enum(['quote','suggested']),suggestedFee:z.number().nonnegative().max(1e12).nullable(),currency:z.enum(['USD','LBP','EUR']),
  tax:z.enum(['unknown','included','excluded']),duration:z.number().int().min(1).max(1440).nullable(),notes:z.string().trim().max(1500),
}).strict().refine(v=>v.priceMode==='quote'?v.suggestedFee===null:v.suggestedFee!==null&&v.suggestedFee>0,'Enter a positive proposed fee, or choose quote required.');
export const supplierOfficeFields=z.object({
  name:z.string().trim().min(1).max(200),contactName:z.string().trim().max(200),phone:z.string().trim().max(50),email:z.union([z.literal(''),z.email().max(200)]),
  bio:z.string().trim().max(4000),area:z.string().trim().max(300),address:z.string().trim().max(500),notes:z.string().trim().max(3000),
  types:z.array(typeSchema).min(1).max(supplierTypes.length),status:z.enum(['draft','review','archived']),services:z.array(service).max(30),
}).strict().superRefine((v,ctx)=>{
  if(new Set(v.types).size!==v.types.length)ctx.addIssue({code:'custom',path:['types'],message:'Choose each supplier type once.'});
  if(new Set(v.services.map(s=>s.id)).size!==v.services.length)ctx.addIssue({code:'custom',path:['services'],message:'Each service needs its own reference.'});
  if(v.services.some(s=>!v.types.includes(s.type)))ctx.addIssue({code:'custom',path:['services'],message:'Each service must belong to a selected supplier type.'});
  if(v.status==='review'&&!v.phone&&!v.email)ctx.addIssue({code:'custom',path:['phone'],message:'Add a contact phone or email before review.'});
});
type StaffRequest=Request&{user:User;business:Business};
type PrivatePhoto=InspirationPhoto&{id:string;supplierId:string;caption:string;permissionNote:string};
const kind='supplierOfficeDrafts';
const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function supplierOfficeRoutes(app:Express,store:Store) {
  const writes=writeRoutes(app,store);
  const owner=(req:StaffRequest)=>requireThat(['owner','admin'].includes(req.user.role),'Only the owner can manage office supplier registrations.',403);
  const owned=async(req:StaffRequest)=>{owner(req);const value=await store.get<SupplierOfficeDraft>(req.business.id,kind,String(req.params.id));requireThat(value,'Supplier registration not found.',404);return value;};
  app.get('/api/manage/supplier-desks',async(request,res)=>{
    const req=request as StaffRequest;owner(req);
    res.set('Cache-Control','no-store').json({drafts:await store.all<SupplierOfficeDraft>(req.business.id,kind),types:supplierTypes.map(([key,label])=>({key,label})),activationReady:false});
  });
  writes.post('/api/manage/supplier-desks',async(request,res)=>{
    const req=request as StaffRequest;owner(req);
    const input=z.object({requestId:z.uuid(),details:supplierOfficeFields}).strict().parse(req.body);
    const old=await store.get<SupplierOfficeDraft>(req.business.id,kind,input.requestId);
    if(old){requireThat(old.submissionDigest===digest(input.details),'This registration reference was already used. Open the saved registration instead.',409);res.json(old);return;}
    const now=new Date().toISOString();
    const value:SupplierOfficeDraft={...input.details,id:input.requestId,photos:[],revision:1,createdAt:now,updatedAt:now,createdBy:req.user.id,updatedBy:req.user.id,submissionDigest:digest(input.details),source:'office',legalAcceptance:null,access:'not_activated',publication:'private'};
    await store.put(req.business.id,kind,value);await store.audit(req.business.id,req.user.email,'supplier-office.created',value.id,null,value);
    res.status(201).json(value);
  });
  writes.put('/api/manage/supplier-desks/:id',async(request,res)=>{
    const req=request as StaffRequest;const old=await owned(req);
    const input=z.object({revision:z.number().int().min(1),details:supplierOfficeFields}).strict().parse(req.body);
    requireThat(old.revision===input.revision,'This supplier registration changed. Reload before editing.',409);
    const value={...old,...input.details,revision:old.revision+1,updatedAt:new Date().toISOString(),updatedBy:req.user.id};
    await store.put(req.business.id,kind,value);await store.audit(req.business.id,req.user.email,'supplier-office.updated',value.id,old,value);res.json(value);
  });
  writes.post('/api/manage/supplier-desks/:id/photos',async(request,res)=>{
    const req=request as StaffRequest;const old=await owned(req);
    const input=z.object({revision:z.number().int().min(1),photo:inspirationPhotoSchema,caption:z.string().trim().min(1).max(200),permissionNote:z.string().trim().min(1).max(1000)}).strict().parse(req.body);
    requireThat(input.revision===old.revision,'This supplier registration changed. Reload before adding photos.',409);requireThat(old.photos.length<12,'Keep up to 12 photos per office application.');
    const photoId=id();const photo:PrivatePhoto={id:photoId,supplierId:old.id,...input.photo,caption:input.caption,permissionNote:input.permissionNote};
    const value={...old,photos:[...old.photos,{id:photoId,caption:input.caption,permissionNote:input.permissionNote}],revision:old.revision+1,updatedAt:new Date().toISOString(),updatedBy:req.user.id};
    await store.put(req.business.id,'supplierOfficePhotos',photo);await store.put(req.business.id,kind,value);
    await store.audit(req.business.id,req.user.email,'supplier-office.photo-added',old.id,null,{photoId,caption:input.caption,bytes:Buffer.from(input.photo.data,'base64').length});res.status(201).json(value);
  });
  app.get('/api/manage/supplier-desks/:id/photos/:photoId',async(request,res)=>{
    const req=request as StaffRequest;const old=await owned(req);const key=String(req.params.photoId);
    requireThat(old.photos.some(p=>p.id===key),'Photo not found.',404);
    const photo=await store.get<PrivatePhoto>(req.business.id,'supplierOfficePhotos',key);requireThat(photo?.supplierId===old.id,'Photo not found.',404);
    res.set({'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}).type('image/jpeg').send(Buffer.from(photo.data,'base64'));
  });
  // Draft types map to public categories, but never create membership or publishing permissions.
  app.get('/api/manage/supplier-desks/:id/category-links',async(request,res)=>{
    const req=request as StaffRequest;const draft=await owned(req);res.set('Cache-Control','no-store').json({categories:supplierCategoryKeys(draft.types),publication:draft.publication});
  });
}
