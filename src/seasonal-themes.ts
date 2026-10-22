export const themePresets = [
  {key:'standard',name:'Standard',symbol:'✦',paper:'#f6f7fb',ink:'#33264b',accent:'#38265e',soft:'#eee5fa',trim:'#c9abef',description:'Your familiar purple marketplace.'},
  {key:'christmas',name:'Christmas Market',symbol:'🎄',paper:'#fbf8f1',ink:'#253d34',accent:'#173f34',soft:'#edf3e8',trim:'#d9b978',description:'Evergreen, warm gold, tiny trees, Santa and his reindeer.'},
  {key:'winter',name:'Winter',symbol:'❄',paper:'#f2f7fb',ink:'#233e55',accent:'#24556d',soft:'#deedf4',trim:'#9fc9dd',description:'Icy blue, soft silver and little snowflakes.'},
  {key:'spring',name:'Spring',symbol:'🌼',paper:'#faf9ef',ink:'#37472c',accent:'#526d35',soft:'#e9efd6',trim:'#e3c574',description:'Fresh greens and a cheerful flower border.'},
  {key:'summer',name:'Summer',symbol:'☀',paper:'#fff9ec',ink:'#34504b',accent:'#226b65',soft:'#e0f1e9',trim:'#e8b55e',description:'Sunny gold and seaside teal.'},
  {key:'autumn',name:'Autumn',symbol:'🍂',paper:'#fcf5ed',ink:'#543c30',accent:'#885236',soft:'#f3e2d0',trim:'#d4a46a',description:'Warm terracotta, leaves and soft cream.'},
  {key:'easter',name:'Easter',symbol:'🥚',paper:'#faf5fb',ink:'#4d395d',accent:'#77558b',soft:'#ece3f3',trim:'#bfd59b',description:'Pastel lilac, spring green and little Easter eggs.'},
  {key:'halloween',name:'Halloween',symbol:'🎃',paper:'#faf4ed',ink:'#3f3148',accent:'#483451',soft:'#f4dfcb',trim:'#dc9450',description:'Pumpkin orange and plum, playful rather than scary.'},
  {key:'new-year',name:'New Year',symbol:'✧',paper:'#fbf8f0',ink:'#39352b',accent:'#303c39',soft:'#eee7d2',trim:'#c2a05b',description:'Midnight green, champagne gold and stars.'},
  {key:'valentine',name:'Valentine’s Day',symbol:'♡',paper:'#fff5f5',ink:'#623345',accent:'#93465c',soft:'#f7dfe5',trim:'#da9ea9',description:'Soft rose, warm cream and little hearts.'},
  {key:'ramadan',name:'Ramadan',symbol:'☾',paper:'#f8f6ee',ink:'#304741',accent:'#27534a',soft:'#e8e9d7',trim:'#c3a45f',description:'Deep teal, gold and crescent details.'},
  {key:'eid',name:'Eid',symbol:'✧',paper:'#f7fbf3',ink:'#344b39',accent:'#35684c',soft:'#e8f0db',trim:'#d3b15e',description:'Emerald green, gold and a light festive border.'},
] as const;
export type ThemeKey = typeof themePresets[number]['key'];
export type SeasonalTheme = {theme:ThemeKey;startsOn:string;endsOn:string;animations:boolean};
export type ThemeSettings = SeasonalTheme & {id:'public';revision:number;updatedAt:string};
export const isThemeKey = (value:unknown): value is ThemeKey => themePresets.some(p=>p.key===value);
export const defaultSeasonalTheme = (): SeasonalTheme => ({theme:'christmas',startsOn:'2026-10-01',endsOn:'2027-01-06',animations:true});
export function effectiveTheme(settings:SeasonalTheme,now=new Date()):ThemeKey {
  const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Beirut',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
  return !isThemeKey(settings.theme) || (settings.startsOn&&day<settings.startsOn) || (settings.endsOn&&day>settings.endsOn) ? 'standard' : settings.theme;
}
