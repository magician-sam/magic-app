export type OccasionFields={name:string;nameFr:string;nameAr:string;date:string;annual:boolean;leadDays:number;status:'draft'|'ready'|'archived';bundleIds:string[];headline:string;adText:string;adTextFr:string;adTextAr:string;offerTerms:string;notes:string;presetId:string;calendarType:'observance'|'public-holiday'|'custom';sourceUrl:string;verifiedDate:string};
export type OccasionPlan=OccasionFields&{id:string;revision:number;updatedAt:string;verifiedAt:string};
export const occasionPresets=[
  {id:'mothers-day',name:'Mother’s Day',nameFr:'Fête des mères',nameAr:'عيد الأم',monthDay:'03-21',note:'Lebanese celebration date; not a statement of public-holiday closure.',source:'https://moim.gov.lb/2025/03/21/'},
  {id:'lebanese-childrens-day',name:'Lebanese Children’s Day',nameFr:'Fête de l’enfant au Liban',nameAr:'عيد الطفل اللبناني',monthDay:'03-22',note:'Local observance, distinct from World Children’s Day on 20 November.',source:'https://annaslinnas.weebly.com/16051581157515901585-160815751580157816051575159315751578-2016.html'},
  {id:'fathers-day',name:'Father’s Day',nameFr:'Fête des pères',nameAr:'عيد الأب',monthDay:'06-21',note:'Lebanese celebration date; other countries use different dates.',source:'https://www.lebarmy.gov.lb/ar/content/قائد-الجيش-يقلد-الضباط-المترقّين-شارات-رتبة-عميد'},
  {id:'teachers-day',name:'Teachers’ Day',nameFr:'Fête des enseignants',nameAr:'عيد المعلم',monthDay:'03-09',note:'Lebanese observance. Confirm the school’s actual celebration date.',source:'https://www.mehe.gov.lb/ar/media-center/news/وزيرة-التربية-في-عيد-المعلم-حين-تبقى-المدرسة-حيّة-يبقى-لبنان-قادراً-على-النهوض'},
  {id:'world-childrens-day',name:'World Children’s Day',nameFr:'Journée mondiale de l’enfance',nameAr:'اليوم العالمي للطفل',monthDay:'11-20',note:'UNICEF observance, distinct from Lebanese Children’s Day on 22 March.',source:'https://www.unicef.org/lebanon/world-childrens-day-2025'},
  {id:'christmas',name:'Christmas',nameFr:'Noël',nameAr:'عيد الميلاد المجيد',monthDay:'12-25',note:'25 December. Add a separate occasion for communities celebrating on another date.',source:'https://www.industry.gov.lb/Ministry/WorkingHoursAndHolidays?lang=en-us'},
  {id:'new-year',name:'New Year',nameFr:'Nouvel An',nameAr:'رأس السنة',monthDay:'01-01',note:'1 January. Set your own celebration and promotion dates.',source:'https://www.industry.gov.lb/Ministry/WorkingHoursAndHolidays?lang=en-us'},
  ...[
    ['armenian-christmas','Armenian Christmas','Noël arménien','عيد الميلاد لدى الأرمن','01-06'],
    ['st-maroun','St. Maroun’s Day','Saint-Maron','عيد مار مارون','02-09'],
    ['annunciation','Annunciation','Annonciation','عيد البشارة','03-25'],
    ['labour-day','Labour Day','Fête du Travail','عيد العمال','05-01'],
    ['assumption','Assumption Day','Assomption','عيد انتقال السيدة العذراء','08-15'],
    ['independence','Independence Day','Fête de l’Indépendance','عيد الاستقلال','11-22'],
  ].map(([id,name,nameFr,nameAr,monthDay])=>({id,name,nameFr,nameAr,monthDay,note:'Fixed-date holiday reference. Check the applicable year’s official notice and closure arrangements.',source:'https://www.industry.gov.lb/Ministry/WorkingHoursAndHolidays?lang=en-us'})),
  ...[
    ['western-easter','Western Easter','Pâques occidentales','الفصح الغربي'],
    ['orthodox-easter','Orthodox Easter','Pâques orthodoxes','الفصح الشرقي'],
    ['eid-fitr','Eid al-Fitr','Aïd el-Fitr','عيد الفطر'],
    ['eid-adha','Eid al-Adha','Aïd el-Adha','عيد الأضحى'],
    ['school-season','Back to school','Rentrée scolaire','العودة إلى المدرسة'],
    ['graduation','Graduation','Remise des diplômes','حفلات التخرج'],
  ].map(([id,name,nameFr,nameAr])=>({id,name,nameFr,nameAr,monthDay:'',note:'Choose and confirm the date for the relevant year or institution. No automatic annual date.',source:['school-season','graduation'].includes(id)?'https://www.mehe.gov.lb/':'https://www.bdl.gov.lb/bankingholidays.php'})),
] as const;
export function beirutDay(now=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Beirut',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
const validDay=(day:string)=>/^\d{4}-\d{2}-\d{2}$/.test(day)&&!Number.isNaN(Date.parse(day+'T12:00:00Z'))&&new Date(day+'T12:00:00Z').toISOString().slice(0,10)===day;
export function nextOccasionDate(plan:Pick<OccasionFields,'date'|'annual'>,today=beirutDay()){
  if(!validDay(plan.date)||!validDay(today))return '';
  if(!plan.annual)return plan.date;
  for(let year=Math.max(Number(today.slice(0,4)),Number(plan.date.slice(0,4)));year<=9999;year++){
    const candidate=year+plan.date.slice(4);if(validDay(candidate)&&candidate>=today)return candidate;
  }
  return '';
}
export function promotionStarts(plan:Pick<OccasionFields,'date'|'annual'|'leadDays'>,today=beirutDay()){
  const date=nextOccasionDate(plan,today);if(!date)return '';
  const day=new Date(date+'T12:00:00Z');day.setUTCDate(day.getUTCDate()-plan.leadDays);return day.toISOString().slice(0,10);
}
export function newOccasion(presetId='',today=beirutDay()):OccasionFields{
  const preset=occasionPresets.find(p=>p.id===presetId);
  const date=preset?.monthDay?nextOccasionDate({date:today.slice(0,4)+'-'+preset.monthDay,annual:true},today):'';
  return {name:preset?.name??'',nameFr:preset?.nameFr??'',nameAr:preset?.nameAr??'',date,annual:!!preset?.monthDay,leadDays:30,status:'draft',bundleIds:[],headline:'',adText:'',adTextFr:'',adTextAr:'',offerTerms:'',notes:'',presetId:preset?.id??'',calendarType:['christmas','new-year','armenian-christmas','st-maroun','annunciation','labour-day','assumption','independence'].includes(presetId)?'public-holiday':preset?'observance':'custom',sourceUrl:preset?.source??'',verifiedDate:''};
}

export function occasionNeedsReview(plan:OccasionFields,today=beirutDay()){
  const date=nextOccasionDate(plan,today);return !date||!plan.sourceUrl||plan.verifiedDate!==date;
}
export function occasionReminder(plan:OccasionPlan,today=beirutDay()){
  const eventDate=nextOccasionDate(plan,today);if(plan.status==='archived'||!eventDate||eventDate<today)return null;
  const startsOn=promotionStarts(plan,today);
  return {eventDate,startsOn,due:startsOn<=today,needsReview:occasionNeedsReview(plan,today)};
}
export function occasionCalendarEntries(plans:readonly OccasionPlan[],month:string){
  const entries:{id:string;date:string;name:string;kind:'occasion'|'preparation';needsReview:boolean}[]=[];
  for(const plan of plans){
    if(plan.status==='archived'||!validDay(plan.date))continue;
    const year=Number(month.slice(0,4));
    const candidates=plan.annual?[year+plan.date.slice(4),(year+1)+plan.date.slice(4)]:[plan.date];
    for(const eventDate of candidates){
      if(!validDay(eventDate)||eventDate<plan.date)continue;
      const needsReview=!plan.sourceUrl||plan.verifiedDate!==eventDate;
      if(eventDate.startsWith(month))entries.push({id:plan.id,date:eventDate,name:plan.name,kind:'occasion',needsReview});
      const starts=promotionStarts({...plan,date:eventDate,annual:false},eventDate);
      if(starts.startsWith(month))entries.push({id:plan.id,date:starts,name:plan.name,kind:'preparation',needsReview});
    }
  }
  return entries.sort((a,b)=>a.date.localeCompare(b.date)||a.name.localeCompare(b.name));
}
