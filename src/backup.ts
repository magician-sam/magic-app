import { mkdir, writeFile } from "node:fs/promises";
import { storeFromEnvironment } from "./runtime.js";
import { snapshot, encryptSnapshot } from "./snapshots.js";
const store = storeFromEnvironment();
try {
  const encrypted = encryptSnapshot(
    await snapshot(store),
    process.env.BACKUP_PASSPHRASE ?? "",
  );
  await mkdir("backups", { recursive: true });
  const path = `backups/magic-${new Date().toISOString().replace(/[:.]/g, "-")}.magicbackup`;
  await writeFile(path, encrypted, { flag: "wx", mode: 0o600 });
  console.log(
    `Encrypted backup saved to ${path}. Keep its passphrase separately and copy the file to offsite storage.`,
  );
} finally {
  store.db.close();
}
