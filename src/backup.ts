import { backup } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { Store } from "./store.js";
mkdirSync("backups", { recursive: true });
const store = new Store(process.env.DATABASE_PATH ?? "./data/magic.sqlite");
const path = `backups/magic-${new Date().toISOString().replace(/[:.]/g, "-")}.sqlite`;
await backup(store.db, path);
store.db.close();
console.log(
  `Consistent database backup saved to ${path}. Store encrypted copies off this machine.`,
);
