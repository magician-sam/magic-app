import { readFile } from "node:fs/promises";
import { storeFromEnvironment } from "./runtime.js";
import { decryptSnapshot, restoreSnapshot } from "./snapshots.js";
if (!process.argv[2])
  throw new Error("Supply a .magicbackup file. The destination must be empty.");
const data = decryptSnapshot(
  await readFile(process.argv[2]),
  process.env.BACKUP_PASSPHRASE ?? "",
);
const store = storeFromEnvironment();
try {
  console.log(
    `Restored ${(await restoreSnapshot(store, data)).rows} rows to an empty database.`,
  );
} finally {
  store.db.close();
}
