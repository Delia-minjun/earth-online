import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url)); // apps/server/src
/** 05-开发 根目录 */
export const PROJECT_ROOT = resolve(here, "../../..");
/** 数据目录：默认 05-开发/data，可用 LIFE_DATA_DIR 覆盖 */
export const DATA_DIR = process.env.LIFE_DATA_DIR ?? join(PROJECT_ROOT, "data");

let instance: DatabaseSync | null = null;

export function dbFile(): string {
  return join(DATA_DIR, "life.db");
}

export function getDb(): DatabaseSync {
  if (instance) return instance;
  mkdirSync(DATA_DIR, { recursive: true });
  const db = new DatabaseSync(dbFile());
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  instance = db;
  return db;
}
