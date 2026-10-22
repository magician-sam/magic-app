import {h, setCopy} from './customer-i18n.js';
import {defaultSeasonalTheme,effectiveTheme,isThemeKey,themePresets,type SeasonalTheme} from './seasonal-themes.js';
import {christmasCompanions} from './christmas-companions.js';
import {festivePosition} from './festive-position.js';

let lifecycle: AbortController | undefined;
const dismissalKey = 'magic-app:christmas-companions:2026';

/** A seasonal presentation only: no price, tax, booking or discount rules change. */
export function christmasMarketActive(now = new Date()) {
  return effectiveTheme(defaultSeasonalTheme(),now)==='christmas';
}


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
  const home = document.createElement('div');home.className='cm-character-home';home.hidden=true;
  const stage=document.createElement('div');stage.className='cm-floating-companions';stage.hidden=true;
  stage.innerHTML=`<div class="cm-magic-aura" aria-hidden="true"></div><div class="cm-flight-art">${christmasCompanions}</div>`+h('<button type="button" class="cm-float-dismiss" aria-label="Hide Santa and reindeer">×</button>');
  hero.append(controls,home);document.body.append(stage);
  const playButton = controls.querySelector<HTMLButtonElement>('.cm-play')!;
  const closeButton = controls.querySelector<HTMLButtonElement>('.cm-dismiss')!;
  const art=stage.querySelector<HTMLElement>('.cm-flight-art')!,santa=stage.querySelector<SVGElement>('.cm-santa-figure')!;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const phone = matchMedia('(max-width: 600px)');
  const animationAllowed=(isThemeKey(preview)?params.get('theme-motion')!=='false':settings.animations)&&typeof art.animate==='function';
  let dismissed=false,timer:ReturnType<typeof setTimeout>|undefined,phaseTimer:ReturnType<typeof setTimeout>|undefined,endTimer:ReturnType<typeof setTimeout>|undefined,animations:Animation[]=[],previous:{x:number;y:number}|undefined;
  try { dismissed = sessionStorage.getItem(dismissalKey) === 'hidden'; } catch { /* Optional device preference. */ }
  const stop=()=>{clearTimeout(timer);clearTimeout(phaseTimer);clearTimeout(endTimer);endTimer=undefined;timer=undefined;phaseTimer=undefined;const active=animations;animations=[];for(const animation of active){animation.onfinish=null;animation.cancel();}stage.hidden=true;stage.dataset.phase='hidden';stage.classList.remove('is-playing','is-home');home.hidden=true;if(stage.parentElement!==document.body)document.body.append(stage);};
  const blocked=()=>document.hidden||!root.isConnected||!!document.querySelector('dialog[open]')||document.body.classList.contains('site-menu-open')||!!document.activeElement?.matches('input,select,textarea,[contenteditable="true"]');
  function position(){
    const width=document.documentElement.clientWidth,height=window.innerHeight,size=phone.matches?{width:112,height:100}:{width:180,height:154};
    const visible=(n:HTMLElement)=>!stage.contains(n)&&!!n.getClientRects().length;
    const inView=(r:DOMRect)=>r.width>0&&r.height>0&&r.bottom>0&&r.top<height&&r.right>0&&r.left<width;
    const protectedAreas=[...document.querySelectorAll<HTMLElement>('.site-header,.marketplace-phone-nav,.customer-phone-nav,.floating-whatsapp,.phone-event-bar,.event-selection-tray,#notice,label,input,select,textarea,button,a:not(.mp-category)')].filter(visible).filter(n=>!n.matches('button,a')||!n.querySelector('img')).map(n=>n.getBoundingClientRect()).filter(inView);
    const readingAreas=[...document.querySelectorAll<HTMLElement>('h1,h2,h3,p,.mp-category strong,.mp-category-icon,.mp-category-arrow')].filter(visible).map(n=>{const r=n.getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height,weight:n.matches('.mp-category-icon,.mp-category-arrow')?1:10};}).filter(r=>r.width&&r.height&&r.bottom>0&&r.top<height);
    const result=festivePosition(width,height,size.width,size.height,protectedAreas,previous,Math.random,readingAreas);
    if(result){stage.style.setProperty('--cm-x',result.x+'px');stage.style.setProperty('--cm-y',result.y+'px');previous=result;}
    return result;
  }
  function play(manual = false) {
    stop();
    if (dismissed || reduced.matches || !animationAllowed || blocked()) { if(!manual) schedule(); return; }
    if(!position()){
      if(!manual){schedule();return;}
      // A crowded phone gets a dedicated preview space instead of covered controls.
      home.hidden=false;home.append(stage);stage.classList.add('is-home');
    }
    stage.hidden=false;stage.classList.add('is-playing');stage.dataset.phase='enter';
    phaseTimer=setTimeout(()=>{stage.dataset.phase='visible';},2200);
    const appearance=art.animate([
      {opacity:0,transform:'translateY(20px) scale(.3) rotate(-12deg)',filter:'blur(6px)',offset:0},
      {opacity:1,transform:'translateY(-3px) scale(1.05) rotate(3deg)',filter:'blur(0)',offset:.1},
      {opacity:1,transform:'translateY(0) scale(1) rotate(0)',offset:.15},
      {opacity:1,transform:'translateY(-5px) scale(1) rotate(0)',offset:.7},
      {opacity:1,transform:'translateY(0) scale(1) rotate(0)',offset:.82},
      {opacity:0,transform:'translateY(-28px) scale(.2) rotate(18deg)',filter:'blur(5px)',offset:1},
    ],{duration:7600,easing:'ease-in-out'});
    animations=[appearance,santa.animate([
      {transform:'perspective(450px) rotateY(0deg) translateY(0)'},
      {transform:'perspective(450px) rotateY(180deg) translateY(-8px)',offset:.5},
      {transform:'perspective(450px) rotateY(360deg) translateY(0)'},
    ],{delay:1700,duration:1500,easing:'ease-in-out'}),stage.querySelector('.cm-reindeer-figure')!.animate([{transform:'translateY(0)'},{transform:'translateY(-8px)'},{transform:'translateY(0)'}],{delay:2800,duration:650,iterations:2,easing:'ease-in-out'})];
    endTimer=setTimeout(()=>{stop();schedule();},7600);
  }
  function schedule(initial=false,quiet=false) {
    if (dismissed || reduced.matches || !animationAllowed) return;
    clearTimeout(timer);timer=setTimeout(()=>play(),initial?1600+Math.random()*1800:quiet?6000+Math.random()*3000:phone.matches?45000+Math.random()*30000:25000+Math.random()*20000);
  }
  function paintPreference() {
    stop();
    closeButton.hidden = dismissed || reduced.matches || !animationAllowed;
    setCopy(playButton, reduced.matches || !animationAllowed ? 'A little Christmas magic' : dismissed ? 'Show Santa & reindeer' : 'Santa & his little helper');
    playButton.disabled = reduced.matches || !animationAllowed;
    playButton.setAttribute('aria-pressed',String(!dismissed && !reduced.matches && animationAllowed));
    if (!dismissed && !reduced.matches && animationAllowed) schedule(true);
  }
  playButton.addEventListener('click', () => { dismissed=false;try{sessionStorage.removeItem(dismissalKey);}catch{/* Optional. */}paintPreference();play(true); }, {signal});
  closeButton.addEventListener('click', () => { dismissed=true;try{sessionStorage.setItem(dismissalKey,'hidden');}catch{/* Optional. */}paintPreference();playButton.focus({preventScroll:true}); }, {signal});
  stage.querySelector('.cm-float-dismiss')!.addEventListener('click',()=>closeButton.click(),{signal});
  reduced.addEventListener('change', paintPreference, {signal});
  document.addEventListener('visibilitychange', () => { stop(); if(!document.hidden) schedule(false,true); }, {signal});
  document.addEventListener('focusin', () => { if(blocked()) stop(); }, {signal});
  document.addEventListener('focusout',()=>{if(stage.hidden)schedule(false,true);},{signal});
  window.addEventListener('hashchange', () => { stop();schedule(false,true); }, {signal});
  window.addEventListener('scroll',()=>{stop();schedule(false,true);},{signal,passive:true});
  window.addEventListener('resize',()=>{stop();schedule(false,true);},{signal,passive:true});
  const observer = new MutationObserver(() => { if(blocked())stop();else if(stage.hidden&&timer===undefined)schedule(false,true); });
  const modal = document.querySelector('#modal'); if(modal) observer.observe(modal,{attributes:true,attributeFilter:['open']});
  observer.observe(document.body,{attributes:true,attributeFilter:['class']});
  signal.addEventListener('abort', () => { stop();observer.disconnect();stage.remove(); }, {once:true});
  paintPreference();
}

