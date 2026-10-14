import { parsePhotoTags } from './photo-tag-parser.js';
type TaggedPhoto = {url:string; caption:string; tags:string[]};
const e=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function mountPhotoTagEditor(root: Element, photos: TaggedPhoto[], saved: Record<string,string[]>, save: (url:string,tags:string[])=>Promise<void>) {
  const unique=new Map<string,TaggedPhoto>();
  for(const photo of photos) {
    const old=unique.get(photo.url);
    unique.set(photo.url,old?{...old,tags:[...new Set([...old.tags,...photo.tags])]}:photo);
  }
  const items=[...unique.values()];
  const section=document.createElement('details');section.className='photo-tags-panel';
  section.innerHTML=`<summary>Photo search tags · ${items.length} pictures</summary><p>Add several tags to the same picture. Separate them with commas or #, for example: #juggler #clown #magician. English, French and Arabic work. Tags help customers find the show containing that picture.</p><label for="photo-tag-filter">Find a picture<input id="photo-tag-filter" type="search" placeholder="Show name or caption…"></label><div class="photo-tags-grid">${items.map((photo,index)=>`<form data-tag-photo="${index}"><img src="${e(photo.url)}" alt="${e(photo.caption)}" loading="lazy"><p>${e(photo.caption)}</p><label for="photo-tags-${index}">Search tags</label><textarea id="photo-tags-${index}" rows="3" maxlength="1200">${e((saved[photo.url]??photo.tags).join(', '))}</textarea><small>Up to 16 tags, 60 characters each.</small><button type="submit" class="small outline">Save tags</button><p class="photo-tag-status" role="status"></p></form>`).join('')}</div>`;
  root.querySelector('.panel')?.after(section);
  section.querySelector<HTMLInputElement>('#photo-tag-filter')!.addEventListener('input',event=>{
    const query=(event.currentTarget as HTMLInputElement).value.toLocaleLowerCase();
    section.querySelectorAll<HTMLFormElement>('form').forEach(form=>{const photo=items[Number(form.dataset.tagPhoto)];form.hidden=!`${photo.caption} ${photo.tags.join(' ')} ${form.querySelector('textarea')!.value}`.toLocaleLowerCase().includes(query);});
  });
  section.querySelectorAll<HTMLFormElement>('form').forEach(form=>form.addEventListener('submit',event=>{
    event.preventDefault(); const button=form.querySelector('button')!,status=form.querySelector('.photo-tag-status')!;
    const tags=parsePhotoTags(form.querySelector('textarea')!.value);
    if(tags.length>16||tags.some(tag=>tag.length>60||/[<>]/.test(tag))){status.textContent='Use up to 16 plain tags, 60 characters each.';return;}
    button.disabled=true;status.textContent='Saving tags…';
    void save(items[Number(form.dataset.tagPhoto)].url,tags).then(()=>{form.querySelector('textarea')!.value=tags.join(', ');status.textContent='Saved. These tags are now used in customer search.';}).catch(error=>{status.textContent=error instanceof Error?error.message:'Unable to save tags.';}).finally(()=>{button.disabled=false;});
  }));
}
