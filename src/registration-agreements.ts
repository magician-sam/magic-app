import {createHash} from 'node:crypto';
import {z} from 'zod';
import type {Express, Request} from 'express';
import type {Store} from './store.js';
import {id} from './store.js';
import type {User, Business} from './models.js';
import {requireThat} from './domain.js';
import {writeRoutes} from './write-routes.js';
import {agreementLanguages, type AgreementAudience, type AgreementDraft, type PublishedAgreement, type PublicAgreement} from './agreement-types.js';

const audience=z.enum(['customer','supplier']);
const language=z.enum(agreementLanguages);
const text=z.object({summary:z.string().trim().max(2000),terms:z.string().trim().max(45000),privacy:z.string().trim().max(45000)}).strict();
export const agreementDetails=z.object({audience,operator:z.string().trim().max(200),address:z.string().trim().max(500),contact:z.string().trim().max(200),texts:z.object({en:text,fr:text,ar:text}).strict()}).strict();
export const agreementAcceptance=z.object({version:z.uuid(),language,accepted:z.literal(true)}).strict();
const pointerKind='registrationAgreementCurrent';
export const agreementRecordKinds=['registrationAgreementDrafts','registrationAgreementVersions',pointerKind,'registrationAgreementAcceptances'];

export async function activeAgreement(store:Store,businessId:string,forAudience:AgreementAudience) {
  const current=await store.get<{id:string;version:string}>(businessId,pointerKind,forAudience);
  if(!current)return undefined;
  const version=await store.get<PublishedAgreement>(businessId,'registrationAgreementVersions',current.version);
  requireThat(version&&version.audience===forAudience,'Registration agreements are temporarily unavailable.',503);
  return version;
}

/** Called in the registration write transaction; never trust client time, actor, digest or document URLs. */
export async function acceptRegistrationAgreement(store:Store,businessId:string,accountId:string,forAudience:AgreementAudience,input:unknown,required=false) {
  const version=await activeAgreement(store,businessId,forAudience);
  if(!version){requireThat(!required,'Supplier registration opens after the final agreements are published.',503);requireThat(input===undefined,'The agreement version is no longer current. Reopen registration.',409);return;}
  requireThat(input!==undefined,'Please read and accept the registration terms.',400);
  const acceptance=agreementAcceptance.parse(input);
  requireThat(acceptance.version===version.id,'The registration terms changed. Reopen registration and review the latest version.',409);
  const receipt={id:id(),accountId,audience:forAudience,version:version.id,digest:version.digest,language:acceptance.language,acceptedAt:new Date().toISOString(),source:'self-registration'};
  await store.put(businessId,'registrationAgreementAcceptances',receipt);
  await store.audit(businessId,accountId,'registration.agreement-accepted',receipt.id,null,{audience:forAudience,version:version.id,language:acceptance.language,digest:version.digest});
  return receipt;
}

export function publicAgreementRoutes(app:Express,store:Store) {
  app.get('/api/public/:slug/registration-agreements/:audience',async(req,res)=>{
    const business=await store.business(String(req.params.slug),true);requireThat(business,'Business not found.',404);
    const forAudience=audience.parse(req.params.audience),lang=language.parse(req.query.language??'en');
    const version=await activeAgreement(store,business.id,forAudience);
    res.set('Cache-Control','no-store');
    if(!version){res.json({agreement:null});return;}
    const base=`/registration-agreements/${encodeURIComponent(business.slug)}/${forAudience}/${version.id}/${lang}`;
    const agreement:PublicAgreement={version:version.id,digest:version.digest,publishedAt:version.publishedAt,audience:forAudience,operator:version.operator,language:lang,summary:version.texts[lang].summary,termsUrl:base+'/terms',privacyUrl:base+'/privacy'};
    res.json({agreement});
  });
  // Published text is immutable, saveable plain text. Never render administrator input as HTML.
  app.get('/registration-agreements/:slug/:audience/:version/:language/:document',async(req,res)=>{
    const business=await store.business(String(req.params.slug),true);requireThat(business,'Business not found.',404);
    const forAudience=audience.parse(req.params.audience),versionId=z.uuid().parse(req.params.version),lang=language.parse(req.params.language),document=z.enum(['terms','privacy']).parse(req.params.document);
    const version=await store.get<PublishedAgreement>(business.id,'registrationAgreementVersions',versionId);requireThat(version&&version.audience===forAudience,'Agreement not found.',404);
    res.set({'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Content-Language':lang}).type('text/plain').send(`${version.operator}\n${version.address}\n${version.contact}\n${version.publishedAt} · ${version.id}\n\n${version.texts[lang][document]}`);
  });
}

export function manageAgreementRoutes(app:Express,store:Store) {
  type Staff=Request&{user:User;business:Business};
  const owner=(req:Staff)=>requireThat(['owner','admin'].includes(req.user.role),'Only the owner can prepare registration agreements.',403);
  const writes=writeRoutes(app,store);
  app.get('/api/manage/registration-agreements',async(request,res)=>{
    const req=request as Staff;owner(req);
    res.set('Cache-Control','no-store').json({businessSlug:req.business.slug,drafts:await store.all<AgreementDraft>(req.business.id,'registrationAgreementDrafts'),versions:await store.all<PublishedAgreement>(req.business.id,'registrationAgreementVersions'),current:await store.all(req.business.id,pointerKind)});
  });
  writes.put('/api/manage/registration-agreements/:audience',async(request,res)=>{
    const req=request as Staff;owner(req);const forAudience=audience.parse(req.params.audience);
    const input=z.object({revision:z.number().int().nonnegative(),details:agreementDetails}).strict().parse(req.body);
    requireThat(input.details.audience===forAudience,'Agreement audience does not match.');
    const previous=await store.get<AgreementDraft>(req.business.id,'registrationAgreementDrafts',forAudience);
    requireThat(input.revision===(previous?.revision??0),'This draft changed. Reload before saving.',409);
    const value:AgreementDraft={...input.details,id:forAudience,revision:input.revision+1,updatedAt:new Date().toISOString()};
    await store.put(req.business.id,'registrationAgreementDrafts',value);
    await store.audit(req.business.id,req.user.email,'registration.agreement-draft-saved',forAudience,null,{revision:value.revision});res.json(value);
  });
  writes.post('/api/manage/registration-agreements/:audience/publish',async(request,res)=>{
    const req=request as Staff;owner(req);const forAudience=audience.parse(req.params.audience);
    const input=z.object({revision:z.number().int().min(1),reviewConfirmed:z.literal(true)}).strict().parse(req.body);
    const draft=await store.get<AgreementDraft>(req.business.id,'registrationAgreementDrafts',forAudience);requireThat(draft&&draft.revision===input.revision,'This draft changed. Reload and review it before publication.',409);
    requireThat(draft.operator.length>=3&&draft.address.length>=5&&draft.contact.length>=5,'Complete the actual operator and contact details before publication.');
    for(const lang of agreementLanguages){const value=draft.texts[lang];requireThat(value.summary.length>=20&&value.terms.length>=100&&value.privacy.length>=100,'Complete the summary, terms and privacy notice in English, French and Arabic.');}
    requireThat(!/\[(?:EXACT|ADDRESS|REGISTRATION|PRIVACY|INSERT|COMPANY)|PRIVATE DRAFT|not published or effective/i.test(JSON.stringify(draft)),'Replace draft placeholders before publishing.');
    const details=agreementDetails.parse({audience:draft.audience,operator:draft.operator,address:draft.address,contact:draft.contact,texts:draft.texts}),digest=createHash('sha256').update(JSON.stringify(details)).digest('hex');
    const current=await activeAgreement(store,req.business.id,forAudience);
    if(current?.digest===digest){res.json(current);return;}
    const version:PublishedAgreement={...details,id:id(),digest,publishedBy:req.user.id,publishedAt:new Date().toISOString()};
    await store.put(req.business.id,'registrationAgreementVersions',version);await store.put(req.business.id,pointerKind,{id:forAudience,version:version.id});
    await store.audit(req.business.id,req.user.email,'registration.agreement-published',version.id,null,{audience:forAudience,version:version.id,digest});res.status(201).json(version);
  });
}
