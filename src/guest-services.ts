export function guestServiceNames(otherShowNames: string[] = []) {
  const names = ["Characters", ...otherShowNames.filter((name) => !/character/i.test(name)).map((name) => /^LED Robots$/i.test(name) ? "LED Dancing Suits" : name)];
  for (const [name, match] of [
    ["Animation", /animation/i],
    ["Carnival Games", /carnival games?/i],
    ["Children's Workshops", /children.?s workshops?|kids.? workshops?/i],
    ["Decoration", /decoration|balloon decor/i],
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
  ] as const) {
    if (!names.some((existing) => match.test(existing))) names.push(name);
  }
  return names;
}
