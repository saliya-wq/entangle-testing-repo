/* ============================================================
   bq-local-load.mjs — load the generated dummy NDJSON into the
   LOCAL BigQuery emulator (same layout the real DTS will use).

   Tries a proper load job first (production parity); falls back to
   streaming inserts if the emulator rejects the upload path.

   Usage: npm run bq:seed-local   (gen:dummy + this)
   ============================================================ */
import { BigQuery } from "@google-cloud/bigquery";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

/* BQ_ENDPOINT: unset → emulator; "" → REAL BigQuery (load jobs instead of streaming). */
const PROJECT = process.env.BQ_PROJECT || process.env.BQ_LOCAL_PROJECT || "entangle-local";
const ENDPOINT = process.env.BQ_ENDPOINT ?? process.env.BQ_LOCAL_ENDPOINT ?? "http://localhost:9050";
const IS_EMULATOR = !!ENDPOINT;
const DUMMY = path.join(process.cwd(), "local-bq", "dummy");
const SCHEMA_ROOT = path.join(process.cwd(), "local-bq", "schemas");

const bq = new BigQuery({ projectId: PROJECT, ...(ENDPOINT ? { apiEndpoint: ENDPOINT } : {}) });

/* table name -> schema fields, across every platform schema dir */
const schemaOf = {};
for (const e of await readdir(SCHEMA_ROOT, { withFileTypes: true })) {
  if (!e.isDirectory()) continue;
  const p = path.join(SCHEMA_ROOT, e.name);
  for (const f of (await readdir(p)).filter((x) => x.endsWith(".json") && x !== "manifest.json")) {
    schemaOf[f.replace(/\.json$/, "")] = JSON.parse(await readFile(path.join(p, f), "utf8"));
  }
}

const datasets = (await readdir(DUMMY, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name);
let total = 0;
for (const dsId of datasets) {
  const ds = bq.dataset(dsId);
  const files = (await readdir(path.join(DUMMY, dsId))).filter((f) => f.endsWith(".ndjson"));
  for (const f of files) {
    const table = f.replace(/\.ndjson$/, "");
    const file = path.join(DUMMY, dsId, f);
    const n = (await readFile(file, "utf8")).trim().split("\n").length;
    if (IS_EMULATOR) {
      /* Emulator: its resumable-upload endpoint crashes the client's load-job
         path (uncatchable async TypeError) → streaming inserts locally.
         Inserts APPEND, so drop+recreate first to emulate WRITE_TRUNCATE —
         otherwise re-running the seeder silently multiplies every metric. */
      const fields = schemaOf[table];
      if (!fields) throw new Error(`no schema found for table ${table}`);
      await ds.table(table).delete().catch(() => {});
      await ds.createTable(table, { schema: { fields } });
      const rows = (await readFile(file, "utf8")).trim().split("\n").map((l) => JSON.parse(l));
      for (let i = 0; i < rows.length; i += 500) {
        await ds.table(table).insert(rows.slice(i, i + 500));
      }
      console.log(`  ✓ ${dsId}.${table}: ${n} rows (insert/emulator)`);
    } else {
      /* Real BigQuery: proper load job, WRITE_TRUNCATE (idempotent re-runs). */
      const fields = schemaOf[table];
      if (!fields) throw new Error(`no schema found for table ${table}`);
      await ds.table(table).load(file, {
        sourceFormat: "NEWLINE_DELIMITED_JSON",
        schema: { fields },
        writeDisposition: "WRITE_TRUNCATE",
      });
      console.log(`  ✓ ${dsId}.${table}: ${n} rows (load job)`);
    }
    total += n;
  }
}
console.log(`\nDone — ${total} rows loaded.`);
