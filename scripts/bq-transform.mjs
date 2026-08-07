/* ============================================================
   bq-transform.mjs — run the raw→mart transform SQL per client dataset.
   Works against the LOCAL emulator by default; point BQ_ENDPOINT/BQ_PROJECT
   (+ GOOGLE_APPLICATION_CREDENTIALS) at real BigQuery for the cutover —
   the SQL is identical.

   Usage: npm run bq:transform
   ============================================================ */
import { BigQuery } from "@google-cloud/bigquery";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

/* BQ_ENDPOINT: unset → emulator; "" → REAL BigQuery. */
const PROJECT = process.env.BQ_PROJECT || "entangle-local";
const ENDPOINT = process.env.BQ_ENDPOINT ?? "http://localhost:9050";
const SQL_DIR = path.join(process.cwd(), "local-bq", "sql");
const CLIENTS = ["client_aqua_pulse_spas", "client_care_for_you_at_home", "client_ms_plus"];

const bq = new BigQuery({ projectId: PROJECT, ...(ENDPOINT ? { apiEndpoint: ENDPOINT } : {}) });
const sqlFiles = (await readdir(SQL_DIR)).filter((f) => f.endsWith(".sql")).sort();

for (const ds of CLIENTS) {
  for (const f of sqlFiles) {
    const sql = (await readFile(path.join(SQL_DIR, f), "utf8")).replaceAll("${DATASET}", ds);
    const mart = f.replace(/\.sql$/, "");
    /* The emulator rejects CREATE OR REPLACE on an existing table, so drop
       first — harmless on real BigQuery, where CREATE OR REPLACE also works. */
    await bq.dataset(ds).table(mart).delete().catch(() => {});
    try {
      await bq.query({ query: sql });
    } catch (e) {
      /* Known emulator boundary: it stores nested RECORDs fine but cannot
         execute the GA4 UNNEST(event_params) idiom (translates to SQLite and
         fails on struct conversion). The SQL is valid — it builds on real
         BigQuery. Warn and continue so the other marts still build locally. */
      if (ENDPOINT) {
        console.warn(`  ⚠ ${ds}.${mart}: skipped on emulator — ${String(e.message).slice(0, 90)}…`);
        continue;
      }
      throw e;
    }
    const [[{ n }]] = [await bq.query({ query: `SELECT COUNT(*) AS n FROM \`${ds}.${mart}\`` })].map((r) => r[0]);
    console.log(`✓ ${ds}.${mart}: ${n} rows`);
  }
}
console.log("\nTransforms complete.");
