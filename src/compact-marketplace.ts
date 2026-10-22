import {occasionIllustration} from './discovery-illustrations.js';
import { h, copy, setCopy, t, customerLanguage } from "./customer-i18n.js";
import { mountCategoryPreview } from './category-preview.js';
import { mountHeaderRewards } from './customer-rewards.js';
import {marketplaceCollections} from './category-collections.js';
import {categoryPages, categoryPageHash, categoryPageForHash, categoryPageIncludes} from './category-pages.js';
import {catalogueNameCopy, catalogueDescriptionCopy} from './catalogue-copy.js';
import {catalogueName} from './catalogue-settings.js';
import type {Business} from './models.js';

type Options = {
  root: HTMLElement;
  bundle: () => void;
  rewards: () => void;
  account: () => void;
  artists: { id: string; name: string; photo: string; speciality: string }[];
  artist: (id: string) => void;
  business: Pick<Business, 'catalogueAppearance'>;
  design: (occasion?: string) => void;
};
let controller: AbortController | undefined;
let returnY = 0;
const decodeKey = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return "";
  }
};
const focused = new Set([
  "#offers",
  "#marketplace-agencies",
  "#marketplace-playgrounds",
  "#family-celebrations",
  "#browse-music",
  "#browse-food",
  "#browse-science",
  "#browse-inflatables",
  "#browse-food-stations",
  "#browse-party-machines",
  ...Object.keys(marketplaceCollections),
  ...categoryPages.map(page => categoryPageHash(page.key)),
  '#shows', '#event-styling', '#photography-video', '#favours-keepsakes',
]);

/** A single catalogue on the homepage, with addressable focused category views. */
export function mountCompactMarketplace({
  root,
  bundle,
  rewards,
  account,
  artists,
  artist,
  business,
  design,
}: Options) {
  controller?.abort();
  controller = new AbortController();
  const { signal } = controller;
  document.body.classList.add("compact-marketplace");
  const main = root.querySelector("main")!;
  const searchPanel = root.querySelector<HTMLElement>('.discovery-search');
  const searchInput = searchPanel?.querySelector<HTMLInputElement>('#discovery-query');
  const catalogueInput = root.querySelector<HTMLInputElement>('#find-show');
  const originalSearch = catalogueInput?.closest<HTMLElement>('.show-search');
  if (searchPanel && searchInput && catalogueInput && originalSearch) {
    originalSearch.hidden = true;
    searchPanel.id = 'marketplace-search';
    searchPanel.hidden = true;
    const searchToggle = document.createElement('button');
    searchToggle.type = 'button';
    searchToggle.className = 'header-search-toggle';
    searchToggle.setAttribute('aria-controls', searchPanel.id);
    searchToggle.setAttribute('aria-expanded', 'false');
    searchToggle.innerHTML = h('<svg aria-hidden="true" width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg><span class="search-toggle-label">Search shows & services</span>');
    const menuToggle = root.querySelector('#mobile-menu-toggle');
    if (menuToggle) menuToggle.after(searchToggle);
    else root.querySelector('.site-header')?.append(searchToggle);
    const closeSearch = document.createElement('button');
    closeSearch.type = 'button';
    closeSearch.className = 'close-search';
    closeSearch.innerHTML = h('<span aria-hidden="true">×</span><span class="search-toggle-label">Close dialog</span>');
    searchPanel.prepend(closeSearch);
    const close = () => {
      catalogueInput.value = '';
      catalogueInput.dispatchEvent(new Event('input', { bubbles: true }));
      searchPanel.hidden = true;
      searchToggle.setAttribute('aria-expanded', 'false');
      searchToggle.focus({ preventScroll: true });
    };
    searchToggle.addEventListener('click', () => {
      if (!searchPanel.hidden) { close(); return; }
      if (document.body.classList.contains('category-focused')) {
        history.pushState(null, '', location.pathname + location.search + '#main');
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      }
      searchPanel.hidden = false;
      searchToggle.setAttribute('aria-expanded', 'true');
      searchPanel.scrollIntoView({ block: 'start' });
      searchInput.focus({ preventScroll: true });
    }, { signal });
    closeSearch.addEventListener('click', close, { signal });
    searchPanel.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); close(); }
    }, { signal });
    window.addEventListener('hashchange', () => {
      if (focused.has(location.hash) || location.hash.startsWith('#offer/')) {
        searchPanel.hidden = true;
        searchToggle.setAttribute('aria-expanded', 'false');
      }
    }, { signal });
  }
  root
    .querySelectorAll(
      ".world-inspiration,#how,.show-proof,.marketplace-context,#shows > .section-heading,.show-jump",
    )
    .forEach((el) => el.remove());
  root.querySelectorAll('a[href="#how"]').forEach((el) => el.remove());
  const hero = root.querySelector(".world-hero")!;
  hero.innerHTML = h(
    '<div class="compact-welcome"><span class="bundle-discount-badge" aria-hidden="true">%</span><div><h1><span>Make a bundle.</span> <strong class="bundle-discount-copy">Request a discount.</strong></h1><p>Choose your services. We’ll review your bundle and send you a special price.</p></div><button type="button" data-make-bundle>Make a bundle <span aria-hidden="true">↗</span></button></div>',
  );
  hero.querySelector("button")!.addEventListener("click", bundle);
  const occasions = root.querySelector("#marketplace-occasions");
  occasions?.before(hero);
  occasions?.querySelectorAll<HTMLButtonElement>('[data-mp-occasion]').forEach(button=>{const illustration=occasionIllustration(button.dataset.mpOccasion??'');if(illustration)button.insertAdjacentHTML('afterbegin',illustration);});
  mountHeaderRewards(root, rewards, signal);
  const offers = root.querySelector<HTMLElement>("#offers");
  if (offers) {
    main.append(offers);
    const invitation = offers.querySelector(".bundle-invite strong");
    if (invitation) setCopy(invitation, "Request a bundle discount");
    offers.querySelectorAll(".bundle-invite button").forEach((button) => {
      setCopy(button, "Make a bundle");
    });
  }
  const family = root.querySelector<HTMLElement>("#family-celebrations");
  if (family) main.append(family);
  const agencies = root.querySelector<HTMLElement>("#marketplace-agencies");
  if (agencies) main.append(agencies);
  const places = root.querySelector<HTMLElement>("#marketplace-playgrounds");
  if (places) main.append(places);
  const schoolEvents = document.createElement('section');
  schoolEvents.id = 'category-school-events';
  schoolEvents.className = 'category-school-events';
  schoolEvents.innerHTML = h('<p>Tell us about your group, preferred date and location. We’ll help you plan the details.</p><div class="category-event-choices"><button type="button" class="outline" data-category-occasion="School event">School event<span aria-hidden="true"> ↗</span></button><button type="button" class="outline" data-category-occasion="Festival">Festival<span aria-hidden="true"> ↗</span></button></div>');
  schoolEvents.querySelectorAll<HTMLButtonElement>('button').forEach(button => button.addEventListener('click', () => design(button.dataset.categoryOccasion!), {signal}));
  main.append(schoolEvents);
  root
    .querySelectorAll<HTMLAnchorElement>(".mp-category,.mobile-site-menu a")
    .forEach((link) => {
      if (link.classList.contains('mp-category')) {
        const page = categoryPages.find(page => link.classList.contains('mp-' + page.key));
        if (page) link.href = categoryPageHash(page.key);
      }
    });
  const artistSection = root.querySelector<HTMLElement>("#performers");
  if (artistSection) {
    artistSection.innerHTML =
      h(
        '<div class="section-heading"><h2>Artist Gallery</h2></div><div class="compact-artists">',
      ) +
      artists
        .map(
          (p) =>
            h`<button type="button" class="artist-card" data-artist-profile="${p.id}">${p.photo ? h`<img src="${p.photo}" alt="" loading="lazy">` : h('<span class="artist-placeholder" aria-hidden="true">✦</span>')}<span><strong>${p.name}</strong><small>${copy(p.speciality)}</small></span><b aria-hidden="true">↗</b></button>`,
        )
        .join("") +
      h("</div>");
    artistSection
      .querySelectorAll<HTMLButtonElement>("[data-artist-profile]")
      .forEach((button) =>
        button.addEventListener("click", () =>
          artist(button.dataset.artistProfile!),
        ),
      );
  }
  root.querySelectorAll('a[href="#performers"]').forEach((link) => {
    const label = link.querySelector("strong") || link;
    setCopy(label, "Artist Gallery");
  });
  const nav = root.querySelector(".site-nav");
  if (nav && !nav.querySelector('a[href="#offers"]'))
    nav.insertAdjacentHTML(
      "afterbegin",
      h('<a href="#offers">Offers & bundles</a>'),
    );
  const routeHeader = document.createElement("div");
  routeHeader.className = "category-view-header";
  routeHeader.hidden = true;
  routeHeader.innerHTML = h(
    '<button type="button" class="outline small">← Back to categories</button><div><h2 tabindex="-1"></h2><p class="category-view-description"></p></div>',
  );
  main.prepend(routeHeader);
  routeHeader.querySelector("button")!.addEventListener("click", () => {
    history.pushState(
      null,
      "",
      location.pathname + location.search + "#marketplace-categories",
    );
    paint(true);
  });
  const allCards = [...root.querySelectorAll<HTMLElement>("#shows .show-card")];
  const emptyCategory = document.createElement('div');
  emptyCategory.className = 'category-empty-state';
  emptyCategory.hidden = true;
  emptyCategory.innerHTML = h('<p>No services are listed in this category yet.</p><button type="button" class="outline">Tell us what you need<span aria-hidden="true"> ↗</span></button>');
  emptyCategory.querySelector('button')!.addEventListener('click', () => design(), {signal});
  root.querySelector('#shows')?.prepend(emptyCategory);
  const collections=marketplaceCollections;
  let wasFocused = document.body.classList.contains("category-focused");
  function paint(restore = false, navigate = true) {
    const hash = location.hash,
      offerId = hash.startsWith("#offer/") ? decodeKey(hash.slice(7)) : "",
      page = categoryPageForHash(hash),
      active = !!page || focused.has(hash) || !!offerId,
      collection = collections[hash];
    if (active && !wasFocused) returnY = window.scrollY;
    // A chosen category replaces a previous text search rather than combining
    // with an invisible stale query and leaving its results empty.
    if (active) {
      const search = root.querySelector<HTMLInputElement>('#find-show');
      if (search?.value) {
        search.value = '';
        search.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
    document.body.classList.toggle("category-focused", active);
    document.body.classList.toggle("offer-focused", !!offerId);
    for (const section of [...main.children] as HTMLElement[]) {
      if (section === routeHeader) continue;
      section.classList.toggle(
        "route-hidden",
        active
          ? section.id !==
              (page?.section || (collection ? "shows" : offerId ? "offers" : hash.slice(1)))
          : [
              "offers",
              "family-celebrations",
              "marketplace-agencies",
              "marketplace-playgrounds",
              "category-school-events",
            ].includes(section.id),
      );
    }
    root
      .querySelectorAll(
        ".show-card.category-excluded,.show-group.category-excluded",
      )
      .forEach((el) => el.classList.remove("category-excluded"));
    if (collection || page?.section === 'shows') {
      allCards.forEach((card) => {
        const title =
          card.dataset.categoryService ||
          card.dataset.guestName ||
          card.querySelector<HTMLElement>("[data-show-details]")?.dataset
            .showDetails ||
          "";
        card.classList.toggle(
          "category-excluded",
          page ? !categoryPageIncludes(page, title, card.closest('.show-group')?.id || '') : !collection!.match.test(title),
        );
      });
      root
        .querySelectorAll("#shows .show-group")
        .forEach((group) =>
          group.classList.toggle(
            "category-excluded",
            !group.querySelector(".show-card:not(.category-excluded)"),
          ),
        );
    }
    emptyCategory.hidden = !(page?.section === 'shows' && !allCards.some(card => !card.classList.contains('category-excluded')));
    offers?.querySelector(".offer-unavailable")?.remove();
    if (offers && (page?.section === 'offers' || hash === "#offers" || offerId)) {
      offers.hidden = false;
      offers
        .querySelectorAll<HTMLElement>(".show-card")
        .forEach((card) =>
          card.classList.toggle(
            "category-excluded",
            !!offerId &&
              card.querySelector<HTMLElement>("[data-show-details]")?.dataset
                .showDetails !== offerId,
          ),
        );
      offers
        .querySelectorAll<HTMLElement>(".bundle-ideas,.bundle-invite")
        .forEach((el) => (el.hidden = !!offerId));
      if (
        offerId &&
        !offers.querySelector(".show-card:not(.category-excluded)")
      )
        offers.insertAdjacentHTML(
          "beforeend",
          h(
            '<p class="offer-unavailable">This offer is no longer available. <a href="#offers">Offers & bundles ↗</a></p>',
          ),
        );
    }
    routeHeader.hidden = !active;
    if (page) {
      routeHeader.querySelector('h2')!.innerHTML = catalogueNameCopy(business, 'category:' + page.key, page.title);
      routeHeader.querySelector('.category-view-description')!.innerHTML = catalogueDescriptionCopy(business, 'category:' + page.key, page.description);
    } else {
    routeHeader.querySelector('.category-view-description')!.replaceChildren();
    setCopy(
      routeHeader.querySelector("h2")!,
      offerId
        ? "Offers & bundles"
        : collection?.title ||
            {
              "#offers": "Offers & bundles",
              "#family-celebrations": "Baptism & First Communion",
              "#marketplace-agencies": "Entertainment agencies",
              "#marketplace-playgrounds": "Playgrounds & venues",
            }[hash] ||
            "",
    );
    }
    document.title = page ? catalogueName(business, 'category:' + page.key, page.title, customerLanguage()) + ' · Magic App' : t('Magic App · Set the scene. Make it yours.');
    if (active && navigate) {
      root
        .querySelector("#mobile-site-menu")
        ?.setAttribute("aria-hidden", "true");
      routeHeader.scrollIntoView({ block: "start" });
      routeHeader.querySelector<HTMLElement>('h2')!.focus({preventScroll:true});
    } else if (!active && navigate && (wasFocused || restore)) {
      window.scrollTo({ top: returnY });
      const heading = root.querySelector<HTMLElement>('#marketplace-categories h2');
      if (heading) { heading.tabIndex = -1; heading.focus({preventScroll:true}); }
    }
    wasFocused = active;
  }
  window.addEventListener("hashchange", () => paint(), { signal });
  window.addEventListener("popstate", () => paint(), { signal });
  document.addEventListener('customerlanguagechange', () => paint(false, false), {signal});
  window.addEventListener(
    "hashchange",
    () => {
      if (location.hash.startsWith("#booking/")) account();
    },
    { signal },
  );
  root.addEventListener(
    "click",
    (event) => {
      const link = (event.target as Element).closest<HTMLAnchorElement>(
        'a[href^="#"]',
      );
      if (link && focused.has(link.hash) && link.hash === location.hash)
        paint();
    },
    { signal },
  );
  paint();
  mountCategoryPreview(root,signal);
  if (location.hash.startsWith("#booking/")) account();
}
