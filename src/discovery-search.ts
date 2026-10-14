import { h, t, setCopy } from "./customer-i18n.js";
/** The shared catalogue matcher stays the source of show/service results.
 * Approved partner discovery can join the same customer search submission. */
export function mountDiscoverySearch(root: HTMLElement, helpChoose: () => void, searchPartners?: (query: string) => Promise<string | null>) {
  const hero = root.querySelector('.world-hero');
  const catalogueSearch = root.querySelector<HTMLInputElement>('#find-show');
  if (!hero || !catalogueSearch) return;

  const section = document.createElement('section');
  section.className = 'discovery-search';
  section.setAttribute('aria-label', 'Find a show or service');
  section.innerHTML = h`<div><span class="eyebrow">Follow that spark</span><h2>Have an act in mind?</h2><p>Find a favourite, or let an idea surprise you.</p></div><form role="search"><label for="discovery-query">Search shows & services</label><div class="discovery-search-controls"><input id="discovery-query" type="search" maxlength="100" placeholder="Try juggling, cake or DJ…" autocomplete="off" list="discovery-suggestions"><button type="submit">Show matches <span aria-hidden="true">↗</span></button></div><datalist id="discovery-suggestions"></datalist><p>Not sure where to begin? <button type="button" class="link" data-discovery-help>Help me choose</button></p></form>`;
  const input = section.querySelector<HTMLInputElement>('input')!;
  const list = section.querySelector('datalist')!;
  for (const name of new Set([...root.querySelectorAll('#shows .show-card h3')].map(heading => heading.querySelector<HTMLElement>('[data-customer-copy]')?.dataset.customerCopy ?? heading.textContent?.trim()).filter(Boolean))) {
    const option = document.createElement('option');
    option.value = t(name!); option.dataset.customerValue = name!;
    list.append(option);
  }
  const clear = document.createElement('button');
  clear.type = 'button';
  clear.className = 'link catalogue-clear';
  setCopy(clear, 'Clear search · see everything');
  clear.hidden = !catalogueSearch.value.trim();
  catalogueSearch.closest('.show-search')!.append(clear);
  const update = () => {
    input.value = catalogueSearch.value;
    clear.hidden = !catalogueSearch.value.trim();
  };
  catalogueSearch.addEventListener('input', update);
  clear.addEventListener('click', () => {
    submitted++;
    catalogueSearch.value = '';
    catalogueSearch.dispatchEvent(new Event('input', { bubbles: true }));
    void searchPartners?.('');
    catalogueSearch.focus({ preventScroll: true });
  });
  let submitted = 0;
  input.addEventListener('input', () => {
    submitted++;
    catalogueSearch.value=input.value;
    catalogueSearch.dispatchEvent(new Event('input',{bubbles:true}));
  });
  section.querySelector('form')!.addEventListener('submit', event => {
    event.preventDefault();
    catalogueSearch.value = input.value.trim();
    catalogueSearch.dispatchEvent(new Event('input', { bubbles: true }));
    const serial=++submitted, query=catalogueSearch.value;
    const hasShows=!!root.querySelector('#shows .show-card:not([hidden])');
    input.blur(); catalogueSearch.blur();
    const scroll=(target:string)=>root.querySelector(target)?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
    scroll('.show-search');
    if(!hasShows)void searchPartners?.(query).then(partnerTarget=>{
      if(serial===submitted&&query===catalogueSearch.value&& !hasShows&&partnerTarget)scroll(partnerTarget);
    }).catch(()=>{ /* The catalogue and its reset remain usable during a directory outage. */ });
  });
  section.querySelector('[data-discovery-help]')!.addEventListener('click', helpChoose);
  hero.after(section);
}

export function appendMarketplaceHelp(root: HTMLElement, slug: string) {
  if (slug !== 'magic-by-sam') return;
  const footer = root.querySelector('.footer');
  if (!footer || footer.querySelector('.marketplace-help-links')) return;
  const links = document.createElement('nav');
  links.className = 'marketplace-help-links';
  links.setAttribute('aria-label', 'Booking, privacy and content information');
  links.innerHTML = h('<a href="/booking-guide.html">Booking guide</a><a href="/privacy.html">Privacy & your data</a><a href="/content-and-credits.html">Content & credits</a>');
  footer.append(links);
}
