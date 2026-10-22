import {inflatableCatalogue} from './inflatable-catalogue.js';
export function guestServiceNames(otherShowNames: string[] = [], hidden: string[] = [], businessSlug?:string) {
  const names = ["Characters", ...otherShowNames.filter((name) => !/character/i.test(name)).map((name) => /^LED Robots$/i.test(name) ? "LED Dancing Suits" : name)];
  for (const [name, match] of [
    ["Animation", /animation/i],
    ["Carnival Games", /carnival games?/i],
    ["Children's Workshops", /children.?s workshops?|kids.? workshops?/i],
    ["Decoration", /^(?:decoration|event decoration|event styling|full event styling)$/i],
    ["Balloon Decoration", /balloon decor|balloons? styling/i],
    ["Floral Decoration", /floral|flower decor|flower arrang/i],
    ["Photography", /photograph/i],
    ["Videography", /videograph|video coverage|event film/i],
    ["Favours & Keepsakes", /favou?rs?|keepsakes?|giveaways?|guest gifts?|souvenirs?/i],
    ["Face Painting & Glitter", /face paint|glitter/i],
    ["Close-up Magic", /close.up magic/i],
    ["Balloon Twisting", /balloon twist/i],
    ["Kids Theatre", /kids theatre|children.s theatre/i],
    ["Dance Show", /dance show|dance performance/i],
    ["Dog Show", /dog/i],
    ["Acrobat", /acrobat/i],
    ["Juggling", /juggl/i],
    ["Stilt Walker", /stilt/i],
    ["BMX Show", /bmx/i],
    ["Clown", /clown/i],
    ["Breakdance", /breakdance/i],
    ["Aerial Show", /aerial/i],
    ["Fire Show", /fire show/i],
    ["LED Dancing Suits", /led (?:robot|dancing suit)/i],
    ["Live Music & Parades", /live music/i],
    ["Caricaturist", /caricatur/i],
    ["Mime", /^mime$/i],
    ["Human Statues", /human statue/i],
    ["Football Show", /football|soccer/i],
    ["Chair Balance", /chair balance/i],
    ["Circus Parade", /circus parade/i],
    ["Characters", /character/i],
    ["Inflatable Castles", /inflatabl.*castle|bounc.*castle/i],
    ["Inflatable Slides", /inflatabl.*slide/i],
    ["Climbing Towers", /climbing tower/i],
    ["Inflatable Obstacle Courses", /obstacle course/i],
    ["Popcorn Station", /popcorn/i],
    ["Cotton Candy Station", /cotton candy/i],
    ["Hot Dog Station", /hot dog/i],
    ["Crêpe Station", /cr[eê]pe/i],
    ["Slush Machine", /slush/i],
    ["Soft Serve Station", /soft serve/i],
    ["Rolled Ice Cream Station", /rolled ice cream/i],
  ] as const) {
    if (!names.some((existing) => match.test(existing))) names.push(name);
  }
  if(businessSlug==='magic-by-sam') names.push(...inflatableCatalogue.map(item=>item.service).filter(name=>!names.includes(name)));
  return names.filter((name) => !hidden.some((entry) => entry.toLowerCase() === name.toLowerCase()));
}
