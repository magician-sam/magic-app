import { h, t, copy, setCopy } from "./customer-i18n.js";
const escape = (value: string) => value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
let languageListener=new AbortController();
/** The shared catalogue matcher stays the source of show/service results.
 * Approved partner discovery can join the same customer search submission. */
export function mountDiscoverySearch(root: HTMLElement, helpChoose: () => void, searchPartners?: (query: string) => Promise<HTMLElement[]>) {
  languageListener.abort();languageListener=new AbortController();
  const hero = root.querySelector('.world-hero');
  const catalogueSearch = root.querySelector<HTMLInputElement>('#find-show');
  if (!hero || !catalogueSearch) return;

  const section = document.createElement('section');
  section.className = 'discovery-search';
  section.setAttribute('aria-label', 'Find a show or service');
  section.innerHTML = h`<div class="discovery-intro"><h2>Find your favourites</h2></div><form role="search"><label for="discovery-query">Search shows & services</label><div class="discovery-search-controls"><input id="discovery-query" type="search" maxlength="100" placeholder="Try juggling, cake or DJ…" autocomplete="off" list="discovery-suggestions"><button type="submit">Show matches <span aria-hidden="true">↗</span></button></div><datalist id="discovery-suggestions"></datalist><p><button type="button" class="link" data-discovery-help>Help me choose</button></p></form>`;
  const input = section.querySelector<HTMLInputElement>('input')!;
  input.setAttribute('enterkeyhint','search');
  const results=document.createElement('div');results.className='discovery-results';results.hidden=true;
  section.append(results);
  let partnerTargets:HTMLElement[]=[],partnerQuery='',partnerLoading=false,showAllResults=false;
  let partnerTimer: ReturnType<typeof setTimeout> | undefined;
  const paintResults=()=>{
    const query=catalogueSearch.value.trim();results.hidden=!query;
    if(!query){results.replaceChildren();return;}
    const shows=[...root.querySelectorAll<HTMLElement>('#shows .show-card:not([hidden]), #offers .show-card:not([hidden])')];
    const partners=partnerQuery===query?partnerTargets:[];
    const matches=[...shows,...partners];
    results.innerHTML=h`<p class="discovery-result-count" role="status">${partnerLoading&&!matches.length?copy('Finding your next setting…'):copy('Matches found')+': '+matches.length}</p><div class="discovery-result-grid">${matches.slice(0,showAllResults?matches.length:8).map((card,index)=>{
      const heading=card.querySelector('h3')!;
      const name=heading.querySelector<HTMLElement>('[data-customer-copy]')?.dataset.customerCopy??heading.textContent?.trim()??'';
      const image=card.querySelector<HTMLImageElement>('img');
      return h`<button type="button" class="discovery-result" data-result-index="${index}">${image?h`<img src="${escape(image.getAttribute('src')??'')}" alt="" loading="lazy">`:h('<span class="discovery-result-spark" aria-hidden="true">✦</span>')}<span><strong>${copy(name)}</strong><small>${copy(card.classList.contains('show-card')?'Explore this service ↗':'Explore ↗')}</small></span></button>`;
    }).join('')}</div>${partnerLoading&&matches.length?h('<p>Finding your next setting…</p>'):''}${matches.length>8&&!showAllResults?h('<button type="button" class="link" data-all-matches>See all matching services ↗</button>'):matches.length||partnerLoading?'':h('<p>No matching shows or services. Try a shorter name, another language or clear your search to explore everything.</p>')}<button type="button" class="link" data-clear-discovery>Clear search · see everything</button>`;
    results.querySelectorAll<HTMLButtonElement>('[data-result-index]').forEach(button=>button.addEventListener('click',()=>{
      matches[Number(button.dataset.resultIndex)]?.querySelector<HTMLButtonElement>('[data-show-details], [data-enquiry-details], [data-playtown-open], [data-mp-profile]')?.click();
    }));
    results.querySelector('[data-all-matches]')?.addEventListener('click',()=>{showAllResults=true;paintResults();});
    results.querySelector('[data-clear-discovery]')!.addEventListener('click',()=>{
      submitted++;catalogueSearch.value='';catalogueSearch.dispatchEvent(new Event('input',{bubbles:true}));
    });
  };
  const list = section.querySelector('datalist')!;
  for (const name of new Set([...root.querySelectorAll('#shows .show-card h3, #offers .show-card h3')].map(heading => heading.querySelector<HTMLElement>('[data-customer-copy]')?.dataset.customerCopy ?? heading.textContent?.trim()).filter(Boolean))) {
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
    if(catalogueSearch.value.trim()!==partnerQuery){submitted++;partnerTargets=[];partnerLoading=false;showAllResults=false;}
    clear.hidden = !catalogueSearch.value.trim();
    paintResults();
  };
  catalogueSearch.addEventListener('input', () => {update();findPartners();});
  clear.addEventListener('click', () => {
    submitted++;
    partnerTargets=[];partnerLoading=false;
    catalogueSearch.value = '';
    catalogueSearch.dispatchEvent(new Event('input', { bubbles: true }));
    catalogueSearch.focus({ preventScroll: true });
  });
  let submitted = 0;
  function findPartners(immediate = false) {
    clearTimeout(partnerTimer);
    const serial=++submitted, query=catalogueSearch!.value.trim();
    partnerQuery=query;partnerTargets=[];
    partnerLoading=!!searchPartners&&query.length>=2;
    paintResults();
    if(!partnerLoading)return;
    const run=async()=>{
      if(serial!==submitted||!section.isConnected)return;
      try {
        const targets=await searchPartners!(query);
        if(serial!==submitted||!section.isConnected||query!==catalogueSearch!.value.trim())return;
        partnerTargets=targets;partnerLoading=false;paintResults();
      } catch {
        if(serial===submitted&&section.isConnected){partnerLoading=false;paintResults();}
      }
    };
    if(immediate)void run();
    else partnerTimer=setTimeout(()=>void run(),300);
  }
  languageListener.signal.addEventListener('abort',()=>{clearTimeout(partnerTimer);submitted++;},{once:true});
  input.addEventListener('input', () => {
    submitted++;
    partnerTargets=[];partnerLoading=false;
    catalogueSearch.value=input.value;
    catalogueSearch.dispatchEvent(new Event('input',{bubbles:true}));
  });
  section.querySelector('form')!.addEventListener('submit', event => {
    event.preventDefault();
    catalogueSearch.value = input.value.trim();
    catalogueSearch.dispatchEvent(new Event('input', { bubbles: true }));
    findPartners(true);
    input.blur(); catalogueSearch.blur();
    const scroll=(target:string)=>root.querySelector(target)?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
    // Results sit beside the query. Mobile keyboard resizing cannot strand
    // customers above a distant catalogue card.
    scroll('.discovery-search');
  });
  section.querySelector('[data-discovery-help]')!.addEventListener('click', helpChoose);
  document.addEventListener('customerlanguagechange',()=>{if(section.isConnected)paintResults();},{signal:languageListener.signal});
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
