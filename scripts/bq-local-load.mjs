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

const PROJECT = process.env.BQ_LOCAL_PROJECT || "entangle-local";
const ENDPOINT = process.env.BQ_LOCAL_ENDPOINT || "http://localhost:9050";
const DUMMY = path.join(process.cwd(), "local-bq", "dummy");
const SCHEMA_DIR = path.join(process.cwd(), "local-bq", "schemas", "google_ads");

const bq = new BigQuery({ projectId: PROJECT, apiEndpoint: ENDPOINT });

const datasets = (await readdir(DUMMY, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name);
let total = 0;
for (const dsId of datasets) {
  const ds = bq.dataset(dsId);
  const files = (await readdir(path.join(DUMMY, dsId))).filter((f) => f.endsWith(".ndjson"));
  for (const f of files) {
    const table = f.replace(/\.ndjson$/, "");
    const file = path.join(DUMMY, dsId, f);
    /* The emulator's resumable-upload endpoint crashes the client's load-job
       path (uncatchable async TypeError), so local loading uses streaming
       inserts — the real-BQ loader (scripts/load-bq.mjs) keeps load jobs. */
    const rows = (await readFile(file, "utf8")).trim().split("\n").map((l) => JSON.parse(l));
    for (let i = 0; i < rows.length; i += 500) {
      await ds.table(table).insert(rows.slice(i, i + 500));
    }
    total += rows.length;
    console.log(`  ✓ ${dsId}.${table}: ${rows.length} rows (insert)`);
  }
}
console.log(`\nDone — ${total} rows on the emulator.`);
