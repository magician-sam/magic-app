const groups: [string,string[]][] = [
  ['Work',['today','notices','bookings','enquiries','calendar','reminders']],
  ['People',['customers','whatsapp','performers']],
  ['Marketplace',['supplier-desks','supplier-applications','packages','guest-shows','guest-photos','offers']],
  ['Marketing',['occasions','messaging','reviews']],
  ['Finance',['money']],['Administration',['themes','registration-agreements','settings']],
];
let lifecycle = new AbortController();
export function mountBackstageWorkspace(root: HTMLElement, view: string) {
  lifecycle.abort(); lifecycle = new AbortController();
  const {signal} = lifecycle;
  const dashboard = root.querySelector<HTMLElement>('.dashboard');
  if (!dashboard) return;
  dashboard.classList.add('studio');
  const nav = dashboard.querySelector<HTMLElement>('.sidebar nav')!;
  const buttons = [...nav.querySelectorAll<HTMLButtonElement>('[data-nav]')];
  for (const [title,keys] of groups) {
    const items = keys.flatMap(key=>buttons.filter(button=>button.dataset.nav===key));
    if (!items.length) continue;
    const section = document.createElement('div'); section.className='studio-nav-group';
    const label = document.createElement('h2'); label.textContent=title; section.append(label,...items); nav.append(section);
  }
  const header=dashboard.querySelector('.dash-top')!;
  const more=document.createElement('button'); more.type='button';more.className='studio-menu outline small';more.textContent='☰ Menu';more.setAttribute('aria-expanded','false');more.setAttribute('aria-controls','studio-sidebar');
  dashboard.querySelector('.sidebar')!.id='studio-sidebar'; header.prepend(more);
  const close=()=>{dashboard.classList.remove('studio-menu-open');more.setAttribute('aria-expanded','false');};
  more.addEventListener('click',()=>{const open=dashboard.classList.toggle('studio-menu-open');more.setAttribute('aria-expanded',String(open));},{signal});
  const quick=document.createElement('nav');quick.className='studio-phone-nav';quick.setAttribute('aria-label','Backstage shortcuts');
  for(const [key,label] of [['today','Today'],['bookings','Events'],['calendar','Calendar']]) {
    const original=buttons.find(button=>button.dataset.nav===key);if(!original)continue;
    const button=document.createElement('button');button.type='button';button.textContent=label;button.classList.toggle('active',view===key);button.addEventListener('click',()=>original.click(),{signal});quick.append(button);
  }
  const morePhone=document.createElement('button');morePhone.type='button';morePhone.textContent='More';morePhone.addEventListener('click',()=>{more.click();more.focus();},{signal});quick.append(morePhone);dashboard.append(quick);
  dashboard.addEventListener('keydown',event=>{if(event.key==='Escape'){close();more.focus();}},{signal});
  nav.addEventListener('click',close,{signal});
  if(view==='today') {
    const welcome=dashboard.querySelector('.welcome');welcome?.remove();
    const stats=dashboard.querySelector('.stats');if(stats){stats.firstElementChild?.remove();dashboard.querySelector('#dash-content')!.append(stats);}
  }
  if(view==='guest-photos') {
    const content=dashboard.querySelector('#dash-content')!;
    const label=document.createElement('label');label.className='studio-library-search';label.textContent='Find photos or a service';
    const input=document.createElement('input');input.type='search';input.placeholder='Search magic, homepage, characters…';label.append(input);content.prepend(label);
    input.addEventListener('input',()=>{const query=input.value.trim().toLocaleLowerCase();content.querySelectorAll<HTMLElement>('.profile-grid > article').forEach(card=>{card.hidden=!!query&&!card.textContent?.toLocaleLowerCase().includes(query);});},{signal});
  }
}
