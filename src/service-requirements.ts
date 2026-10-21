/** Original inquiry fields. Answers are preferences; provider review is required. */
export const serviceRequirementGroups = [
  { key:'decoration', title:'Decoration details', match:/decoration|balloons? styling|event styling|floral|flower decor|flower arrang/i, fields:[
    {key:'theme',label:'Theme, style & colours',type:'text'},
    {key:'interests',label:'Favourite characters or interests (optional)',type:'text'},
    {key:'elements',label:'Setup elements',type:'textarea',help:'Backdrops, balloons, flowers, children’s tables, chairs, tableware, labels or favours.'},
    {key:'dimensions',label:'Available space or dimensions (optional)',type:'text'},
    {key:'access',label:'Setup, collection & venue access (optional)',type:'textarea'},
  ]},
  { key:'inflatables',title:'Inflatable & attraction details',match:/inflatabl|bouncy|bouncing castle|climbing tower|obstacle course/i,fields:[
    {key:'ages',label:'Children’s ages or age range',type:'text'},
    {key:'dimensions',label:'Available length, width & height',type:'text'},
    {key:'surface',label:'Ground surface',type:'select',choices:['Not sure yet','Grass','Paving or concrete','Indoor floor','Other surface']},
    {key:'supervision',label:'Supervision arrangement',type:'select',choices:['Please advise','Staff required','Venue staff — needs provider approval']},
    {key:'access',label:'Access, setup & transport details (optional)',type:'textarea'},
  ]},
  { key:'foodStations',title:'Party machine details',match:/food station|party machine|popcorn|cotton candy|hot dog|cr[eê]pe|slush|soft serve|rolled ice cream/i,fields:[
    {key:'serviceMode',label:'Service arrangement',type:'select',choices:['Please advise','Machine rental only','Staffed station with ingredients','Staffed station — ingredients to confirm']},
    {key:'servings',label:'Estimated number of servings (optional)',type:'number'},
    {key:'hours',label:'Serving duration or time window (optional)',type:'text'},
    {key:'dietary',label:'Dietary needs or allergies to discuss (optional)',type:'textarea'},
    {key:'utilities',label:'Water, power & station space (optional)',type:'textarea'},
    {key:'access',label:'Delivery, setup & collection (optional)',type:'textarea'},
  ]},
] as const;
export type ServiceRequirementKind=typeof serviceRequirementGroups[number]['key'];
export type ServiceRequirements=Partial<Record<ServiceRequirementKind,Record<string,string>>>;
export function selectedRequirementGroups(services:readonly string[]){
  return serviceRequirementGroups.filter(group=>services.some(name=>group.match.test(name)));
}
export function isInflatableService(name:string){return serviceRequirementGroups[1].match.test(name);}
export function isFoodStationService(name:string){return serviceRequirementGroups[2].match.test(name);}
