type Api=(path:string,method?:string,body?:unknown)=>Promise<unknown>;
type History={enquiryDate:string;eventDateCandidates:string[];eventDateTextCandidates?:string[];timeCandidates?:string[];venueCandidates?:string[];childNameCandidates?:string[];outcomeClues?:string[];services:string[]};
type PastDate={date:string;mention:string;yearInferred:boolean;dayMonthAmbiguous:boolean;cancelMentioned:boolean;verifiedDate?:string};
type Candidate={id:string;name:string;phone:string;nameNeedsReview:boolean;customerId?:string;qualification:string;phonebookLabel?:string;historicalDates?:PastDate[];history:History[]};
const escape=(v:unknown)=>String(v??"").replace(/[&<>"']/g,x=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[x]!);
async function download(root:Element,blob:Blob,name:string){
  root.querySelector("#wc-backup-copy")?.remove();
  const previous=root.querySelector<HTMLAnchorElement>("#wc-backup-ready");if(previous){URL.revokeObjectURL(previous.href);previous.remove();}
  const compressed=await new Response(blob.stream().pipeThrough(new CompressionStream("gzip"))).blob();
  const a=document.createElement("a");a.href=URL.createObjectURL(compressed);a.download=name+".gz";a.id="wc-backup-ready";a.className="button outline small";a.textContent="Save prepared recovery backup to PC";root.querySelector("#wc-backup-progress")!.after(a);
  const bytes=new Uint8Array(await compressed.arrayBuffer());let binary="";for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
  const fallback=document.createElement("details");fallback.id="wc-backup-copy";fallback.innerHTML='<summary>If saving is unavailable: copy recovery data</summary><label>Compressed recovery data (gzip base64)<textarea id="wc-backup-data" readonly rows="4"></textarea></label><p>This is the complete compressed backup. Keep it private and verify it before removing chat text.</p>';
  fallback.querySelector<HTMLTextAreaElement>("textarea")!.value=btoa(binary);a.after(fallback);
}
export async function renderWhatsAppCustomers(root:Element,api:Api,changed:()=>Promise<void>){
  root.innerHTML=`<section class="panel"><span class="eyebrow">Useful details. Private history.</span><h2>Your WhatsApp customers</h2><p>Customer numbers and concise enquiry history, with adult names kept separate from children's names. Unknown names stay unknown. Chat text belongs in your local backup.</p><div id="wc-stats" aria-live="polite"></div><p class="hint">An enquiry date records when someone asked. Possible event dates need checking; no booking, payment or completed event is inferred. Marketing permission stays off unless the customer explicitly agrees.</p></section><section class="panel"><form id="wc-search-form" class="toolbar"><label>Find a contact<input id="wc-search" placeholder="Name or number"></label><label><input id="wc-dates-only" type="checkbox">Only contacts with past dates</label><button class="small">Search</button></form><div id="wc-list"></div></section><section class="panel"><details><summary>Local backup & customer import tools</summary><p>Download and verify the full recovery backup on your PC before removing online chat text. The backup includes account data: keep it private.</p><button id="wc-backup" class="outline small">Download full database in safe-sized pages</button><p id="wc-backup-progress" role="status"></p><label>Prepared past event dates<input id="wc-dates-file" type="file" accept=".json"></label><button id="wc-dates-import" class="small">Save past dates & review reminders</button><p id="wc-dates-progress" role="status"></p><label>Prepared phone-book matches<input id="wc-phonebook-file" type="file" accept=".json"></label><button id="wc-phonebook-import" class="small">Match saved contact names</button><p id="wc-phonebook-progress" role="status"></p><p class="hint">Only existing enquiry contacts are matched. Saved phone-book labels are not verified adult identities; existing names and marketing permissions are preserved.</p><label>Prepared customer details file<input id="wc-file" type="file" accept=".json"></label><button id="wc-import" class="small">Import customer details</button><p id="wc-import-progress" role="status"></p><label>Verified local backup SHA-256<input id="wc-backup-hash" minlength="64" maxlength="64"></label><label><input id="wc-verified" type="checkbox">The recovery backup has been saved and verified on this PC.</label><button id="wc-complete" class="outline small" disabled>Remove online chat text, keep customer details</button><p id="wc-cleanup-progress" role="status"></p></details></section>`;
  let offset=0,q="",datesOnly=false,migration:{sourceHash:string;expected:number}|undefined;
  const list=root.querySelector("#wc-list")!,stats=root.querySelector("#wc-stats")!;
  const fail=(el:Element,error:unknown)=>{el.textContent=error instanceof Error?error.message:"Please try again.";};
  async function refresh(){
    try{
      const data=await api(`/manage/whatsapp/customers?q=${encodeURIComponent(q)}&offset=${offset}&dates=${datesOnly?"1":"0"}`) as {total:number; supported:number;needsReview:number;chatTextRecords:number; migrations:unknown[]; candidates:Candidate[]};
      stats.innerHTML=`<div class="stats"><div class="stat"><span>Added or linked customers</span><b>${data.supported}</b></div><div class="stat"><span>Contacts needing review</span><b>${data.needsReview}</b></div><div class="stat"><span>Online chat text</span><b>${data.chatTextRecords?"Awaiting local backup":"None"}</b></div></div>`;
      list.innerHTML=`<p>${data.total} extracted contacts</p>${data.candidates.map(c=>`<details class="whatsapp-message"><summary><strong>${escape(c.phonebookLabel?c.name:c.nameNeedsReview?"Adult name unknown":c.name)}</strong> · ${escape(c.phone)} · ${c.customerId?"Customer enquiry":"Review customer identity"}${c.historicalDates?.length?` · ${c.historicalDates.length} past dates to review`:""}</summary><p>${c.phonebookLabel?`Saved phone-book label: ${escape(c.phonebookLabel)}. Verify the adult identity; this label may describe a child, family or business.`:c.nameNeedsReview?"A child or sender label has not been used as the adult's name. Edit the adult name in Customers when known.":escape(c.name)}</p>${c.history.map(h=>`<p><strong>Enquiry: ${escape(h.enquiryDate)}</strong><br>${escape(h.services.join(" · ")||"Services need review")}<br>${h.eventDateCandidates.length?`Possible event date: ${escape(h.eventDateCandidates.join(", "))} — verify`:"Event date not established"} · Completion unverified</p>${(h.eventDateTextCandidates?.length)?`<p>Date mentions to verify: ${escape(h.eventDateTextCandidates.join(", "))}</p>`:""}${h.timeCandidates?.length?`<p>Time mentions to verify: ${escape(h.timeCandidates.join(", "))}</p>`:""}${h.venueCandidates?.length?`<p>Venue mentions to verify: ${escape(h.venueCandidates.join(", "))}</p>`:""}${h.childNameCandidates?.length?`<p>Child names to verify: ${escape(h.childNameCandidates.join(", "))} (separate from the adult)</p>`:""}`).join("")}<small>${c.customerId?"Concise notes are also saved in this customer's contact history.":"This contact has not been added to Customers. Review against the local source before adding."}</small></details>`).join("")||"<p>No extracted contacts yet.</p>"}<div class="actions"><button id="wc-prev" class="outline small" ${offset===0?"disabled":""}>Previous</button><button id="wc-next" class="outline small" ${offset+25>=data.total?"disabled":""}>Next</button></div>`;
      const cards=list.querySelectorAll<HTMLDetailsElement>("details.whatsapp-message");
      data.candidates.forEach((candidate,index)=>{
        for(const past of candidate.historicalDates??[]){
          const form=document.createElement("form");form.innerHTML=`<h3>Past event date to check</h3><p>Mention: ${escape(past.mention)} · Possible date: ${escape(past.date)}${past.yearInferred?" · Year inferred from chat timing":""}${past.dayMonthAmbiguous?" · Day/month order ambiguous":""}${past.cancelMentioned?" · Cancellation mentioned nearby":""}. This is not proof the event happened or a child's actual birthday.</p>${past.verifiedDate?`<p>Confirmed past event: ${escape(past.verifiedDate)} · Anniversary follow-up planned.</p>`:""}<label>Correct past event date<input name="eventDate" type="date" value="${escape(past.verifiedDate??past.date)}" required></label><label><input name="verified" type="checkbox" required>I checked the local source and this event actually happened on this date.</label><button class="small" ${candidate.customerId?"":"disabled"}>Confirm date & plan anniversary follow-up</button>${candidate.customerId?"":"<p>Add this reviewed customer first.</p>"}<p role="status"></p>`;cards[index].append(form);
          form.addEventListener("submit",async event=>{event.preventDefault();const output=form.querySelector('[role="status"]')!,button=form.querySelector<HTMLButtonElement>("button")!;button.disabled=true;try{const values=new FormData(form);const result=await api(`/manage/whatsapp/customers/${candidate.id}/event-date`,"POST",{candidateDate:past.date,eventDate:String(values.get("eventDate")),verified:values.get("verified")==="on"}) as {date:string};output.textContent=`Anniversary follow-up planned for ${result.date}, with a reminder up to 30 days ahead. Nothing sent.`;await changed();}catch(error){fail(output,error);}finally{button.disabled=false;}});
        }
        if(candidate.customerId)return;
        const form=document.createElement("form");
        form.innerHTML=`<label>Adult contact name (keep the placeholder if unknown)<input name="name" value="${escape(candidate.name)}" required minlength="2" maxlength="200"></label><label>Source number<input value="${escape(candidate.phone)}" readonly></label><label><input name="verified" type="checkbox" required>I reviewed the local source and this is a customer or customer enquiry.</label><button class="small">Add reviewed customer</button><p role="status"></p>`;
        cards[index].append(form);
        form.addEventListener("submit",async event=>{event.preventDefault();const button=form.querySelector<HTMLButtonElement>("button")!,output=form.querySelector("p")!;button.disabled=true;try{const values=new FormData(form);await api(`/manage/whatsapp/customers/${candidate.id}/approve`,"POST",{verified:values.get("verified")==="on",customer:{name:String(values.get("name")),phone:candidate.phone,kind:"unknown",offersConsent:false}});await changed();await refresh();}catch(error){fail(output,error);button.disabled=false;}});
      });
      list.querySelector("#wc-prev")!.addEventListener("click",()=>{offset-=25;void refresh();});list.querySelector("#wc-next")!.addEventListener("click",()=>{offset+=25;void refresh();});
    }catch(error){fail(stats,error);}
  }
  root.querySelector("#wc-search-form")!.addEventListener("submit",event=>{event.preventDefault();q=root.querySelector<HTMLInputElement>("#wc-search")!.value;datesOnly=root.querySelector<HTMLInputElement>("#wc-dates-only")!.checked;offset=0;void refresh();});
  root.querySelector("#wc-backup")!.addEventListener("click",async event=>{
    const button=event.currentTarget as HTMLButtonElement,output=root.querySelector("#wc-backup-progress")!;button.disabled=true;
    try{
      const manifest=await api("/manage/database-page") as {version:number;createdAt:string;tables:{table:string;count:number;ceiling:number}[]};
      const parts:BlobPart[]=[`{"version":2,"createdAt":${JSON.stringify(manifest.createdAt)},"tables":{`];let tableIndex=0;
      for(const table of manifest.tables){
        parts.push(`${tableIndex++?",":""}${JSON.stringify(table.table)}:[`);let after=0,count=0,done=false;
        while(!done){
          const page=await api(`/manage/database-page?table=${table.table}&after=${after}&ceiling=${table.ceiling}`) as {rows:unknown[];next:number;done:boolean};
          for(const row of page.rows){parts.push(`${count++?",":""}${JSON.stringify(row)}`);}
          requireProgress(page.next,after,page.done);after=page.next;done=page.done;output.textContent=`Backing up ${table.table}: ${count.toLocaleString()} of ${table.count.toLocaleString()} records…`;
        }
        if(count!==table.count)throw new Error("Database changed during backup. Download again before removing any chat text.");parts.push("]");
      }
      parts.push("}}");output.textContent="Compressing the recovery backup…";await download(root,new Blob(parts,{type:"application/json"}),"magic-before-customer-cleanup.json");output.textContent="Recovery backup prepared. Save the prepared recovery backup, then verify the saved file on your PC before removing online chat text.";
    }catch(error){fail(output,error);}finally{button.disabled=false;}
  });
  root.querySelector("#wc-import")!.addEventListener("click",async event=>{
    const button=event.currentTarget as HTMLButtonElement,output=root.querySelector("#wc-import-progress")!,file=root.querySelector<HTMLInputElement>("#wc-file")!.files?.[0];if(!file)return;button.disabled=true;
    try{
      const data=JSON.parse(await file.text()) as {sourceHash:string;candidates:Candidate[]};
      if(!Array.isArray(data.candidates)||!data.candidates.length)throw new Error("Choose the prepared customer details JSON file.");
      for(let i=0;i<data.candidates.length;i+=15){await api("/manage/whatsapp/customers/import","POST",{sourceHash:data.sourceHash,candidates:data.candidates.slice(i,i+15)});output.textContent=`Saved ${Math.min(i+15,data.candidates.length)} of ${data.candidates.length} customer details. Retrying this file is safe.`;}
      migration={sourceHash:data.sourceHash,expected:data.candidates.length};output.textContent="Customer details saved. Full conversations have not been removed yet.";await changed();await refresh();
    }catch(error){fail(output,error);}finally{button.disabled=false;}
  });
  root.querySelector("#wc-phonebook-import")!.addEventListener("click",async event=>{
    const button=event.currentTarget as HTMLButtonElement,output=root.querySelector("#wc-phonebook-progress")!,file=root.querySelector<HTMLInputElement>("#wc-phonebook-file")!.files?.[0];if(!file)return;button.disabled=true;
    try{const data=JSON.parse(await file.text()) as {sourceHash:string;matches:unknown[]};if(!Array.isArray(data.matches)||!data.matches.length)throw new Error("Choose the prepared phone-book matches file.");let updated=0,customerNames=0;
      for(let i=0;i<data.matches.length;i+=25){const result=await api("/manage/whatsapp/customers/phonebook","POST",{sourceHash:data.sourceHash,matches:data.matches.slice(i,i+25)}) as {updated:number;customerNames:number};updated+=result.updated;customerNames+=result.customerNames;output.textContent=`Matched ${Math.min(i+25,data.matches.length)} of ${data.matches.length} saved labels…`;}
      output.textContent=`Saved ${updated} contact labels; filled ${customerNames} missing customer names. Adult identity still needs review. No unrelated contacts added.`;await changed();await refresh();
    }catch(error){fail(output,error);}finally{button.disabled=false;}
  });
  root.querySelector("#wc-dates-import")!.addEventListener("click",async event=>{
    const button=event.currentTarget as HTMLButtonElement,output=root.querySelector("#wc-dates-progress")!,file=root.querySelector<HTMLInputElement>("#wc-dates-file")!.files?.[0];if(!file)return;button.disabled=true;
    try{const data=JSON.parse(await file.text()) as {sourceHash:string;contacts:unknown[]};if(!Array.isArray(data.contacts)||!data.contacts.length)throw new Error("Choose the prepared past event dates file.");let saved=0,reminders=0;for(let i=0;i<data.contacts.length;i+=10){const result=await api("/manage/whatsapp/customers/event-dates","POST",{sourceHash:data.sourceHash,contacts:data.contacts.slice(i,i+10)}) as {saved:number;reminders:number};saved+=result.saved;reminders+=result.reminders;output.textContent=`Saved ${Math.min(i+10,data.contacts.length)} of ${data.contacts.length} date records…`;}output.textContent=`Saved date candidates for ${saved} contacts; ${reminders} private date-review reminders created. Confirm a past event date to plan its anniversary. Nothing sent.`;await changed();await refresh();}catch(error){fail(output,error);}finally{button.disabled=false;}
  });
  const complete=root.querySelector<HTMLButtonElement>("#wc-complete")!;
  root.querySelector("#wc-verified")!.addEventListener("change",event=>{complete.disabled=!(event.currentTarget as HTMLInputElement).checked;});
  complete.addEventListener("click",async()=>{
    const output=root.querySelector("#wc-cleanup-progress")!;complete.disabled=true;
    try{if(!migration)throw new Error("Import or reselect the same customer details file first.");const backupSha256=root.querySelector<HTMLInputElement>("#wc-backup-hash")!.value.trim();if(!/^[a-f0-9]{64}$/.test(backupSha256))throw new Error("Enter the verified recovery backup SHA-256.");await api("/manage/whatsapp/customers/complete","POST",{...migration,backupSha256});output.textContent="Online chat text removed. Customer details and concise history remain; the full source is in your local recovery backup.";await refresh();}catch(error){fail(output,error);complete.disabled=false;}
  });
  await refresh();
}
function requireProgress(next:number,after:number,done:boolean){if(!done&&next<=after)throw new Error("Backup stopped without progress. No chat text was removed.");}



