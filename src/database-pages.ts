import type { Express } from "express";
import { z } from "zod";
import type { Store } from "./store.js";
import { requireThat } from "./domain.js";
const tables=["businesses","users","records","sessions","links","visits","customer_accounts","customer_sessions","customer_resets","referral_codes","interest_clicks","rate_limits"] as const;
export function databasePages(app:Express,store:Store){
  app.get("/api/manage/database-page",async(req,res)=>{
    requireThat(["owner","admin"].includes(req.user.role),"Only the owner can download a database backup.",403);
    const businesses=await store.db.prepare("SELECT id FROM businesses").all();
    requireThat(businesses.length===1&&businesses[0].id===req.business.id,"Paged database backups require a dedicated business database.",403);
    const input=z.object({table:z.enum(tables).optional(),after:z.coerce.number().int().min(0).default(0),ceiling:z.coerce.number().int().min(0).optional()}).parse(req.query);
    res.set("Cache-Control","private, no-store");
    if(!input.table){
      const manifest=[];
      for(const table of tables){const row=await store.db.prepare(`SELECT count(*) AS count,max(rowid) AS ceiling FROM ${table}`).get();manifest.push({table,count:Number(row?.count??0),ceiling:Number(row?.ceiling??0)});}
      res.json({version:2,createdAt:new Date().toISOString(),tables:manifest});return;
    }
    requireThat(input.ceiling!==undefined,"A backup ceiling is required.");
    const rows=await store.db.prepare(`SELECT rowid AS __backup_rowid,* FROM ${input.table} WHERE rowid>? AND rowid<=? ORDER BY rowid LIMIT 100`).all(input.after,input.ceiling!);
    let size=0;const selected=[];let last=input.after;
    for(const row of rows){const {__backup_rowid,...value}=row;const bytes=Buffer.byteLength(JSON.stringify(value));if(selected.length&&size+bytes>2200000)break;selected.push(value);size+=bytes;last=Number(__backup_rowid);}
    res.json({rows:selected,next:last,done:!rows.length||last>=input.ceiling!});
  });
}
