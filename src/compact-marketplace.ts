import { h, copy, setCopy } from "./customer-i18n.js";
import { mountCategoryPreview } from './category-preview.js';

type Options = {
  root: HTMLElement;
  bundle: () => void;
  rewards: () => void;
  account: () => void;
  artists: { id: string; name: string; photo: string; speciality: string }[];
  artist: (id: string) => void;
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
]);

/** A single catalogue on the homepage, with addressable focused category views. */
export function mountCompactMarketplace({
  root,
  bundle,
  rewards,
  account,
  artists,
  artist,
}: Options) {
  controller?.abort();
  controller = new AbortController();
  const { signal } = controller;
  document.body.classList.add("compact-marketplace");
  const main = root.querySelector("main")!;
  root
    .querySelectorAll(
      ".world-inspiration,#how,.show-proof,.marketplace-context,#shows > .section-heading,.show-jump",
    )
    .forEach((el) => el.remove());
  root.querySelectorAll('a[href="#how"]').forEach((el) => el.remove());
  const hero = root.querySelector(".world-hero")!;
  hero.innerHTML = h(
    '<div class="compact-welcome"><span class="bundle-discount-badge" aria-hidden="true">%</span><div><span class="bundle-discount-label">Bundle discount</span><h1>Your event. A little magic.</h1><p>Choose your services. Request a bundle discount.</p></div><button type="button" data-make-bundle>Make a bundle <span aria-hidden="true">↗</span></button></div>',
  );
  hero.querySelector("button")!.addEventListener("click", bundle);
  const occasions = root.querySelector("#marketplace-occasions");
  occasions?.before(hero);
  const occasionArt: Record<string, string> = {
    Birthday: '<path d="M5 12h22v15H5zM4 18h24M9 12V8m7 4V8m7 4V8M9 4v1m7-1v1m7-1v1"/>',
    "School event": '<path d="M16 8C11 4 5 5 3 6v20c4-2 9-1 13 2 4-3 9-4 13-2V6c-2-1-8-2-13 2Zm0 0v20M7 11l5 1M7 16l5 1m8-5 5-1m-5 6 5-1"/>',
    Festival: '<path d="m16 3 13 13H3L16 3Zm-11 13v12h22V16M12 28V18h8v10M16 3V1m0 0h7l-3 3"/>',
    "Corporate event": '<rect x="4" y="10" width="24" height="18" rx="3"/><path d="M11 10V5h10v5M4 17c8 5 16 5 24 0m-12 1v5"/>',
    Wedding: '<circle cx="11" cy="20" r="8"/><circle cx="22" cy="20" r="8"/><path d="m8 4 3-3 3 3-3 4-3-4Zm11 1 3-3 3 3-3 4-3-4Z"/>',
    Christmas: '<path d="m16 4-8 9h4l-7 8h7l-4 5h16l-4-5h7l-7-8h4L16 4Zm0 22v4M3 7h4M5 5v4m21 0h4m-2-2v4"/>',
    Baptism: '<path d="M16 28S3 20 3 11C3 3 12 2 16 9c4-7 13-6 13 2 0 9-13 17-13 17Z"/>',
    "First Communion": '<path d="M12 13h8v15h-8zM8 28h16M16 10c-5-1-4-5 0-9 4 4 5 8 0 9Zm-4 8h8"/>',
  };
  occasions
    ?.querySelectorAll<HTMLButtonElement>("[data-mp-occasion]")
    .forEach((button) => {
      const art = occasionArt[button.dataset.mpOccasion || ""];
      if (art)
        button.insertAdjacentHTML(
          "afterbegin",
          `<svg class="occasion-art" aria-hidden="true" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${art}</svg>`,
        );
    });
  const reward = root.querySelector<HTMLElement>("#rewards");
  if (reward) {
    reward.className = "compact-rewards";
    reward.innerHTML = h(
      '<span class="reward-gift" aria-hidden="true">✧</span><span><strong>Invite friends. Earn magic.</strong><small>5 tokens = a free magic show</small></span><button type="button" class="outline small">Invite ↗</button><button type="button" class="link small" data-reward-rules>How to earn</button>',
    );
    reward.querySelector("button")!.addEventListener("click", rewards);
    reward
      .querySelector("[data-reward-rules]")!
      .addEventListener("click", rewards);
    root.querySelector(".discovery-search")?.after(reward);
  }
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
  root
    .querySelectorAll<HTMLAnchorElement>(".mp-category,.mobile-site-menu a")
    .forEach((link) => {
      if (link.classList.contains("mp-music")) link.href = "#browse-music";
      if (link.classList.contains("mp-food")) link.href = "#browse-food";
      if (link.classList.contains("mp-science")) link.href = "#browse-science";
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
    '<button type="button" class="outline small">← Explore all</button><h2></h2>',
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
  const collections: Record<string, { title: string; match: RegExp }> = {
    "#browse-music": {
      title: "Music & sound",
      match: /\bDJ\b|Sound System|Live Music|Parades/i,
    },
    "#browse-food": { title: "Food & cakes", match: /Food|Beverage|Cake/i },
    "#browse-science": {
      title: "Science & workshops",
      match: /Science|Workshop/i,
    },
  };
  let wasFocused = document.body.classList.contains("category-focused");
  function paint(restore = false) {
    const hash = location.hash,
      offerId = hash.startsWith("#offer/") ? decodeKey(hash.slice(7)) : "",
      active = focused.has(hash) || !!offerId,
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
              (collection ? "shows" : offerId ? "offers" : hash.slice(1))
          : [
              "offers",
              "family-celebrations",
              "marketplace-agencies",
              "marketplace-playgrounds",
            ].includes(section.id),
      );
    }
    root
      .querySelectorAll(
        ".show-card.category-excluded,.show-group.category-excluded",
      )
      .forEach((el) => el.classList.remove("category-excluded"));
    if (collection) {
      allCards.forEach((card) => {
        const title =
          card.dataset.guestName ||
          card.querySelector<HTMLElement>("[data-show-details]")?.dataset
            .showDetails ||
          "";
        card.classList.toggle(
          "category-excluded",
          !collection.match.test(title),
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
    offers?.querySelector(".offer-unavailable")?.remove();
    if (offers && (hash === "#offers" || offerId)) {
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
    if (active) {
      root
        .querySelector("#mobile-site-menu")
        ?.setAttribute("aria-hidden", "true");
      routeHeader.scrollIntoView({ block: "start" });
    } else if (wasFocused || restore) window.scrollTo({ top: returnY });
    wasFocused = active;
  }
  window.addEventListener("hashchange", () => paint(), { signal });
  window.addEventListener("popstate", () => paint(), { signal });
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
