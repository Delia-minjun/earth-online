import { migrate } from "./migrate.ts";
import { dbFile } from "./db.ts";

const result = migrate();
console.log(`[migrate] done. applied=${result.applied.length} skipped=${result.skipped}`);
console.log(`[migrate] db: ${dbFile()}`);
