const treats=/popcorn|cotton candy|hot dog|cr[eê]pe|slush|soft serve|rolled ice cream|food station|party machine/i;
/** Focused views are routes, not physical DOM anchors. Retain older shared URLs. */
export const marketplaceCollections:Readonly<Record<string,{title:string;match:RegExp}>>={
  '#browse-music':{title:'Music & sound',match:/\bDJ\b|Sound System|Live Music|Parades/i},
  '#browse-food':{title:'Food & cakes',match:/^(?!.*(?:food station|party machine|popcorn|cotton candy|hot dog|cr[eê]pe|slush|soft serve|rolled ice cream)).*(?:food|beverage|cake)/i},
  '#browse-science':{title:'Science & workshops',match:/Science|Workshop/i},
  '#browse-inflatables':{title:'Inflatables & Attractions',match:/inflatabl|climbing tower|obstacle course/i},
  '#browse-treats':{title:'Popcorn & more',match:treats},
  '#browse-party-machines':{title:'Popcorn & more',match:treats},
  '#browse-food-stations':{title:'Popcorn & more',match:treats},
};
