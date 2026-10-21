import {z} from 'zod';
import {serviceRequirementGroups,selectedRequirementGroups,type ServiceRequirements} from './service-requirements.js';
const answers=Object.fromEntries(serviceRequirementGroups.map(group=>[group.key,z.object(Object.fromEntries(group.fields.map(field=>[field.key,
  ('choices' in field?z.union([z.literal(''),z.enum(field.choices)]):field.type==='number'?z.string().regex(/^(?:|[1-9][0-9]{0,5})$/):z.string().trim().max(1000)).optional(),
]))).strict().optional()]));
export const serviceRequirementsSchema=z.object(answers).strict().transform(value=>value as ServiceRequirements);
export function serviceRequirementsMatch(value:ServiceRequirements|undefined,services:readonly string[]){
  const allowed=new Set(selectedRequirementGroups(services).map(group=>group.key));
  return !value||Object.keys(value).every(key=>allowed.has(key as keyof ServiceRequirements));
}
