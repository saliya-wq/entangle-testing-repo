/* ============================================================
   load-bq.mjs — push the generated .bq-demo/ files into BigQuery
   using the @google-cloud/bigquery client library (no gcloud/bq
   CLI needed). Creates one demo_client_<slug> dataset per client
   (labeled env=demo) and loads each mart table (WRITE_TRUNCATE).

   The credential is read from a KEY FILE PATH — it is never passed
   as text. Run:
     export GCP_PROJECT=your-project-id
     export GOOGLE_APPLICATION_CREDENTIALS=/abs/path/to/sa-key.json
     node scripts/load-bq.mjs        # (or: npm run load:bq)

   Prereqs: run `npm run seed:bq` first (writes .bq-demo/), and the
   service account needs BigQuery Data Editor + Job User.
   ============================================================ */
import { BigQuery } from "@google-cloud/bigquery";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const OUT = path.join(ROOT, ".bq-demo");
const LOCATION = process.env.BQ_LOCATION || "australia-southeast1";
const TABLES = ["marts_kpis", "marts_attribution_paths"];

const projectId = process.env.GCP_PROJECT;
if (!projectId) { console.error("Set GCP_PROJECT to your project id."); process.exit(1); }
if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error("Set GOOGLE_APPLICATION_CREDENTIALS to the path of your service-account key JSON.");
  process.exit(1);
}

const bq = new BigQuery({ projectId }); // reads GOOGLE_APPLICATION_CREDENTIALS from env

const loadSchema = async (table) =>
  ({ fields: JSON.parse(await readFile(path.join(OUT, "schema", `${table}.json`), "utf8")) });

// dataset dirs look like demo_client_<slug>
const entries = await readdir(OUT, { withFileTypes: true });
const datasets = entries.filter((e) => e.isDirectory() && e.name.startsWith("demo_client_")).map((e) => e.name);
if (!datasets.length) { console.error("No .bq-demo/demo_client_* datasets found — run `npm run seed:bq` first."); process.exit(1); }

for (const dsId of datasets) {
  // create dataset (labeled env=demo) if it doesn't exist
  const dataset = bq.dataset(dsId);
  const [exists] = await dataset.exists();
  if (!exists) {
    await bq.createDataset(dsId, { location: LOCATION, labels: { env: "demo" }, description: `Entangle DEMO data (removable) — ${dsId}` });
    console.log(`+ dataset ${dsId} (env=demo)`);
  } else {
    await dataset.setMetadata({ labels: { env: "demo" } }).catch(() => {});
    console.log(`= dataset ${dsId} (exists)`);
  }

  for (const table of TABLES) {
    const file = path.join(OUT, dsId, `${table}.ndjson`);
    const schema = await loadSchema(table);
    const [job] = await dataset.table(table).load(file, {
      sourceFormat: "NEWLINE_DELIMITED_JSON",
      schema,
      writeDisposition: "WRITE_TRUNCATE",
      createDisposition: "CREATE_IF_NEEDED",
      location: LOCATION,
    });
    const errors = job.status?.errors;
    if (errors && errors.length) { console.error(`  ! ${table}: ${JSON.stringify(errors)}`); process.exit(1); }
    console.log(`  ✓ loaded ${dsId}.${table}`);
  }
}

console.log(`\nDone. Verify:  SELECT module, COUNT(*) FROM \`${datasets[0]}.marts_kpis\` GROUP BY module`);
