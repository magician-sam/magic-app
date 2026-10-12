import type { Express } from "express";
import { z } from "zod";
import type { Store } from "./store.js";
import { requireThat } from "./domain.js";
import { businessBackupScope, snapshotTables } from "./snapshots.js";
export function databasePages(app:Express,store:Store){
  app.get("/api/manage/database-page",async(req,res)=>{
    requireThat(["owner","admin"].includes(req.user.role),"Only the owner can download a database backup.",403);
    requireThat(await businessBackupScope(store,req.business.id),"Paged database backups require a dedicated business database.",403);
    const {version,tables:columns}=await snapshotTables(store),tables=Object.keys(columns);
    const input=z.object({table:z.string().optional(),after:z.coerce.number().int().min(0).default(0),ceiling:z.coerce.number().int().min(0).optional()}).parse(req.query);
    requireThat(!input.table||tables.includes(input.table),"Unknown backup table.");
    res.set("Cache-Control","private, no-store");
    if(!input.table){
      const manifest=[];
      for(const table of tables){const row=await store.db.prepare(`SELECT count(*) AS count,max(rowid) AS ceiling FROM ${table}`).get();manifest.push({table,count:Number(row?.count??0),ceiling:Number(row?.ceiling??0)});}
      res.json({version,createdAt:new Date().toISOString(),tables:manifest});return;
    }
    requireThat(input.ceiling!==undefined,"A backup ceiling is required.");
    const rows=await store.db.prepare(`SELECT rowid AS __backup_rowid,* FROM ${input.table} WHERE rowid>? AND rowid<=? ORDER BY rowid LIMIT 100`).all(input.after,input.ceiling!);
    let size=0;const selected=[];let last=input.after;
    for(const row of rows){const {__backup_rowid,...value}=row;const bytes=Buffer.byteLength(JSON.stringify(value));if(selected.length&&size+bytes>2200000)break;selected.push(value);size+=bytes;last=Number(__backup_rowid);}
    res.json({rows:selected,next:last,done:!rows.length||last>=input.ceiling!});
  });
}
