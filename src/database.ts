import { AsyncLocalStorage } from "node:async_hooks";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  createClient,
  type Client,
  type Transaction,
  type InValue,
} from "@libsql/client/web";

type Row = Record<string, string | number | bigint | null | Uint8Array>;
type Context = { remote?: Transaction; active: boolean };

// Keep transaction ownership with the async request, never on a shared connection field.
export class Database {
  readonly local?: DatabaseSync;
  private remote?: Client;
  private context = new AsyncLocalStorage<Context>();
  private queue: Promise<unknown> = Promise.resolve();
  readonly ready: Promise<void>;
  constructor(
    path: string,
    schema: string,
    authToken?: string,
    client?: Client,
  ) {
    if (client || /^(libsql|https):\/\//.test(path)) {
      this.remote =
        client ?? createClient({ url: path, authToken, intMode: "number" });
      this.ready = this.remote.executeMultiple(schema);
    } else {
      if (process.env.VERCEL)
        throw new Error(
          "Vercel requires TURSO_DATABASE_URL and TURSO_AUTH_TOKEN. Local SQLite is not durable on Vercel.",
        );
      if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
      this.local = new DatabaseSync(path);
      this.local.exec(
        "PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;",
      );
      this.local.exec(schema);
      this.ready = Promise.resolve();
    }
  }
  private async exclusive<T>(work: () => Promise<T>): Promise<T> {
    const previous = this.queue;
    let release!: () => void;
    this.queue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await work();
    } finally {
      release();
    }
  }
  private async use<T>(
    work: (remote?: Client | Transaction) => Promise<T>,
  ): Promise<T> {
    await this.ready;
    const context = this.context.getStore();
    if (context) {
      if (!context.active) throw new Error("Transaction is already closed.");
      return work(context.remote);
    }
    return this.remote && this.remote.protocol !== "file"
      ? work(this.remote)
      : this.exclusive(() => work(this.remote));
  }
  prepare(sql: string) {
    const execute = (args: SQLInputValue[], mode: "all" | "get" | "run") =>
      this.use(async (remote) => {
        if (remote) {
          const result = await remote.execute({ sql, args: args as InValue[] });
          return mode === "run"
            ? {
                changes: result.rowsAffected,
                lastInsertRowid: result.lastInsertRowid ?? 0n,
              }
            : (result.rows as Row[]);
        }
        const statement = this.local!.prepare(sql);
        return mode === "run"
          ? statement.run(...args)
          : (statement.all(...args) as Row[]);
      });
    return {
      all: async (...args: SQLInputValue[]) =>
        (await execute(args, "all")) as Row[],
      get: async (...args: SQLInputValue[]) =>
        ((await execute(args, "get")) as Row[])[0] as Row | undefined,
      run: async (...args: SQLInputValue[]) =>
        (await execute(args, "run")) as {
          changes: number | bigint;
          lastInsertRowid: number | bigint;
        },
    };
  }
  async exec(sql: string) {
    await this.use(async (remote) => {
      if (remote) await remote.executeMultiple(sql);
      else this.local!.exec(sql);
    });
  }
  async transaction<T>(work: () => T | Promise<T>): Promise<T> {
    await this.ready;
    const parent = this.context.getStore();
    if (parent) {
      if (!parent.active) throw new Error("Transaction is already closed.");
      return work();
    }
    const run = async () => {
      let remote: Transaction | undefined;
      if (this.remote) {
        for (let attempt = 0; ; attempt++) {
          try {
            remote = await this.remote.transaction("write");
            break;
          } catch (error) {
            const code =
              error && typeof error === "object" && "code" in error
                ? String(error.code)
                : "";
            if (!/SQLITE_BUSY|SQLITE_LOCKED/.test(code) || attempt >= 5)
              throw error;
            await new Promise((resolve) =>
              setTimeout(resolve, Math.min(100 * 2 ** attempt, 800)),
            );
          }
        }
      }
      if (!remote) this.local!.exec("BEGIN IMMEDIATE");
      const context = { remote, active: true };
      try {
        const value = await this.context.run(context, work);
        if (remote) await remote.commit();
        else this.local!.exec("COMMIT");
        return value;
      } catch (error) {
        if (remote) {
          if (!remote.closed) await remote.rollback();
        } else this.local!.exec("ROLLBACK");
        throw error;
      } finally {
        context.active = false;
        remote?.close();
      }
    };
    return this.exclusive(run);
  }
  close() {
    this.remote?.close();
    this.local?.close();
  }
}
