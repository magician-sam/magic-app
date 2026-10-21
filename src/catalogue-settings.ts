export const marketplaceCategoryCards = [
  [
    "Playgrounds & venues",
    "places",
    "#marketplace-playgrounds",
    "places",
    "Play visits & places to celebrate",
  ],
  [
    "Entertainment agencies",
    "teams",
    "#marketplace-agencies",
    "teams",
    "Planners & creative event teams",
  ],
  [
    "Artists & shows",
    "magic",
    "#shows",
    "shows",
    "Magic, circus, comedy & more",
  ],
  [
    "Offers & bundles",
    "gift",
    "#offers",
    "offers",
    "Ready-made or made for you",
  ],
  [
    "Science & workshops",
    "science",
    "#sam-shows",
    "science",
    "Discovery for curious minds",
  ],
  [
    "Decoration & flowers",
    "decorate",
    "#event-styling",
    "styling",
    "Full styling, balloons or flowers",
  ],
  [
    "Photography & video",
    "camera",
    "#photography-video",
    "capture",
    "Capture the people & the moment",
  ],
  [
    "Music & sound",
    "music",
    "#event-extras",
    "music",
    "DJs, live acts & sound systems",
  ],
  [
    "Food & cakes",
    "food",
    "#event-extras",
    "food",
    "Menus, treats & celebration cakes",
  ],
  ["Inflatables & Attractions","sparkle","#browse-inflatables","inflatables","Castles, slides & active adventures"],
  ["Food Stations & Party Machines","food","#browse-food-stations","food-stations","Popcorn, treats & staffed stations"],
  [
    "Baptism & Communion",
    "candle",
    "#family-celebrations",
    "milestones",
    "Celebrate a meaningful family moment",
  ],
  [
    "Favours & keepsakes",
    "gift",
    "#favours-keepsakes",
    "keepsakes",
    "Thoughtful gifts for your guests",
  ],
  [
    "Schools & festivals",
    "sparkle",
    "#marketplace-occasions",
    "schools",
    "Ideas for bringing a crowd together",
  ],
] as const;
export interface CatalogueAppearance {
  revision: number;
  name: string;
  nameFr: string;
  nameAr: string;
  description: string;
  descriptionFr: string;
  descriptionAr: string;
  cover: string;
}
type Settings = { catalogueAppearance?: Record<string, CatalogueAppearance> };
export function catalogueName(
  b: Settings,
  key: string,
  fallback: string,
  lang = "en",
) {
  const v = b.catalogueAppearance?.[key];
  return (
    (lang === "fr" ? v?.nameFr : lang === "ar" ? v?.nameAr : "") ||
    v?.name ||
    fallback
  );
}
export function catalogueDescription(
  b: Settings,
  key: string,
  fallback: string,
  lang = "en",
) {
  const v = b.catalogueAppearance?.[key];
  return (
    (lang === "fr"
      ? v?.descriptionFr
      : lang === "ar"
        ? v?.descriptionAr
        : "") ||
    v?.description ||
    fallback
  );
}
export function catalogueSearchTerms(b: Settings, key: string) {
  const v = b.catalogueAppearance?.[key];
  const values = v
    ? [
        v.name,
        v.nameFr,
        v.nameAr,
        v.description,
        v.descriptionFr,
        v.descriptionAr,
      ]
    : [];
  // Keep supplied labels intact; also index common attached Arabic prepositions.
  return [
    ...values,
    ...values.flatMap((value) =>
      value
        .split(/\s+/)
        .map((word) =>
          word.replace(/^(?:بال|وال|لل)(?=[\u0621-\u064a]{4,}$)/u, ""),
        ),
    ),
  ];
}
