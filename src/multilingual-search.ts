import { customerTranslations } from './customer-translations.js';

/** Canonical service keys stay unchanged. Aliases only expand public search. */
export const multilingualAliases: Record<string, readonly string[]> = {
  'Magic Show': ['magic','magician','magicien','prestidigitation','ساحر','سحر','ماجيك'],
  'Science Show': ['science','scientifique','experiences scientifiques','تجارب','علوم','علمي','ساينس'],
  'Bubble Show': ['bubbles','bubble','bulles','savon','فقاعات','صابون','بابل'],
  'Close-up Magic': ['close up','closeup','magie de proximite','سحر قريب'],
  'Animation': ['animateur','animation festive','تنشيط','انيميشن'],
  'Balloon Twisting': ['balloon sculpture','sculpture ballons','تشكيل بالونات','نفخ بالونات'],
  'Balloon Decoration': ['balloon decor','decoration ballons','ديكور بالونات','تزيين بالونات'],
  'Full Decoration': ['event styling','decoration complete','ديكور','تزيين'],
  'Floral Decoration': ['flowers','fleurs','floral','زهور','ورد','ازهار'],
  'Photography': ['photographer','photographe','photos','تصوير','مصور','فوتوغرافي','فوتوغراف'],
  'Videography': ['videographer','videaste','video','film','فيديو','فيديوغرافي'],
  'Favours & Keepsakes': ['favors','favours','keepsakes','souvenirs','cadeaux invites','هدايا','تذكارات','توزيعات'],
  'Food & Beverages': ['food','catering','traiteur','repas','boissons','طعام','مأكولات','مشروبات','ضيافة'],
  'Cakes': ['cake','gateau','gateaux','حلوى','كيك','كاتو'],
  'DJ': ['disc jockey','دي جي','ديجي'],
  'Sound System': ['audio','sonorisation','sono','صوت','سماعات'],
  'Face Painting': ['face paint','maquillage','grimage','رسم وجوه','رسم على الوجه'],
  'Characters': ['character','costumes','personnages','mascotte','شخصيات','ازياء','ماسكوت'],
  'Juggling': ['juggler','jongleur','jonglage','بهلوان','بهلوانيات','جونغلينغ'],
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
  'Panda': ['panda','باندا'],
  'Mickey Mouse': ['mickey','ميكي','ميكي ماوس'],
  'Minnie Mouse': ['minnie','ميني','ميني ماوس'],
  'Santa Claus': ['santa','pere noel','بابا نويل','سانتا'],
  'playgrounds': ['playground','aire de jeux','espace de jeux','ملعب اطفال','ملاعب اطفال'],
  'magic': ['magie','سحر'], 'science': ['sciences','علوم'], 'bubbles': ['bulles','فقاعات'],
};
for (const [key, canonical] of Object.entries({Juggler:'Juggling',BMX:'BMX Show','Dog Show':'Dog Show',Bunny:'Rabbit','LED Robot':'LED Dancing Suits'})) multilingualAliases[key] = multilingualAliases[canonical] ?? [];
export function normalizeSearch(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06ed\u0640]/g,'')
    .replace(/[أإآٱ]/g,'ا').replace(/[ىی]/g,'ي').replace(/ک/g,'ك').replace(/ؤ/g,'و').replace(/ئ/g,'ي').replace(/ة/g,'ه').replace(/[œŒ]/g,'oe').replace(/[æÆ]/g,'ae')
    .toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');
}
const translatedKeys = new Map(Object.entries(customerTranslations).flatMap(([key,value])=>[key,value.fr,value.ar].map(text=>[normalizeSearch(text),key] as const)));
const aliasKeys = new Map(Object.keys(multilingualAliases).flatMap(key=>{
  const tr=Object.hasOwn(customerTranslations,key)?customerTranslations[key]:null;
  return [key,...(tr?[tr.fr,tr.ar]:[])].map(value=>[normalizeSearch(value),key] as const);
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
    return [value, ...(tr ? [copyKey!,tr.fr,tr.ar] : []), ...(aliasKey ? multilingualAliases[aliasKey] : [])];
  });
}
/** All query words must match a whole word or its prefix. Short words such as
 * DJ cannot accidentally match the middle of unrelated provider names. */
export function matchesMultilingual(values: readonly string[], query: string, rawValues: readonly string[] = []): boolean {
  const terms = normalizeSearch(query).split(' ').filter(Boolean);
  if (!terms.length) return !query.trim();
  const words = [...multilingualTerms(values),...rawValues].flatMap(value => normalizeSearch(value).split(' '));
  return terms.every(term => words.some(word => term.length < 3 ? word === term : word.startsWith(term)));
}


