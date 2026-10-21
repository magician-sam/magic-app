import {z} from 'zod';
import {DateTime} from 'luxon';
import {hash} from './auth.js';
import {date} from './domain.js';
import type {Customer} from './models.js';
import type {CustomerExtras} from './rewards.js';

export const familyChildSchema=z.object({
  id:z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/),
  firstName:z.string().trim().max(240).default(''),
  age:z.number().int().min(0).max(25).nullable().default(null),
  birthday:z.union([z.literal(''),date]).default(''),
  interests:z.string().trim().max(500).default(''),
}).strict();
export const familySaveSchema=z.object({
  expectedVersion:z.string().regex(/^[a-f0-9]{64}$/),
  children:z.array(familyChildSchema).max(20),
}).strict().refine(value=>new Set(value.children.map(child=>child.id)).size===value.children.length,'Each family entry must have a different reference.');
export type FamilyChild=z.infer<typeof familyChildSchema>;
export function familyChildren(customer:Customer,extras?:CustomerExtras):FamilyChild[]{
  if(extras?.family) {
    // Staff birthday records remain canonical; an older family snapshot must
    // never restore a date that staff corrected or removed in the meantime.
    const used=new Set<number>();
    const result=extras.family.flatMap((child,index)=>{
      if(!child.birthday) return [child];
      const match=customer.children.findIndex((item,position)=>!used.has(position)&&(item.id===child.id||!item.id&&item.birthday===child.birthday&&item.name===(child.firstName||`Child ${index+1}`)));
      if(match<0) return [];
      used.add(match);const current=customer.children[match];
      return [{...child,birthday:current.birthday,firstName:!child.firstName&&current.name===`Child ${index+1}`?'':current.name}];
    });
    customer.children.forEach((child,index)=>{if(!used.has(index))result.push({id:child.id||`legacy-${index}`,firstName:child.name,age:null,birthday:child.birthday,interests:''});});
    return result;
  }
  if(customer.children.length) return customer.children.map((child,index)=>({id:child.id||`legacy-${index}`,firstName:child.name,age:null,birthday:child.birthday,interests:''}));
  return (extras?.childrenAges||[]).map((age,index)=>({id:`age-${index}`,firstName:'',age,birthday:'',interests:''}));
}
export function familyVersion(customer:Customer,extras?:CustomerExtras){
  return hash(JSON.stringify({children:customer.children,ages:extras?.childrenAges||[],family:extras?.family??null}));
}
export function familyAges(children:FamilyChild[],today:string){
  const now=DateTime.fromISO(today);
  return children.flatMap(child=>{
    const age=child.birthday?Math.floor(now.diff(DateTime.fromISO(child.birthday),'years').years):child.age;
    return age!==null&&age>=0&&age<=25?[age]:[];
  });
}
