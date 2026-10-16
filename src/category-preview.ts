import { h, setCopy } from './customer-i18n.js';

let expanded = false;

/** Keep eight shortcuts readable, with an honest, non-interactive blurred peek. */
export function mountCategoryPreview(root: HTMLElement, signal: AbortSignal) {
  const grid=root.querySelector<HTMLElement>('.mp-category-grid');
  if(!grid)return;
  const links=[...grid.querySelectorAll<HTMLAnchorElement>('.mp-category')];
  if(links.length<=8)return;
  const preview=document.createElement('div');preview.className='category-preview';
  grid.before(preview);preview.append(grid);
  grid.id='marketplace-category-options';
  const veil=document.createElement('div');veil.className='category-preview-veil';veil.setAttribute('aria-hidden','true');preview.append(veil);
  const button=document.createElement('button');button.type='button';button.className='category-preview-toggle';
  button.setAttribute('aria-controls',grid.id);preview.after(button);
  function paint() {
    if(!grid!.getClientRects().length)return;
    const top=grid!.getBoundingClientRect().top;
    const next=links[8].getBoundingClientRect();
    const start=next.top-top;
    preview.classList.toggle('is-collapsed',!expanded);
    preview.style.setProperty('--preview-height',`${start+next.height/2}px`);
    preview.style.setProperty('--preview-veil-top',`${start}px`);
    for(const link of links.slice(8)) {
      link.inert=!expanded;
      if(expanded)link.removeAttribute('aria-hidden');else link.setAttribute('aria-hidden','true');
    }
    button.setAttribute('aria-expanded',String(expanded));
    button.innerHTML=h(expanded?'See less':'See more')+'<span aria-hidden="true">'+(expanded?'⌃':'⌄')+'</span>';
    button.setAttribute('aria-label',button.textContent!.replace(/[⌃⌄]/g,'').trim());
  }
  button.addEventListener('click',()=>{expanded=!expanded;paint();},{signal});
  document.addEventListener('customerlanguagechange',paint,{signal});
  window.addEventListener('hashchange',()=>requestAnimationFrame(paint),{signal});
  const observer=new ResizeObserver(paint);observer.observe(grid);
  signal.addEventListener('abort',()=>observer.disconnect(),{once:true});
  // A translated label remains available even if this section starts hidden.
  setCopy(button,expanded?'See less':'See more');
  paint();
}
