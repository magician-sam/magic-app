import {h, setCopy} from './customer-i18n.js';
import {defaultSeasonalTheme,effectiveTheme,isThemeKey,themePresets,type SeasonalTheme} from './seasonal-themes.js';

let lifecycle: AbortController | undefined;
const dismissalKey = 'magic-app:christmas-companions:2026';

/** A seasonal presentation only: no price, tax, booking or discount rules change. */
export function christmasMarketActive(now = new Date()) {
  return effectiveTheme(defaultSeasonalTheme(),now)==='christmas';
}

// Original small vector characters. No remote image, animation library or tracking.
const companions = `<svg viewBox="0 0 190 95" aria-hidden="true" focusable="false">
  <ellipse cx="55" cy="88" rx="33" ry="3" fill="#092d2330"/><ellipse cx="145" cy="88" rx="30" ry="3" fill="#092d2330"/>
  <g class="cm-santa">
    <path d="M32 52Q14 38 16 66Q18 80 34 75" fill="#ad864a"/><path d="m24 44 5 8" stroke="#e9cd8b" stroke-width="3"/>
    <g class="cm-leg cm-leg-a"><path d="M45 69v14h-9" fill="none" stroke="#a92236" stroke-width="10" stroke-linecap="round"/><path d="M45 84H34" stroke="#223932" stroke-width="7" stroke-linecap="round"/></g>
    <g class="cm-leg cm-leg-b"><path d="M61 69v14h8" fill="none" stroke="#b9273e" stroke-width="10" stroke-linecap="round"/><path d="M61 84h12" stroke="#223932" stroke-width="7" stroke-linecap="round"/></g>
    <path d="M36 49Q53 39 67 50l4 22Q52 81 32 71Z" fill="#d43e4e"/><path d="M33 70q20 7 38 0" fill="none" stroke="#fff4df" stroke-width="6"/><path d="M33 62h37" stroke="#273d34" stroke-width="6"/><rect x="48" y="58" width="10" height="8" rx="1" fill="#e6ba5f"/><rect x="51" y="60" width="4" height="4" fill="#273d34"/>
    <g class="cm-wave"><path d="m66 50 10 5 6-12" fill="none" stroke="#cb3447" stroke-width="9" stroke-linecap="round"/><path d="m80 45 3-7" stroke="#fff4df" stroke-width="10" stroke-linecap="round"/><ellipse cx="84" cy="36" rx="6" ry="7" fill="#dbb071"/></g>
    <circle cx="53" cy="33" r="16" fill="#f4c6a2"/><path d="M37 33Q33 57 53 58Q73 55 69 33l-8 10-8-2-9 2Z" fill="#fff5e4"/><ellipse cx="55" cy="37" rx="5" ry="4" fill="#eaaa89"/><circle cx="47" cy="30" r="1.6" fill="#263d34"/><circle cx="60" cy="30" r="1.6" fill="#263d34"/><path d="M50 48q4 4 8-1" fill="none" stroke="#a84e4e" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M37 22Q40 0 59 9l13 11-14-2Z" fill="#cf3548"/><path d="M38 23q15-5 29 1" stroke="#fff5e4" stroke-width="7" stroke-linecap="round"/><circle cx="73" cy="20" r="6" fill="#fff5e4"/>
  </g>
  <g class="cm-reindeer">
    <g class="cm-leg cm-leg-b"><path d="m130 63-3 20h-7M151 63l7 20h7" fill="none" stroke="#926041" stroke-width="5" stroke-linecap="round"/></g>
    <ellipse cx="140" cy="58" rx="24" ry="14" fill="#b98252"/><path d="m119 55-9-7 4 14" fill="#fff0cf"/>
    <g class="cm-leg cm-leg-a"><path d="m131 64 7 19h7M155 63l-5 20h7" fill="none" stroke="#c7905b" stroke-width="5" stroke-linecap="round"/></g>
    <path d="m153 51 4-23 14 2 1 27" fill="#c7905b"/><path d="m158 29-9-8q-7 10 6 15M170 27l9-8q7 10-4 16" fill="#bd8551" stroke="#91613d" stroke-width="1.5"/>
    <g fill="none" stroke="#72523c" stroke-width="3" stroke-linecap="round"><path d="M160 27 155 8l-7-4M156 15l-8-1M169 26l2-20 6-4M172 13l8-3"/></g>
    <ellipse cx="166" cy="37" rx="13" ry="14" fill="#c7905b"/><ellipse cx="175" cy="43" rx="11" ry="7" fill="#f2d6af"/><circle cx="183" cy="40" r="4" fill="#d43e4e"/><circle cx="167" cy="34" r="2" fill="#263d34"/><circle cx="166.5" cy="33.5" r=".6" fill="#fff"/><path d="m171 47 5 1" stroke="#80543d" stroke-width="1.2" stroke-linecap="round"/>
    <path d="m155 50 16 2" stroke="#b4273b" stroke-width="5"/><circle cx="160" cy="55" r="4" fill="#efd08b"/><path d="m160 53 0 4" stroke="#99733d"/>
  </g>
</svg>`;

export function mountChristmasMarket(root: HTMLElement, settings:SeasonalTheme = defaultSeasonalTheme()) {
  lifecycle?.abort(); lifecycle = new AbortController();
  const {signal} = lifecycle;
  document.body.classList.remove('christmas-market','seasonal-market');
  if (!document.body.classList.contains('customer-surface')) return;
  const hero = root.querySelector<HTMLElement>('.world-hero');
  const categories = root.querySelector<HTMLElement>('#marketplace-categories');
  if (!hero || !categories) return;
  const params=new URLSearchParams(location.search),preview=params.get('theme-preview');
  const chosen=isThemeKey(preview)?preview:effectiveTheme(settings);
  document.body.dataset.seasonalTheme=chosen;
  if(isThemeKey(preview)){
    const message=document.createElement('div');message.className='theme-preview-notice';
    message.innerHTML=h('<span>Theme preview — the live theme has not changed.</span><a href="#">Return to live theme</a>');
    const link=message.querySelector<HTMLAnchorElement>('a')!,url=new URL(location.href);url.searchParams.delete('theme-preview');url.searchParams.delete('theme-motion');link.href=url.href;
    root.prepend(message);
  }
  if(chosen==='standard')return;
  const preset=themePresets.find(p=>p.key===chosen)!;
  document.body.classList.add('seasonal-market');document.body.dataset.seasonalTheme=chosen;
  for(const [key,value]of Object.entries({paper:preset.paper,ink:preset.ink,accent:preset.accent,soft:preset.soft,trim:preset.trim}))document.body.style.setProperty('--season-'+key,value);
  if(chosen!=='christmas'){
    const border=document.createElement('div');border.className='cm-seasonal-line';border.setAttribute('aria-hidden','true');
    border.innerHTML=Array.from({length:18},()=>`<span>${preset.symbol}</span>`).join('');root.querySelector('.site-header')?.after(border);return;
  }
  document.body.classList.add('christmas-market');
  const trees = document.createElement('div'); trees.className = 'cm-tree-line'; trees.setAttribute('aria-hidden','true');
  trees.innerHTML = Array.from({length:18}, () => '<span><i></i></span>').join('');
  root.querySelector('.site-header')?.after(trees);
  const intro = categories.querySelector('h2');
  if (intro) setCopy(intro, 'Find a little Christmas magic.');
  categories.querySelector('.mp-section-intro')?.insertAdjacentHTML('beforeend', h('<p class="cm-intro">Your favourite people, places and festive finishing touches.</p>'));
  const welcome = hero.querySelector('.compact-welcome');
  welcome?.classList.add('cm-welcome');
  const headline = welcome?.querySelector('h1');
  if (headline) headline.innerHTML = h('<span>Wrap up a little wonder.</span> <strong class="bundle-discount-copy">Request a Christmas discount.</strong>');
  const note = welcome?.querySelector('p');
  if (note) setCopy(note, 'Choose your services. We’ll review your bundle and send you a special price.');
  const badge = welcome?.querySelector('.bundle-discount-badge');
  if (badge) badge.innerHTML = '<span>%</span>';
  const controls = document.createElement('div'); controls.className = 'cm-companion-controls';
  controls.innerHTML = h('<button type="button" class="cm-play">Santa & his little helper <span aria-hidden="true">↗</span></button><button type="button" class="cm-dismiss" aria-label="Hide Santa and reindeer">×</button>');
  const road = document.createElement('div'); road.className = 'cm-parade';
  road.setAttribute('aria-hidden','true'); road.innerHTML = `<div class="cm-travellers">${companions}</div>`;
  hero.append(controls, road);
  const playButton = controls.querySelector<HTMLButtonElement>('.cm-play')!;
  const closeButton = controls.querySelector<HTMLButtonElement>('.cm-dismiss')!;
  const travellers = road.querySelector<HTMLElement>('.cm-travellers')!;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const phone = matchMedia('(max-width: 600px)');
  const animationAllowed=(isThemeKey(preview)?params.get('theme-motion')!=='false':settings.animations)&&typeof travellers.animate==='function';
  let dismissed = false, animation: Animation | undefined, timer: ReturnType<typeof setTimeout> | undefined;
  try { dismissed = sessionStorage.getItem(dismissalKey) === 'hidden'; } catch { /* Optional device preference. */ }
  const stop = () => { clearTimeout(timer); animation?.cancel(); animation=undefined; road.classList.remove('is-playing','is-waving'); };
  const blocked = () => document.hidden || !root.isConnected || !!document.querySelector('dialog[open]') || document.body.classList.contains('category-focused') || document.body.classList.contains('site-menu-open') || !!document.activeElement?.matches('input,select,textarea,[contenteditable="true"]');
  function play(manual = false) {
    stop();
    if (dismissed || reduced.matches || !animationAllowed || blocked()) { if(!manual) schedule(); return; }
    const distance = Math.max(road.clientWidth, 240), reverse = Math.random() > .5;
    road.classList.add('is-playing'); road.classList.toggle('is-reversed', reverse);
    animation = travellers.animate([
      {transform:'translateX(-190px)',offset:0},
      {transform:`translateX(${distance*.48-85}px)`,offset:.38},
      {transform:`translateX(${distance*.48-85}px)`,offset:.62},
      {transform:`translateX(${distance+10}px)`,offset:1},
    ], {duration:phone.matches?14000:17000,easing:'linear',fill:'both'});
    timer = setTimeout(() => {
      road.classList.add('is-waving');
      timer = setTimeout(() => road.classList.remove('is-waving'), (phone.matches?14000:17000)*.24);
    }, (phone.matches?14000:17000)*.38);
    animation.onfinish = () => { stop(); if(!phone.matches) schedule(); };
  }
  function schedule(initial = false) {
    if (dismissed || reduced.matches || !animationAllowed) return;
    timer = setTimeout(() => play(), initial ? 2800 + Math.random()*2500 : 80000 + Math.random()*40000);
  }
  function paintPreference() {
    stop(); road.hidden = dismissed || reduced.matches || !animationAllowed;
    closeButton.hidden = dismissed || reduced.matches || !animationAllowed;
    setCopy(playButton, reduced.matches || !animationAllowed ? 'A little Christmas magic' : dismissed ? 'Show Santa & reindeer' : 'Santa & his little helper');
    playButton.disabled = reduced.matches || !animationAllowed;
    playButton.setAttribute('aria-pressed',String(!dismissed && !reduced.matches && animationAllowed));
    if (!dismissed && !reduced.matches && animationAllowed) schedule(true);
  }
  playButton.addEventListener('click', () => { dismissed=false;try{sessionStorage.removeItem(dismissalKey);}catch{/* Optional. */}paintPreference();play(true); }, {signal});
  closeButton.addEventListener('click', () => { dismissed=true;try{sessionStorage.setItem(dismissalKey,'hidden');}catch{/* Optional. */}paintPreference();playButton.focus({preventScroll:true}); }, {signal});
  reduced.addEventListener('change', paintPreference, {signal});
  document.addEventListener('visibilitychange', () => { stop(); if(!document.hidden && !phone.matches) schedule(); }, {signal});
  document.addEventListener('focusin', () => { if(blocked()) stop(); }, {signal});
  window.addEventListener('hashchange', () => { stop(); if(!phone.matches) schedule(); }, {signal});
  const observer = new MutationObserver(() => { if(blocked()) stop(); });
  const modal = document.querySelector('#modal'); if(modal) observer.observe(modal,{attributes:true,attributeFilter:['open']});
  signal.addEventListener('abort', () => { stop();observer.disconnect(); }, {once:true});
  paintPreference();
}
