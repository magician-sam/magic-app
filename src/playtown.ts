import { matchesMultilingual } from "./multilingual-search.js";
/** Owner-supplied pilot listing. Price sheet received 12 October 2026.
 * Kept separate from partner workspaces: no identity or approval grants. */
export const playtown = {
  name: 'PLAYTOWN', address: 'Ain El Tineh, Beirut',
  map: 'https://maps.app.goo.gl/Rv5SUZC4oA91vGFB6?g_st=aw',
  logo: '/playgrounds/playtown/logo.png',
  passes: [
    { id: 'basic', name: 'Basic pass', usd: 15, description: 'Playground access + 1 Go PLAY KART' },
    { id: 'basic-artistic', name: 'Basic artistic pass', usd: 20, description: 'Playground access + 1 Go PLAY KART + 1 Arts & Crafts OR SPA' },
    { id: 'playtown', name: 'PLAYTOWN Pass', usd: 20, description: 'Playground access + UNLIMITED PLAY KART' },
    { id: 'playtown-artistic', name: 'PLAYTOWN artistic pass', usd: 25, description: 'Playground access + UNLIMITED PLAY KART + 1 Arts & Crafts OR SPA' },
  ],
  memberships: [
    { name: 'PLAY TEN', basic: 125, playtown: 170, description: '10 PASSES, 3 MONTHS VALIDITY' },
    { name: 'PLAY MONTH', basic: 200, playtown: 285, description: '1 MONTH MEMBERSHIP' },
  ],
} as const;

export function playtownMatches(area: string, query: string) {
  return matchesMultilingual([playtown.address],area) && matchesMultilingual([playtown.name,playtown.address,...playtown.passes.flatMap(pass => [pass.name,pass.description])],query);
}

export type PlaygroundRequest = {
  requestId: string; provider: 'playtown'; kind: 'visit' | 'party';
  children: number; childAges: string;
  passes: { id: string; name: string; quantity: number; unitUsd: number }[];
  referenceTotalUsd: number | null; priceSource: string;
};
