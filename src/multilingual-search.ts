import { customerTranslations } from './customer-translations.js';

/** Canonical service keys stay unchanged. Aliases only expand public search. */
export const multilingualAliases: Record<string, readonly string[]> = {
  'Inflatable Castles':['bouncy castle','bouncing castle','chateau gonflable','العاب نفخ','قلعة نفخ','نطيطة'],
  'Inflatable Slides':['inflatable slide','toboggan gonflable','زحليقة نفخ'],
  'Climbing Towers':['climbing wall','escalade','تسلق'],
  'Inflatable Obstacle Courses':['obstacle course','parcours gonflable','حواجز نفخ'],
  'Popcorn Station':['popcorn','pop corn','بوشار','فشار'],
  'Cotton Candy Station':['candy floss','barbe a papa','غزل البنات','شعر البنات'],
  'Hot Dog Station':['hotdog','hot dog','هوت دوغ','هوت دوغز'],
  'Crêpe Station':['crepe','crepes','كريب'],
  'Slush Machine':['frisco','frisko','slush','sluch','slushy','frozen drinks','granite','سلاش','فريسكو','فريزكو'],
  'Soft Serve Station':['soft serve','glace italienne','بوظة سوفت'],
  'Rolled Ice Cream Station':['ice cream rolls','glace roulee','بوظة رول'],
  'Magic Show': ['magic','magician','magicien','prestidigitation','ساحر','سحر','ماجيك'],
  'Science Show': ['science','scientifique','experiences scientifiques','تجارب','علوم','علمي','ساينس'],
  'Bubble Show': ['bubbles','bubble','bulles','savon','فقاعات','صابون','بابل'],
  'Close-up Magic': ['close up','closeup','magie de proximite','سحر قريب'],
  'Animation': ['animateur','animation festive','تنشيط','انيميشن'],
  'Balloon Twisting': ['balloon sculpture','sculpture ballons','تشكيل بالونات','نفخ بالونات','بالون','بالونز'],
  'Balloon Decoration': ['balloon decor','decoration ballons','birthday balloons','ballons anniversaire','ديكور بالونات','تزيين بالونات','بالون','بالونز'],
  'Full Decoration': ['event styling','decoration complete','party decor','birthday decoration','decoration anniversaire','ديكور','تزيين','ديكور عيد ميلاد'],
  'Floral Decoration': ['flowers','fleurs','floral','floral decor','ديكور زهور','ديكور ورد','زهور','ورد','ازهار'],
  'Photography': ['photographer','photographe','photos','تصوير','مصور','فوتوغرافي','فوتوغراف'],
  'Videography': ['videographer','videaste','video','film','فيديو','فيديوغرافي'],
  'Favours & Keepsakes': ['favors','favours','keepsakes','souvenirs','cadeaux invites','هدايا','تذكارات','توزيعات'],
  'Food & Beverages': ['food','catering','traiteur','repas','boissons','طعام','مأكولات','مشروبات','ضيافة'],
  'Cakes': ['cake','gateau','gateaux','حلوى','كيك','كاتو'],
  'DJ': ['disc jockey','deejay','دي جي','ديجي'],
  'Sound System': ['audio','sonorisation','sono','صوت','سماعات'],
  'Face Painting': ['face paint','maquillage','grimage','رسم وجوه','رسم على الوجه'],
  'Characters': ['character','costumes','personnages','mascotte','شخصيات','ازياء','ماسكوت'],
  'Juggling': ['juggler','jugler','juglir','jongleur','jonglage','بهلوان','بهلوانيات','جونغلينغ'],
  'Stilt Walker': ['stilts','echasses','echassier','عصي طويلة','ستيلت'],
  'Clown': ['clowns','clown','مهرج','كلون'],
  'BMX Show': ['bmx','bicycle','velo','دراجات','بي ام اكس'],
  'Breakdance': ['break dance','breaking','بريك دانس','بريكدانس'],
  'Aerial Show': ['aerial','aerien','acrobaties aeriennes','اكروبات هوائية','عرض هوائي'],
  'Fire Show': ['fire','feu','نار','نيران'],
  'LED Dancing Suits': ['led robot','luminous','lumineux','ضوء','مضيء','روبوت'],
  'Live Music & Parades': ['live music','musique','parade','موسيقى','استعراض'],
  'Caricaturist': ['caricature','caricaturiste','كاريكاتير'],
  'Mime': ['mime','pantomime','تمثيل صامت','مايم'],
  'Human Statues': ['living statues','statues vivantes','تماثيل','تمثال حي'],
  'Football Show': ['football','soccer','freestyle','كرة قدم','فوتبول'],
  'Chair Balance': ['chair balancing','equilibre chaises','توازن كراسي'],
  'Circus Parade': ['circus','cirque','سيرك'],
  'Carnival Games': ['carnival','kermesse','كرنفال','العاب'],
  'Children’s Workshops': ['workshop','atelier','ورش','ورشة'],
  'PLAYTOWN': ['play town','playground','playgrounds','aire de jeux','aires de jeux','espace de jeux','anniversaire','birthday','kart','arts','crafts','spa','بلاي تاون','بلايتاون','ملعب','ملاعب','العاب','اطفال','عيد ميلاد'],
  'Ain El Tineh, Beirut': ['Ain el tineh','Ain el tine','Ain et tineh','Beirut','Beyrouth','Lebanon','Liban','عين التينة','بيروت','لبنان'],
  'Beirut': ['Beyrouth','بيروت'], 'Jounieh': ['Jounie','جونيه','جونية'], 'Tripoli': ['Tripoli','طرابلس'], 'Sidon': ['Saida','صيدا'],
  'Polar Bear': ['polar bear','ours polaire','دب قطبي'], 'Teddy Bear': ['teddy bear','ours en peluche','دب دمية'],
  'Rabbit': ['rabbit','bunny','lapin','ارنب'],
  'Gorilla': ['gorille','غوريلا'],
  'Dog Show': ['dog','dogs','chien','chiens','كلب','كلاب'],
  'Kids Theatre': ['theatre enfants','مسرح اطفال'],
  'Panda': ['panda','باندا'],
  'Mickey Mouse': ['mickey','ميكي','ميكي ماوس'],
  'Minnie Mouse': ['minnie','ميني','ميني ماوس'],
  'Santa Claus': ['santa','pere noel','بابا نويل','سانتا'],
  'playgrounds': ['playground','aire de jeux','espace de jeux','ملعب اطفال','ملاعب اطفال'],
  'magic': ['magie','سحر'], 'science': ['sciences','علوم'], 'bubbles': ['bulles','فقاعات'],
};
for (const [key, canonical] of Object.entries({Juggler:'Juggling',BMX:'BMX Show','Dog Show':'Dog Show',Bunny:'Rabbit','LED Robot':'LED Dancing Suits',Decoration:'Full Decoration',Cake:'Cakes',"Face Painting & Glitter":'Face Painting',"Children\u0027s Workshops":'Children’s Workshops'})) multilingualAliases[key] = multilingualAliases[canonical] ?? [];
export function normalizeSearch(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06ed\u0640]/g,'')
    .replace(/[أإآٱ]/g,'ا').replace(/[ىی]/g,'ي').replace(/ک/g,'ك').replace(/ؤ/g,'و').replace(/ئ/g,'ي').replace(/ة/g,'ه').replace(/[œŒ]/g,'oe').replace(/[æÆ]/g,'ae')
    .toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');
}
const translatedKeys = new Map(Object.entries(customerTranslations).flatMap(([key,value])=>[key,value.en??key,value.fr,value.ar].map(text=>[normalizeSearch(text),key] as const)));
const aliasKeys = new Map(Object.keys(multilingualAliases).flatMap(key=>{
  const tr=Object.hasOwn(customerTranslations,key)?customerTranslations[key]:null;
  return [key,...(tr?[tr.en??key,tr.fr,tr.ar]:[])].map(value=>[normalizeSearch(value),key] as const);
}));
const geographicKeys = ['Ain El Tineh, Beirut','Beirut','Jounieh','Tripoli','Sidon'] as const;
export function locationTerms(values: readonly string[]): string[] {
  return values.flatMap(value=>{
    const normalized=normalizeSearch(value);
    const key=geographicKeys.find(key=>normalizeSearch(key)===normalized)
      ?? geographicKeys.filter(key=>key!=='Ain El Tineh, Beirut').find(key=>multilingualAliases[key].some(alias=>normalizeSearch(alias)===normalized));
    return key?[value,...multilingualAliases[key]]:[value];
  });
}
export function multilingualTerms(values: readonly string[]): string[] {
  return values.flatMap(value => {
    const aliasKey=aliasKeys.get(normalizeSearch(value)),copyKey=translatedKeys.get(normalizeSearch(value));
    const tr = copyKey ? customerTranslations[copyKey] : null;
    return [value, ...(tr ? [copyKey!,...(tr.en?[tr.en]:[]),tr.fr,tr.ar] : []), ...(aliasKey ? multilingualAliases[aliasKey] : [])];
  });
}
const connectors = new Set(['the','a','an','de','des','du','la','le','les','un','une','et','في','و']);
function wordsFor(value: string) {
  return normalizeSearch(value).split(' ').map(word => /^[\u0600-\u06ff]+$/.test(word) && word.startsWith('ال') && word.length > 4 ? word.slice(2) : word).filter(word => word && !connectors.has(word));
}
/** Bounded edit distance includes adjacent swapped letters. Never fuzz short
 * keys such as DJ, numbers, or a different writing system. */
function spellingDistance(a: string, b: string, limit: number): number {
  if (Math.abs(a.length-b.length)>limit || /\p{N}/u.test(a+b) || (a.length===4&&a[0]!==b[0]) || /[\u0600-\u06ff]/.test(a)!==/[\u0600-\u06ff]/.test(b)) return limit+1;
  let older: number[] = [], previous = Array.from({length:b.length+1},(_,i)=>i);
  for(let i=1;i<=a.length;i++) {
    const row=[i];
    for(let j=1;j<=b.length;j++) {
      row[j]=Math.min(row[j-1]+1,previous[j]+1,previous[j-1]+Number(a[i-1]!==b[j-1]));
      if(i>1&&j>1&&a[i-1]===b[j-2]&&a[i-2]===b[j-1])row[j]=Math.min(row[j],older[j-2]+1);
    }
    if(Math.min(...row)>limit)return limit+1;
    older=previous;previous=row;
  }
  return previous[b.length];
}
/** Pronunciation-like spelling, shared by names, translated terms and photo tags.
 * Long Latin words only: short names, numbers and Arabic retain their existing
 * stricter spelling rules. Equal consonant patterns must contain three letters. */
function soundKey(word: string): string {
  if (!/^[a-z]{5,}$/.test(word)) return '';
  const key = word.replace(/ph/g, 'f').replace(/^sc(?=[ei])/, 's')
    .replace(/tion|sion|shon|shun/g, 'shn').replace(/c(?=[ei])|z/g, 's')
    .replace(/[cq]/g, 'k').replace(/([a-z])\1+/g, '$1')
    .replace(/[aeiouy]/g, '');
  return key.length >= 3 ? key : '';
}
/** Zero is a direct match; positive scores are spelling suggestions. Search
 * screens can prefer exact results without making typos look unavailable. */
export function multilingualMatchScore(values: readonly string[], query: string, rawValues: readonly string[] = []): number | null {
  if(!query.trim())return 0;
  const terms=wordsFor(query);if(!terms.length)return null;
  const words=[...new Set([...multilingualTerms(values),...rawValues].flatMap(wordsFor))];
  let score=0;
  for(const term of terms) {
    if(words.some(word=>term.length<3?word===term:word.startsWith(term)))continue;
    if(term.length<4)return null;
    const limit=term.length>=7?2:1;
    const best=words.reduce((distance,word)=>Math.min(distance,word.length>=4?spellingDistance(term,word,limit):limit+1),limit+1);
    if(best>limit) {
      const sound=soundKey(term);
      if(!sound||!words.some(word=>Math.abs(word.length-term.length)<=3&&soundKey(word)===sound))return null;
      score+=limit+1;
    } else score+=best;
  }
  return score;
}
export function matchesMultilingual(values: readonly string[], query: string, rawValues: readonly string[] = []): boolean {
  return multilingualMatchScore(values,query,rawValues)!==null;
}


