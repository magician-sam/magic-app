const views = new Set([
  'today', 'notices', 'bookings', 'enquiries', 'calendar', 'customers',
  'whatsapp', 'messaging', 'packages', 'supplier-desks', 'supplier-applications',
  'registration-agreements', 'themes', 'occasions', 'guest-shows', 'guest-photos',
  'offers', 'performers', 'money', 'reminders', 'reviews', 'settings',
]);
const financeSections = new Set(['home', 'prices', 'sales', 'purchases', 'cash', 'employees', 'tax', 'inventory', 'events', 'partners', 'reports', 'review', 'accounts', 'ledger']);
const reports = new Set(['desk', 'overview', 'customers', 'artists', 'transactions', 'costs', 'margins', 'insights']);
export type BackstageRoute = {view: string; report?: string; finance?: string};
export function readBackstageRoute(hash: string): BackstageRoute {
  const [view, report, finance] = hash.replace(/^#/, '').split('/');
  if (!views.has(view)) return {view: 'today'};
  if (view !== 'money') return {view};
  return {view, report: reports.has(report) ? report : 'desk', finance: financeSections.has(finance) ? finance : 'home'};
}
export function backstageHash(route: BackstageRoute): string {
  if (route.view !== 'money') return '#' + (views.has(route.view) ? route.view : 'today');
  return '#money/' + (reports.has(route.report ?? '') ? route.report : 'desk') + '/' + (financeSections.has(route.finance ?? '') ? route.finance : 'home');
}
export function writeBackstageRoute(route: BackstageRoute, replace = false) {
  const hash = backstageHash(route);
  if (location.pathname !== '/manage' || location.hash === hash) return;
  history[replace ? 'replaceState' : 'pushState'](null, '', hash);
}
