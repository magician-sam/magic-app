import type { Express, Request } from "express";
import { z } from "zod";
import type { Store } from "./store.js";
import type { Customer } from "./models.js";
import { customerSchema, normalizePhone, requireThat } from "./domain.js";
import { writeRoutes } from "./write-routes.js";

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const fields=z.array(z.string().max(100)).max(12).default([]);
const historySchema = z.object({ enquiryDate: z.iso.date(), lastDiscussed: z.iso.date(), eventDateCandidates: z.array(z.iso.date()).max(50), eventDateTextCandidates:fields,timeCandidates:fields,venueCandidates:fields,childNameCandidates:fields,outcomeClues:fields, services: z.array(z.string().max(60)).max(20), status: z.literal("enquiry_unverified"), evidenceIds: z.array(z.string().max(80)).max(8), dateNeedsReview: z.boolean(), completionVerified: z.literal(false) }).strict();
const candidateSchema = z.object({ id: z.string().regex(/^[a-f0-9]{32}$/), sourceHash: hash, chatIds: z.array(z.string().max(100)).min(1).max(30), name: z.string().min(2).max(200), phone: z.string().regex(/^\+[1-9]\d{6,14}$/), nameNeedsReview: z.boolean(), displayNameCandidates: z.array(z.string().max(200)).max(3), children: z.array(z.never()).max(0), history: z.array(historySchema).min(1).max(1000), qualification: z.enum(["supported_enquiry", "needs_customer_review"]), offersConsent: z.literal(false) }).strict();
type Candidate = z.infer<typeof candidateSchema> & { customerId?: string; importedAt?: string };
function owned(req: Request) { requireThat(["owner", "admin"].includes(req.user.role), "Only the owner can manage WhatsApp customer extraction.", 403);return req; }

export function whatsappCustomers(app: Express, store: Store) {
  const writes = writeRoutes(app, store);
  app.get("/api/manage/whatsapp/customers", async (request, res) => {
    const req=owned(request), rows=await store.all<Candidate>(req.business.id,"whatsappCustomerReview");
    const q=String(req.query.q??"").toLowerCase().slice(0,100), offset=Math.max(0,Number(req.query.offset)||0);
    const matched=rows.filter(c=>`${c.name} ${c.phone}`.toLowerCase().includes(q));
    const raw=await store.db.prepare("SELECT count(*) AS total FROM records WHERE business_id=? AND kind IN ('whatsappMessages','whatsappReview')").get(req.business.id);
    res.set("Cache-Control","private, no-store").json({ total:matched.length, offset, candidates:matched.slice(offset,offset+25), supported:rows.filter(c=>c.customerId).length, needsReview:rows.filter(c=>!c.customerId).length, chatTextRecords:Number(raw?.total??0), migrations:await store.all(req.business.id,"whatsappCustomerMigrations") });
  });
  writes.post("/api/manage/whatsapp/customers/import", async (request,res) => {
    const req=owned(request), input=z.object({sourceHash:hash,candidates:z.array(candidateSchema).min(1).max(15)}).strict().parse(req.body);
    requireThat(await store.get(req.business.id,"whatsappImports",input.sourceHash),"Import the source archive before extracting customer details.",409);
    const customers=await store.all<Customer>(req.business.id,"customers"); let created=0, linked=0, review=0;
    for(const candidate of input.candidates) {
      requireThat(candidate.sourceHash===input.sourceHash,"Source mismatch.");
      const before=await store.get<Candidate>(req.business.id,"whatsappCustomerReview",candidate.id);
      if(before)continue;
      for(const chatId of candidate.chatIds){
        const contact=await store.get<{rows:{phone_candidate:string}[]}>(req.business.id,"whatsappContacts",`${input.sourceHash}:${chatId}`);
        requireThat(contact,"Missing source contact.",409);
        requireThat(normalizePhone(contact.rows[0].phone_candidate)===normalizePhone(candidate.phone),"Customer number does not match its source conversation.",409);
      }
      const next:Candidate={...candidate,importedAt:new Date().toISOString()};
      if(candidate.qualification==="supported_enquiry") {
        const matches=customers.filter(c=>normalizePhone(c.phone)===normalizePhone(candidate.phone));
        if(matches.length>1){next.qualification="needs_customer_review";review++;}
        else {
          const existing=matches[0];
          const customer=existing??{...customerSchema.parse({name:candidate.name,phone:candidate.phone,source:"whatsapp_enquiry",kind:"unknown",offersConsent:false,notes:"Imported historical WhatsApp enquiry. Adult identity and event completion need review. A chat timestamp is not an event date."}),id:`wa-${candidate.id}`};
          if(!existing){await store.put(req.business.id,"customers",customer);customers.push(customer);created++;}else linked++;
          next.customerId=customer.id;
          // Only useful business summaries are stored; no source messages or nearby replies.
          for(const [index,entry] of candidate.history.entries()) {
            const summary=["Historical WhatsApp enquiry — event completion is unverified.", entry.services.length?`Discussed services: ${entry.services.join(", ")}.`:"Services need review.",entry.eventDateCandidates.length?`Possible event dates (verify): ${entry.eventDateCandidates.join(", ")}.`:"Event date unknown; this entry's date is the enquiry date.",entry.eventDateTextCandidates.length?`Date mentions (verify year/day/month): ${entry.eventDateTextCandidates.join(", ")}.`:"",entry.timeCandidates.length?`Time mentions (verify): ${entry.timeCandidates.join(", ")}.`:"",entry.venueCandidates.length?`Venue mentions (verify): ${entry.venueCandidates.join(", ")}.`:"",entry.childNameCandidates.length?`Child names (verify; not adult identity): ${entry.childNameCandidates.join(", ")}.`:"", candidate.nameNeedsReview?"Adult contact name unknown; do not use a child's name as the adult's identity.":"Adult name needs identity review."].filter(Boolean).join(" ");
            await store.put(req.business.id,"contactHistory",{id:`wa-${candidate.id}-${index}`,customerId:customer.id,bookingId:"",date:entry.enquiryDate,channel:"whatsapp",direction:"inbound",summary:summary+(entry.outcomeClues.length?` ${entry.outcomeClues.join(". ")}.`:""),archived:false,revision:1,createdAt:next.importedAt,updatedAt:next.importedAt});
          }
        }
      }else review++;
      await store.put(req.business.id,"whatsappCustomerReview",next);
    }
    await store.audit(req.business.id,req.user.email,"whatsapp.customer-details-imported",input.sourceHash,null,{received:input.candidates.length,created,linked,review});
    res.json({created,linked,review});
  });
  writes.post("/api/manage/whatsapp/customers/:id/approve",async(request,res)=>{
    const req=owned(request), key=String(req.params.id), before=await store.get<Candidate>(req.business.id,"whatsappCustomerReview",key);
    requireThat(before,"Contact not found.",404);
    const input=z.object({verified:z.literal(true),customer:customerSchema}).strict().parse(req.body);
    requireThat(normalizePhone(input.customer.phone)===normalizePhone(before.phone),"Use the source contact's number.");
    const matches=(await store.all<Customer>(req.business.id,"customers")).filter(c=>normalizePhone(c.phone)===normalizePhone(before.phone));
    requireThat(matches.length<=1,"Multiple customer records use this number. Resolve the duplicate in Customers.",409);
    const customer=matches[0]??{...input.customer,id:`wa-${before.id}`,source:"whatsapp_review"};
    if(!matches[0])await store.put(req.business.id,"customers",customer);
    const next={...before,customerId:customer.id,qualification:"supported_enquiry",reviewedAt:new Date().toISOString(),reviewedBy:req.user.email};
    await store.put(req.business.id,"whatsappCustomerReview",next);
    if(!before.customerId)for(const [index,entry]of before.history.entries())await store.put(req.business.id,"contactHistory",{id:`wa-${before.id}-${index}`,customerId:customer.id,bookingId:"",date:entry.enquiryDate,channel:"whatsapp",direction:"inbound",summary:`Historical WhatsApp enquiry. Discussed services: ${entry.services.join(", ")||"unknown"}. Event completion unverified. ${entry.eventDateCandidates.length?`Possible event dates to verify: ${entry.eventDateCandidates.join(", ")}.`:"Event date unknown."}`,archived:false,revision:1,createdAt:next.reviewedAt,updatedAt:next.reviewedAt});
    await store.audit(req.business.id,req.user.email,"whatsapp.customer-manually-reviewed",customer.id,{linked:!!before.customerId},{linked:true});res.json({customerId:customer.id});
  });
  writes.post("/api/manage/whatsapp/customers/complete", async(request,res)=>{
    const req=owned(request), input=z.object({sourceHash:hash,expected:z.number().int().positive(),backupSha256:hash}).strict().parse(req.body);
    const candidates=(await store.all<Candidate>(req.business.id,"whatsappCustomerReview")).filter(c=>c.sourceHash===input.sourceHash);
    requireThat(candidates.length===input.expected,"Customer detail import is incomplete.",409);
    const importRecord=await store.get<{counts:Record<string,number>}>(req.business.id,"whatsappImports",input.sourceHash);
    requireThat(importRecord,"Source import is missing.",409);
    const before=await store.get(req.business.id,"whatsappCustomerMigrations",input.sourceHash);
    if(before){res.json(before);return;}
    // Caller must have downloaded and verified the local recovery backup first.
    for(const kind of ["whatsappMessages","whatsappReview","whatsappContacts"])
      await store.db.prepare("DELETE FROM records WHERE business_id=? AND kind=? AND id>=? AND id<?").run(req.business.id,kind,`${input.sourceHash}:`,`${input.sourceHash}:\uffff`);
    await store.put(req.business.id,"whatsappStats",{id:input.sourceHash,counts:{contact:0,messages:0,review:0}});
    const record={id:input.sourceHash,completedAt:new Date().toISOString(),backupSha256:input.backupSha256,customers:candidates.filter(c=>c.customerId).length,needsReview:candidates.filter(c=>!c.customerId).length,removedSourceCounts:importRecord.counts,recovery:"Local full database backup and original CSV; no chat text retained in customer records"};
    await store.put(req.business.id,"whatsappCustomerMigrations",record);
    await store.audit(req.business.id,req.user.email,"whatsapp.chat-text-removed",input.sourceHash,null,record);
    res.json(record);
  });
}
