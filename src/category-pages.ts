import { marketplaceCategoryCards } from './catalogue-settings.js';
import { marketplaceCollections } from './category-collections.js';

type CategoryKey = typeof marketplaceCategoryCards[number][3];
export type CategoryPage = {
  key: CategoryKey;
  title: string;
  description: string;
  section: string;
  groups?: readonly string[];
  collection?: string;
};
const views: Record<CategoryKey, Pick<CategoryPage, 'section' | 'groups' | 'collection'>> = {
  places: { section: 'marketplace-playgrounds' },
  teams: { section: 'marketplace-agencies' },
  shows: { section: 'shows', groups: ['sam-shows', 'party-shows', 'special-acts'] },
  offers: { section: 'offers' },
  science: { section: 'shows', collection: '#browse-science' },
  styling: { section: 'shows', groups: ['event-styling'] },
  capture: { section: 'shows', groups: ['photography-video'] },
  music: { section: 'shows', collection: '#browse-music' },
  food: { section: 'shows', collection: '#browse-food' },
  inflatables: { section: 'shows', collection: '#browse-inflatables' },
  'food-stations': { section: 'shows', collection: '#browse-treats' },
  milestones: { section: 'family-celebrations' },
  keepsakes: { section: 'shows', groups: ['favours-keepsakes'] },
  schools: { section: 'category-school-events' },
};
export const categoryPageHash = (key: CategoryKey) => '#category/' + key;
export const categoryPages: readonly CategoryPage[] = marketplaceCategoryCards.map(
  ([title, , , key, description]) => ({ key, title, description, ...views[key] }),
);
const legacy: Readonly<Record<string, CategoryKey>> = {
  '#shows': 'shows', '#marketplace-playgrounds': 'places', '#marketplace-agencies': 'teams',
  '#offers': 'offers', '#event-styling': 'styling', '#photography-video': 'capture',
  '#favours-keepsakes': 'keepsakes', '#family-celebrations': 'milestones',
  '#browse-science': 'science', '#browse-music': 'music', '#browse-food': 'food',
  '#browse-inflatables': 'inflatables', '#browse-treats': 'food-stations',
  '#browse-party-machines': 'food-stations', '#browse-food-stations': 'food-stations',
};
export function categoryPageForHash(hash: string): CategoryPage | undefined {
  const key = hash.startsWith('#category/') ? hash.slice(10) : legacy[hash];
  return categoryPages.find(page => page.key === key);
}
export function categoryPageIncludes(page: CategoryPage, title: string, group: string) {
  if (page.section !== 'shows') return false;
  if (page.groups) return page.groups.includes(group);
  return !!page.collection && marketplaceCollections[page.collection].match.test(title);
}
