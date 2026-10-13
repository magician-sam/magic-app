/** A shortcut into the existing full catalogue, never a second search index. */
export function mountDiscoverySearch(root: HTMLElement, helpChoose: () => void) {
  const hero = root.querySelector('.world-hero');
  const catalogueSearch = root.querySelector<HTMLInputElement>('#find-show');
  if (!hero || !catalogueSearch) return;

  const section = document.createElement('section');
  section.className = 'discovery-search';
  section.setAttribute('aria-label', 'Find a show or service');
  section.innerHTML = `<div><span class="eyebrow">Follow that spark</span><h2>Have an act in mind?</h2><p>Find a favourite, or let an idea surprise you.</p></div><form role="search"><label for="discovery-query">Search shows & services</label><div class="discovery-search-controls"><input id="discovery-query" type="search" maxlength="100" placeholder="Try juggling, cake or DJ…" autocomplete="off" list="discovery-suggestions"><button type="submit">Show matches <span aria-hidden="true">↗</span></button></div><datalist id="discovery-suggestions"></datalist><p>Not sure where to begin? <button type="button" class="link" data-discovery-help>Help me choose</button></p></form>`;
  const input = section.querySelector<HTMLInputElement>('input')!;
  const list = section.querySelector('datalist')!;
  for (const name of new Set([...root.querySelectorAll('#shows .show-card h3')].map(heading => heading.textContent?.trim()).filter(Boolean))) {
    const option = document.createElement('option');
    option.value = name!;
    list.append(option);
  }
  const clear = document.createElement('button');
  clear.type = 'button';
  clear.className = 'link catalogue-clear';
  clear.textContent = 'Clear search · see everything';
  clear.hidden = !catalogueSearch.value.trim();
  catalogueSearch.closest('.show-search')!.append(clear);
  const update = () => {
    input.value = catalogueSearch.value;
    clear.hidden = !catalogueSearch.value.trim();
  };
  catalogueSearch.addEventListener('input', update);
  clear.addEventListener('click', () => {
    catalogueSearch.value = '';
    catalogueSearch.dispatchEvent(new Event('input', { bubbles: true }));
    catalogueSearch.focus({ preventScroll: true });
  });
  section.querySelector('form')!.addEventListener('submit', event => {
    event.preventDefault();
    catalogueSearch.value = input.value.trim();
    catalogueSearch.dispatchEvent(new Event('input', { bubbles: true }));
    root.querySelector('#shows')!.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    catalogueSearch.focus({ preventScroll: true });
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
  links.innerHTML = '<a href="/booking-guide.html">Booking guide</a><a href="/privacy.html">Privacy & your data</a><a href="/content-and-credits.html">Content & credits</a>';
  footer.append(links);
}
