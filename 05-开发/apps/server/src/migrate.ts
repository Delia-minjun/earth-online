import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getDb } from "./db.ts";

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

/**
 * 极简迁移器：按文件名排序，记录已执行过的脚本。
 * 不追求回滚能力——单用户本地库，备份比回滚更实在。
 */
export function migrate(): { applied: string[]; skipped: number } {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migration (
      name       TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const rows = db.prepare("SELECT name FROM _migration").all() as Array<{ name: string }>;
  const done = new Set(rows.map((r) => r.name));

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const applied: string[] = [];
  for (const file of files) {
    if (done.has(file)) continue;
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    db.exec("BEGIN");
    try {
      db.exec(sql);
      db.prepare("INSERT INTO _migration (name) VALUES (?)").run(file);
      db.exec("COMMIT");
      applied.push(file);
      console.log(`[migrate] applied ${file}`);
    } catch (err) {
      db.exec("ROLLBACK");
      console.error(`[migrate] failed ${file}`, err);
      throw err;
    }
  }
  return { applied, skipped: files.length - applied.length };
}
