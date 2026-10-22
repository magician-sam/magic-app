import {h, setCopy} from './customer-i18n.js';
import {defaultSeasonalTheme,effectiveTheme,isThemeKey,themePresets,type SeasonalTheme} from './seasonal-themes.js';
import {christmasCompanions} from './christmas-companions.js';
import {festivePosition} from './festive-position.js';
import {santaPoses,santaSheetOffset,type SantaGesture} from './santa-animation.js';

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
  controls.innerHTML = h('<button type="button" class="cm-play">Meet Santa <span aria-hidden="true">✦</span></button><button type="button" class="cm-dismiss" aria-label="Hide Santa">×</button>');
  const home = document.createElement('div');home.className='cm-character-home';home.hidden=true;
  const stage=document.createElement('div');stage.className='cm-floating-companions cm-solo-santa';stage.hidden=true;
  const stars='<div class="cm-star-burst" aria-hidden="true">'+Array.from({length:12},()=>'<i></i>').join('')+'</div>';
  stage.innerHTML='<div class="cm-magic-aura" aria-hidden="true"></div><div class="cm-flight-art">'+christmasCompanions+'</div>'+stars+h('<button type="button" class="cm-santa-greet" aria-label="Say hello to Santa"></button><button type="button" class="cm-float-dismiss" aria-label="Hide Santa">×</button>');
  hero.append(controls,home);document.body.append(stage);
  const playButton = controls.querySelector<HTMLButtonElement>('.cm-play')!;
  const closeButton = controls.querySelector<HTMLButtonElement>('.cm-dismiss')!;
  const greet=stage.querySelector<HTMLButtonElement>('.cm-santa-greet')!;
  const art=stage.querySelector<HTMLElement>('.cm-flight-art')!,portrait=stage.querySelector<HTMLImageElement>('.cm-santa-sheet')!;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const phone = matchMedia('(max-width: 600px)');
  const animationAllowed=(isThemeKey(preview)?params.get('theme-motion')!=='false':settings.animations)&&typeof art.animate==='function';
  let dismissed=false,timer:ReturnType<typeof setTimeout>|undefined,poseTimer:ReturnType<typeof setInterval>|undefined;
  let animations:Animation[]=[],previous:{x:number;y:number}|undefined,departing=false,visit=0;
  const pending=new Set<ReturnType<typeof setTimeout>>();
  const later=(fn:()=>void,delay:number)=>{const id=setTimeout(()=>{pending.delete(id);fn();},delay);pending.add(id);};
  try { dismissed = sessionStorage.getItem(dismissalKey) === 'hidden'; } catch { /* Optional device preference. */ }
  function pose(frame:number){const {x,y}=santaSheetOffset(frame);portrait.style.transform='translate('+x+'%,'+y+'%)';stage.dataset.pose=String(frame);}
  function gesture(kind:SantaGesture){
    if(departing&&kind!=='jump')return;
    clearInterval(poseTimer);const sequence=santaPoses[kind];let index=0;pose(sequence[0]);stage.dataset.gesture=kind;
    poseTimer=setInterval(()=>{index++;if(index>=sequence.length){clearInterval(poseTimer);poseTimer=undefined;stage.dataset.gesture='idle';return;}pose(sequence[index]);},kind==='turn'?135:kind==='jump'?110:145);
  }
  const clearMotion=()=>{for(const id of pending)clearTimeout(id);pending.clear();clearInterval(poseTimer);poseTimer=undefined;for(const animation of animations){animation.onfinish=null;animation.cancel();}animations=[];};
  const stop=()=>{clearTimeout(timer);timer=undefined;clearMotion();departing=false;stage.hidden=true;stage.dataset.phase='hidden';stage.classList.remove('is-playing','is-home');home.hidden=true;if(stage.parentElement!==document.body)document.body.append(stage);};
  const blocked=()=>document.hidden||!root.isConnected||!!document.querySelector('dialog[open]')||document.body.classList.contains('site-menu-open')||!!document.activeElement?.matches('input,select,textarea,[contenteditable="true"]');
  function position(){
    const width=document.documentElement.clientWidth,height=window.innerHeight,size=phone.matches?{width:100,height:140}:{width:144,height:192};
    const visible=(n:HTMLElement)=>!stage.contains(n)&&!!n.getClientRects().length;
    const inView=(r:DOMRect)=>r.width>0&&r.height>0&&r.bottom>0&&r.top<height&&r.right>0&&r.left<width;
    const protectedAreas=[...document.querySelectorAll<HTMLElement>('.site-header,.marketplace-phone-nav,.customer-phone-nav,.floating-whatsapp,.phone-event-bar,.event-selection-tray,#notice,label,input,select,textarea,button,a:not(.mp-category)')].filter(visible).filter(n=>!n.matches('button,a')||!n.querySelector('img')).map(n=>n.getBoundingClientRect()).filter(inView);
    const readingAreas=[...document.querySelectorAll<HTMLElement>('h1,h2,h3,p,.mp-category strong,.mp-category-icon,.mp-category-arrow')].filter(visible).map(n=>{const r=n.getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height,weight:n.matches('.mp-category-icon,.mp-category-arrow')?1:10};}).filter(r=>r.width&&r.height&&r.bottom>0&&r.top<height);
    const result=festivePosition(width,height,size.width,size.height,protectedAreas,previous,Math.random,readingAreas);
    if(result){stage.style.setProperty('--cm-x',result.x+'px');stage.style.setProperty('--cm-y',result.y+'px');previous=result;}
    return result;
  }
  function starBurst(arriving=false){
    stage.querySelectorAll<HTMLElement>('.cm-star-burst i').forEach((star,i)=>{
      const angle=i*Math.PI*2/12,radius=phone.matches?22+(i%3)*8:30+(i%3)*12;
      const point='translate('+Math.cos(angle)*radius+'px,'+Math.sin(angle)*radius+'px) rotate('+(i*53)+'deg)';
      const frames=[{opacity:0,transform:'translate(0,0) scale(.15)'},{opacity:1,transform:point+' scale(1)',offset:.35},{opacity:0,transform:point+' scale(.1)'}];
      animations.push(star.animate(arriving?frames.toReversed():frames,{duration:720,delay:i%3*35,easing:'ease-out',fill:'both'}));
    });
  }
  function depart(){
    if(departing||stage.hidden)return;
    clearMotion();departing=true;stage.dataset.phase='jump';gesture('jump');
    animations.push(art.animate([{opacity:1,transform:'translateY(0) scale(1)'},{opacity:1,transform:'translateY(-14px) scale(1.02)',offset:.38},{opacity:0,transform:'translateY(-24px) scale(.12)',offset:.8},{opacity:0,transform:'translateY(-24px) scale(.12)'}],{duration:800,easing:'ease-in',fill:'forwards'}));
    later(()=>{stage.dataset.phase='stars';starBurst();},480);
    later(()=>{const next=visit+1;stop();if(next<3&&!blocked())showVisit(false,next);else schedule();},1320);
  }
  function showVisit(manual:boolean,index:number){
    if(dismissed||reduced.matches||!animationAllowed||blocked()){schedule();return;}
    if(!portrait.complete||portrait.naturalWidth===0){schedule(false,true);return;}
    visit=index;departing=false;
    if(!position()){
      if(!manual){schedule();return;}
      // A crowded phone gets a temporary, dedicated stage instead of covered controls.
      home.hidden=false;home.append(stage);stage.classList.add('is-home');
    }
    stage.hidden=false;stage.classList.add('is-playing');stage.dataset.phase='enter';pose(4);starBurst(true);
    animations.push(art.animate([{opacity:0,transform:'translateY(14px) scale(.2)'},{opacity:1,transform:'translateY(-3px) scale(1.04)',offset:.7},{opacity:1,transform:'translateY(0) scale(1)'}],{duration:550,easing:'ease-out'}));
    later(()=>{stage.dataset.phase='visible';gesture('wave');},600);
    later(()=>gesture('turn'),2200);
    later(depart,3500);
  }
  function play(manual=false){stop();showVisit(manual,0);}
  function schedule(initial=false,quiet=false){
    if(dismissed||reduced.matches||!animationAllowed)return;
    clearTimeout(timer);timer=setTimeout(()=>{timer=undefined;play();},initial?1800+Math.random()*1200:quiet?6000+Math.random()*3000:phone.matches?50000+Math.random()*30000:35000+Math.random()*20000);
  }
  function paintPreference(){
    stop();closeButton.hidden=dismissed||reduced.matches||!animationAllowed;
    setCopy(playButton,reduced.matches||!animationAllowed?'A little Christmas magic':dismissed?'Show Santa':'Meet Santa');
    playButton.disabled=reduced.matches||!animationAllowed;playButton.setAttribute('aria-pressed',String(!dismissed&&!reduced.matches&&animationAllowed));
    if(!dismissed&&!reduced.matches&&animationAllowed)schedule(true);
  }
  playButton.addEventListener('click',()=>{dismissed=false;try{sessionStorage.removeItem(dismissalKey);}catch{/* Optional. */}paintPreference();play(true);},{signal});
  closeButton.addEventListener('click',()=>{dismissed=true;try{sessionStorage.setItem(dismissalKey,'hidden');}catch{/* Optional. */}paintPreference();playButton.focus({preventScroll:true});},{signal});
  stage.querySelector('.cm-float-dismiss')!.addEventListener('click',()=>closeButton.click(),{signal});
  greet.addEventListener('pointerenter',event=>{if(event.pointerType==='mouse'&&!departing){stage.dataset.phase='greeting';gesture('wave');}},{signal});
  greet.addEventListener('focus',()=>{if(!departing)gesture('wave');},{signal});
  greet.addEventListener('click',()=>{if(departing)return;clearMotion();stage.dataset.phase='greeting';gesture('wave');later(depart,1450);},{signal});
  reduced.addEventListener('change',paintPreference,{signal});
  document.addEventListener('visibilitychange',()=>{stop();if(!document.hidden)schedule(false,true);},{signal});
  document.addEventListener('focusin',()=>{if(blocked())stop();},{signal});
  document.addEventListener('focusout',()=>{if(stage.hidden)schedule(false,true);},{signal});
  window.addEventListener('hashchange',()=>{stop();schedule(false,true);},{signal});
  window.addEventListener('scroll',()=>{stop();schedule(false,true);},{signal,passive:true});
  window.addEventListener('resize',()=>{stop();schedule(false,true);},{signal,passive:true});
  const observer=new MutationObserver(()=>{if(blocked())stop();else if(stage.hidden&&timer===undefined)schedule(false,true);});
  const modal=document.querySelector('#modal');if(modal)observer.observe(modal,{attributes:true,attributeFilter:['open']});
  observer.observe(document.body,{attributes:true,attributeFilter:['class']});
  signal.addEventListener('abort',()=>{stop();observer.disconnect();stage.remove();},{once:true});
  portrait.addEventListener('error',()=>{stop();controls.hidden=true;},{signal});
  paintPreference();
}
