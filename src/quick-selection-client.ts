import {customerLanguage} from './customer-i18n.js';
import {planQuickSelection,quickSelectionMatches,type QuickChoice} from './quick-selection.js';

export type QuickSelectionOptions={items:()=>QuickChoice[];selected:()=>string[];apply:(keys:string[])=>boolean};
const words={
  en:{search:'Search',quick:'Quick selection',tabs:'Search mode',hint:'Tick your favourites. Add them together.',placeholder:'Search acts and services…',existing:'Already in your event',selected:'selected',selectedOne:'selected',new:'new',newOne:'new',add:'Add {count} services to my event',addOne:'Add 1 service to my event',choose:'Choose services to add',note:'Availability and prices confirmed separately.',empty:'No matching services. Try another name or a shorter spelling.',unavailable:'A service changed. Close search and refresh before adding it.',overlap:'Choose either the bundle or its included show; keep each show only once.',limit:'Keep up to 12 shows or bundles and 30 other services in one request.'},
  fr:{search:'Recherche',quick:'Sélection rapide',tabs:'Mode de recherche',hint:'Cochez vos favoris. Ajoutez-les ensemble.',placeholder:'Rechercher des spectacles et services…',existing:'Déjà dans votre événement',selected:'sélectionnés',selectedOne:'sélectionné',new:'nouveaux',newOne:'nouveau',add:'Ajouter {count} services à mon événement',addOne:'Ajouter 1 service à mon événement',choose:'Choisissez les services à ajouter',note:'Disponibilités et tarifs confirmés séparément.',empty:'Aucun service trouvé. Essayez un autre nom ou une recherche plus courte.',unavailable:'Un service a changé. Fermez la recherche et actualisez la page.',overlap:'Choisissez la formule ou le spectacle inclus, sans sélectionner deux fois le même spectacle.',limit:'Limitez la demande à 12 spectacles ou formules et 30 autres services.'},
  ar:{search:'بحث',quick:'اختيار سريع',tabs:'طريقة البحث',hint:'علّم على الخدمات اللي بتحبّها وضيفها سوا.',placeholder:'ابحث عن العروض والخدمات…',existing:'موجودة ضمن اختياراتك',selected:'مختارة',selectedOne:'مختارة',new:'جديدة',newOne:'جديدة',add:'أضف {count} خدمات إلى مناسبتي',addOne:'أضف خدمة واحدة إلى مناسبتي',choose:'اختار الخدمات اللي بدك تضيفها',note:'منأكد التوفّر والأسعار بشكل منفصل.',empty:'ما لقينا خدمات مطابقة. جرّب اسم تاني أو كلمة أقصر.',unavailable:'في خدمة تغيّرت. سكّر البحث وحدّث الصفحة قبل الإضافة.',overlap:'اختار الباقة أو العرض الموجود فيها، من دون تكرار نفس العرض.',limit:'الطلب الواحد بيقبل لحد ١٢ عرض أو باقة و٣٠ خدمة تانية.'},
} as const;
const q=(key:keyof typeof words.en)=>String(words[customerLanguage()][key]);
const e=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));

/** Lives only inside the existing magnifier panel; no extra homepage row. */
export function mountQuickSelection(panel:HTMLElement,options:QuickSelectionOptions,signal:AbortSignal){
  const tabs=document.createElement('div');tabs.className='quick-selection-tabs';tabs.setAttribute('role','tablist');
  tabs.innerHTML='<button type="button" id="quick-search-tab" role="tab" aria-selected="true" aria-controls="quick-normal-results"></button><button type="button" id="quick-select-tab" role="tab" aria-selected="false" aria-controls="quick-select-panel" tabindex="-1"></button>';
  const searchTab=tabs.children[0] as HTMLButtonElement,quickTab=tabs.children[1] as HTMLButtonElement;
  const pane=document.createElement('div');pane.className='quick-select-panel';pane.id='quick-select-panel';pane.hidden=true;pane.setAttribute('role','tabpanel');pane.setAttribute('aria-labelledby',quickTab.id);
  pane.innerHTML='<p class="quick-selection-hint"></p><label class="quick-selection-query"><span class="sr-only"></span><input type="search" maxlength="100" autocomplete="off" enterkeyhint="search"></label><div class="quick-selection-list"></div><div class="quick-selection-footer"><p class="quick-selection-count" role="status" aria-live="polite"></p><p class="quick-selection-error" role="alert" hidden></p><button type="button" class="quick-selection-add"></button><small></small></div>';
  const normal=document.createElement('div');normal.id='quick-normal-results';normal.setAttribute('role','tabpanel');normal.setAttribute('aria-labelledby',searchTab.id);
  for(const child of [...panel.children])if(child.matches('form,.discovery-results'))normal.append(child);
  panel.querySelector('.discovery-intro')?.after(tabs);panel.append(normal,pane);
  const input=pane.querySelector<HTMLInputElement>('input')!,list=pane.querySelector<HTMLElement>('.quick-selection-list')!,footer=pane.querySelector<HTMLElement>('.quick-selection-footer')!,add=pane.querySelector<HTMLButtonElement>('.quick-selection-add')!,error=pane.querySelector<HTMLElement>('.quick-selection-error')!;
  const draft=new Set<string>(),openGroups=new Map<string,boolean>();let query='',active=false;
  function paintFooter(){
    const current=options.selected(),plan=planQuickSelection(options.items(),current,[...draft]);
    const count=plan.added?.length??draft.size;
    const total=new Set([...current,...draft]).size;
    footer.querySelector('.quick-selection-count')!.textContent=total+' '+q(total===1?'selectedOne':'selected')+' · '+draft.size+' '+q(draft.size===1?'newOne':'new');
    error.hidden=!plan.error;error.textContent=plan.error?q(plan.error):'';
    add.disabled=!count||!!plan.error;add.textContent=!count?q('choose'):count===1?q('addOne'):q('add').replace('{count}',String(count));
    footer.querySelector('small')!.textContent=q('note');
  }
  function paintList(){
    const existing=new Set(options.selected()),groups=new Map<string,QuickChoice[]>();
    for(const item of quickSelectionMatches(options.items(),query))groups.set(item.group,[...(groups.get(item.group)??[]),item]);
    list.innerHTML=[...groups.entries()].map(([group,items])=>'<details class="quick-selection-group" data-group="'+e(group)+'" '+((query||(openGroups.get(group)??items.length<=18))?'open':'')+'><summary>'+e(group)+' <small>'+items.length+'</small></summary><div>'+items.map(item=>'<label class="quick-selection-row"><input type="checkbox" data-quick-key="'+e(item.key)+'" '+(existing.has(item.key)||draft.has(item.key)?'checked ':'')+(existing.has(item.key)?'disabled ':'')+'><span>'+e(item.title)+(existing.has(item.key)?'<small>'+e(q('existing'))+'</small>':'')+'</span></label>').join('')+'</div></details>').join('')||'<p class="quick-selection-empty">'+e(q('empty'))+'</p>';
    paintFooter();
  }
  function paintCopy(){
    tabs.setAttribute('aria-label',q('tabs'));searchTab.textContent=q('search');quickTab.textContent='☑ '+q('quick');
    pane.querySelector('.quick-selection-hint')!.textContent=q('hint');input.placeholder=q('placeholder');input.setAttribute('aria-label',q('placeholder'));pane.querySelector('.quick-selection-query span')!.textContent=q('placeholder');paintList();
  }
  function mode(quick:boolean,focus=true){
    active=quick;panel.classList.toggle('is-quick-selection',quick);pane.hidden=!quick;normal.hidden=quick;
    searchTab.setAttribute('aria-selected',String(!quick));quickTab.setAttribute('aria-selected',String(quick));searchTab.tabIndex=quick?-1:0;quickTab.tabIndex=quick?0:-1;
    if(quick){paintCopy();if(focus)input.focus({preventScroll:true});}
    else if(focus)normal.querySelector<HTMLInputElement>('input')?.focus({preventScroll:true});
  }
  searchTab.addEventListener('click',()=>mode(false),{signal});quickTab.addEventListener('click',()=>mode(true),{signal});
  tabs.addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();const next=event.key==='Home'?false:event.key==='End'?true:!active;mode(next,false);(next?quickTab:searchTab).focus();}},{signal});
  input.addEventListener('input',()=>{query=input.value;paintList();},{signal});
  input.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();input.blur();}},{signal});
  list.addEventListener('change',event=>{const checkbox=(event.target as HTMLElement).closest<HTMLInputElement>('[data-quick-key]');if(!checkbox||checkbox.disabled)return;const key=checkbox.dataset.quickKey!;if(checkbox.checked)draft.add(key);else draft.delete(key);paintFooter();},{signal});
  list.addEventListener('toggle',event=>{const details=event.target as HTMLDetailsElement;if(details.matches('.quick-selection-group')&&!query)openGroups.set(details.dataset.group!,details.open);},{signal,capture:true});
  add.addEventListener('click',()=>{const plan=planQuickSelection(options.items(),options.selected(),[...draft]);if(plan.error){paintFooter();return;}if(plan.added.length)options.apply(plan.added);},{signal});
  document.addEventListener('customerlanguagechange',paintCopy,{signal});
  paintCopy();
  return{reset(){draft.clear();query='';input.value='';mode(false,false);paintFooter();}};
}
