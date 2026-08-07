/* ============================================================
   bq-local-init.mjs — create the per-client datasets and the FULL
   Google Ads DTS table replica on the LOCAL BigQuery emulator.

   Layout (mirrors the future production layout in entangle-signals):
     client_<slug>            ← one dataset per client (isolation boundary)
       ads_Campaign           ← every table from local-bq/schemas/google_ads/
       ads_CampaignBasicStats
       ...

   Idempotent: safe to re-run (skips datasets/tables that exist) —
   the emulator is in-memory, so run this after every `npm run bq:local`.

   Usage:
     npm run bq:local          # terminal 1 — boot emulator (port 9050)
     npm run bq:init           # terminal 2 — create datasets + tables
   ============================================================ */
import { BigQuery } from "@google-cloud/bigquery";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

/* BQ_ENDPOINT: unset → emulator default; set to "" → REAL BigQuery (uses
   GOOGLE_APPLICATION_CREDENTIALS). Same tables either way — that's the point. */
const PROJECT = process.env.BQ_PROJECT || process.env.BQ_LOCAL_PROJECT || "entangle-local";
const ENDPOINT = process.env.BQ_ENDPOINT ?? process.env.BQ_LOCAL_ENDPOINT ?? "http://localhost:9050";
const LOCATION = process.env.BQ_LOCATION || undefined; // e.g. australia-southeast1 on real BQ
const SCHEMA_ROOT = path.join(process.cwd(), "local-bq", "schemas");
/* Every platform's schema dir. Each client dataset gets ALL of them
   (ads_* from Google Ads, meta_* from Meta, …) — platform-prefixed tables
   inside one dataset per client. Limit with SOURCES=google_ads,meta_ads */
const SOURCES = (process.env.SOURCES || "").split(",").filter(Boolean);

/* Pilot clients — one dataset each. Extend as clients are provisioned. */
const CLIENTS = ["aqua-pulse-spas", "care-for-you-at-home", "ms-plus"];
const datasetOf = (slug) => "client_" + slug.replace(/-/g, "_");

const bq = new BigQuery({ projectId: PROJECT, ...(ENDPOINT ? { apiEndpoint: ENDPOINT } : {}) });

/* Load every table schema across all platform dirs (skip manifest/readme) */
const dirs = (await readdir(SCHEMA_ROOT, { withFileTypes: true }))
  .filter((e) => e.isDirectory() && (!SOURCES.length || SOURCES.includes(e.name)))
  .map((e) => e.name)
  .sort();
const schemas = {};
for (const dir of dirs) {
  const p = path.join(SCHEMA_ROOT, dir);
  const files = (await readdir(p)).filter((f) => f.endsWith(".json") && f !== "manifest.json").sort();
  for (const f of files) {
    schemas[f.replace(/\.json$/, "")] = JSON.parse(await readFile(path.join(p, f), "utf8"));
  }
  console.log(`Loaded ${files.length} schemas from ${dir}`);
}
console.log(`Total ${Object.keys(schemas).length} tables per client dataset`);

for (const slug of CLIENTS) {
  const dsId = datasetOf(slug);
  const ds = bq.dataset(dsId);
  const [dsExists] = await ds.exists();
  if (!dsExists) {
    await bq.createDataset(dsId, {
      ...(LOCATION ? { location: LOCATION } : {}),
      description: `Entangle per-client marketing data (ads_* = Google Ads DTS shapes, meta_* = Meta Marketing API). Dummy data until real sources are linked — ${slug}`,
    });
    console.log(`+ dataset ${dsId}${LOCATION ? " (" + LOCATION + ")" : ""}`);
  } else console.log(`= dataset ${dsId}`);

  let created = 0, skipped = 0, failed = 0;
  for (const [table, fields] of Object.entries(schemas)) {
    try {
      const [tExists] = await ds.table(table).exists();
      if (tExists) { skipped++; continue; }
      await ds.createTable(table, { schema: { fields } });
      created++;
    } catch (e) {
      failed++;
      console.error(`  ! ${dsId}.${table}: ${e.message.slice(0, 140)}`);
    }
  }
  console.log(`  tables: +${created} created, =${skipped} existing, !${failed} failed`);
}
console.log("\nDone. Emulator is in-memory — re-run this after restarting `npm run bq:local`.");
