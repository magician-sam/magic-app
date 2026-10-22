import {z} from 'zod';
import type {Express,Request} from 'express';
import type {Store} from './store.js';
import type {Business,User} from './models.js';
import {date,requireThat} from './domain.js';
import {writeRoutes} from './write-routes.js';
import {defaultSeasonalTheme,themePresets,type SeasonalTheme,type ThemeSettings} from './seasonal-themes.js';
const kind='seasonalThemes';
const fields=z.object({theme:z.enum(themePresets.map(p=>p.key)),startsOn:z.union([z.literal(''),date]),endsOn:z.union([z.literal(''),date]),animations:z.boolean()}).strict().refine(v=>!v.startsOn||!v.endsOn||v.startsOn<=v.endsOn,'The end date must be on or after the start date.');
export async function publicSeasonalTheme(store:Store,businessId:string,slug:string):Promise<SeasonalTheme>{
  const row=await store.get<ThemeSettings>(businessId,kind,'public');
  const defaults=slug==='magic-by-sam'?defaultSeasonalTheme():{theme:'standard' as const,startsOn:'',endsOn:'',animations:false};
  const {theme,startsOn,endsOn,animations}=row??defaults;return {theme,startsOn,endsOn,animations};
}
export function seasonalThemeRoutes(app:Express,store:Store){
  type Staff=Request&{user:User;business:Business};
  const owner=(req:Staff)=>{requireThat(['owner','admin'].includes(req.user.role),'Only the owner can change public themes.',403);requireThat(req.business.slug==='magic-by-sam','Seasonal themes are available for the Magic App marketplace.',403);};
  app.get('/api/manage/themes',async(request,res)=>{const req=request as Staff;owner(req);const saved=await store.get<ThemeSettings>(req.business.id,kind,'public');res.set('Cache-Control','no-store').json({businessSlug:req.business.slug,settings:saved??{...await publicSeasonalTheme(store,req.business.id,req.business.slug),id:'public',revision:0,updatedAt:''}});});
  writeRoutes(app,store).put('/api/manage/themes',async(request,res)=>{
    const req=request as Staff;owner(req);
    const input=z.object({revision:z.number().int().nonnegative(),settings:fields}).strict().parse(req.body);
    const previous=await store.get<ThemeSettings>(req.business.id,kind,'public');
    requireThat(input.revision===(previous?.revision??0),'This theme changed in another window. Reload before saving.',409);
    const value:ThemeSettings={...input.settings,id:'public',revision:input.revision+1,updatedAt:new Date().toISOString()};
    await store.put(req.business.id,kind,value);
    await store.audit(req.business.id,req.user.email,'theme.saved','public',previous??null,value);
    res.json(value);
  });
}
