/* ============================================================
   generate-dummy-calls.mjs — call-tracking dummy data (WildJar/CallRail
   shape), written to local-bq/schemas/call_tracking's tables.

   ONE ROW PER CALL — the grain that makes this module feel real: caller,
   duration, recording, transcript, disposition, and the attribution chain
   back to the SAME Google/Meta campaigns that live in the other tables.

   Modelled honestly:
   - a tracking-number pool, so calls join to their number's configured source
   - business-hours weighting (calls cluster 9am-5pm weekdays)
   - dispositions: answered / missed / voicemail / abandoned
   - qualification, sentiment, tags, transcripts on recorded calls
   - MUTABILITY: recent calls are less likely to be qualified/tagged/
     transcribed yet — mirroring the real API, where those fields are filled
     in AFTER the call. Loads must MERGE on call_id over a trailing window,
     never blind-append (and calls_Call must NEVER be filtered with
     _DATA_DATE = _LATEST_DATE — that would drop all history).

   Usage: npm run gen:dummy:calls
   ============================================================ */
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";

const OUT = path.join(process.cwd(), "local-bq", "dummy");
const SCHEMA_DIR = path.join(process.cwd(), "local-bq", "schemas", "call_tracking");
const END = new Date("2026-08-06T00:00:00Z");
const DAYS = 90;
const CALLS_PER_DAY = 14; // base; scaled per client

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CLIENTS = [
  { slug: "aqua-pulse-spas", name: "Aqua Pulse Spas", acct: "wj_100001", f: 1.0, dest: "+61738001234", value: 900 },
  { slug: "care-for-you-at-home", name: "Care For You at Home", acct: "wj_100002", f: 0.42, dest: "+61390021234", value: 350 },
  { slug: "ms-plus", name: "MS Plus", acct: "wj_100003", f: 1.8, dest: "+61280031234", value: 1400 },
];

/* Tracking-number pool — each number is configured to a source/campaign,
   which is exactly how call attribution works in the real product. */
const NUMBERS = [
  { phone: "+61731000001", name: "Google Ads — Search", src: "google", med: "cpc", camp: "Search — Non-brand", pool: true, w: 0.30 },
  { phone: "+61731000002", name: "Google Ads — PMax", src: "google", med: "cpc", camp: "Performance Max", pool: true, w: 0.14 },
  { phone: "+61731000003", name: "Meta — Summer Lookbook", src: "facebook", med: "paid_social", camp: "Summer Lookbook", pool: true, w: 0.12 },
  { phone: "+61731000004", name: "Organic Search", src: "google", med: "organic", camp: null, pool: true, w: 0.22 },
  { phone: "+61731000005", name: "Google Business Profile", src: "google", med: "organic", camp: "GBP", pool: false, w: 0.14 },
  { phone: "+61731000006", name: "Website — Direct", src: "(direct)", med: "(none)", camp: null, pool: false, w: 0.08 },
];
const STATUSES = [
  { s: "answered", w: 0.72 }, { s: "missed", w: 0.14 }, { s: "voicemail", w: 0.09 }, { s: "abandoned", w: 0.05 },
];
const TAG_POOL = ["hot lead", "quote requested", "existing customer", "service enquiry", "spam", "wrong number", "booking"];
const KEYWORDS = ["swim spa", "price", "installation", "warranty", "delivery", "finance", "showroom"];
const HOURS = [ // hour-of-day weighting (business hours dominate)
  0.005,0.003,0.002,0.002,0.003,0.008,0.02,0.04,0.07,0.11,0.12,0.11,
  0.09,0.09,0.10,0.09,0.06,0.03,0.02,0.012,0.008,0.006,0.005,0.004,
];
const DOW = [1.12, 1.15, 1.10, 1.08, 0.95, 0.35, 0.18]; // calls collapse at weekends

const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => new Date(d.getTime() + n * 86400000);
const datasetOf = (slug) => "client_" + slug.replace(/-/g, "_");
const r2 = (x) => Math.round(x * 100) / 100;
const pickW = (list, r, key = "w") => { let a = 0; const t = list.reduce((s, x) => s + x[key], 0); const p = r * t;
  for (const x of list) { a += x[key]; if (p <= a) return x; } return list[list.length - 1]; };
const pickHour = (r) => { let a = 0; for (let h = 0; h < 24; h++) { a += HOURS[h]; if (r <= a) return h; } return 12; };

const schemas = {};
for (const t of ["calls_Call", "calls_TrackingNumber", "calls_DailyStats"]) {
  schemas[t] = new Set(JSON.parse(await readFile(path.join(SCHEMA_DIR, `${t}.json`), "utf8")).map((c) => c.name));
}
const pick = (table, obj) => {
  const allowed = schemas[table]; const out = {};
  for (const [k, v] of Object.entries(obj)) if (allowed.has(k) && v !== undefined) out[k] = v;
  return out;
};

let totalRows = 0;
for (const client of CLIENTS) {
  const rand = rng(parseInt(client.acct.slice(-5), 10));
  const ds = datasetOf(client.slug);
  const dir = path.join(OUT, ds);
  await mkdir(dir, { recursive: true });
  const latest = iso(END);
  const rows = { calls_Call: [], calls_TrackingNumber: [], calls_DailyStats: [] };
  const ident = { account_id: client.acct, account_name: client.name, platform: "wildjar" };
  let seq = 0;

  for (let dayIdx = DAYS - 1; dayIdx >= 0; dayIdx--) {
    const date = addDays(END, -dayIdx);
    const d = iso(date);
    const dow = date.getUTCDay();
    const season = DOW[(dow + 6) % 7];
    const growth = 1 + 0.18 * ((DAYS - 1 - dayIdx) / (DAYS - 1));
    /* how "settled" post-call enrichment is — recent calls are less complete */
    const settled = Math.min(1, dayIdx / 7);

    /* daily snapshot of the number pool */
    for (const num of NUMBERS) {
      rows.calls_TrackingNumber.push(pick("calls_TrackingNumber", {
        ...ident, number_id: `num_${num.phone.slice(-4)}`, number_phone: num.phone,
        number_phone_formatted: num.phone.replace("+61", "0"), number_name: num.name,
        number_type: num.pool ? "pool" : "static", number_is_pool: num.pool,
        number_pool_name: num.pool ? "Web DNI pool" : null, number_pool_size: num.pool ? 4 : null,
        number_status: "active", number_is_active: true, number_country: "AU", number_area: "Brisbane",
        number_destination_number: client.dest, number_destination_name: "Main line",
        number_source: num.src, number_medium: num.med, number_campaign: num.camp,
        number_swap_targets: num.pool ? [num.phone] : [],
        _DATA_DATE: d, _LATEST_DATE: latest,
      }));
    }

    const nCalls = Math.round(CALLS_PER_DAY * client.f * season * growth * (0.8 + rand() * 0.4));
    const byKey = {}; // for the daily rollup

    for (let i = 0; i < nCalls; i++) {
      const num = pickW(NUMBERS, rand());
      const st = pickW(STATUSES, rand());
      const answered = st.s === "answered";
      const hour = pickHour(rand());
      const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), hour, Math.floor(rand() * 60), Math.floor(rand() * 60)));
      const ring = 3 + Math.floor(rand() * 22);
      const talk = answered ? 30 + Math.floor(rand() * 540) : 0;
      const dur = ring + talk + (st.s === "voicemail" ? 20 + Math.floor(rand() * 40) : 0);
      const end = new Date(start.getTime() + dur * 1000);
      const paid = num.med === "cpc" || num.med === "paid_social";
      const firstTime = rand() < 0.68;
      /* enrichment lands after the call → recent calls are less complete */
      const enriched = rand() < settled;
      const qualified = answered && talk > 90 && enriched && rand() < 0.55;
      const hasRec = answered && talk > 20;
      const hasTx = hasRec && enriched;
      const callId = `${client.acct}_c${String(++seq).padStart(6, "0")}`;
      const ts = (x) => x.toISOString().replace("T", " ").replace("Z", " UTC");

      rows.calls_Call.push(pick("calls_Call", {
        ...ident, call_uid: callId, call_id: callId, call_source_id: `wj-${seq}`,
        call_date: d, call_start_time: ts(start), call_end_time: ts(end),
        call_start_time_local: ts(start), call_timezone: "Australia/Brisbane",
        call_hour_of_day: hour, call_day_of_week: ["SUN","MON","TUE","WED","THU","FRI","SAT"][dow],
        call_is_business_hours: hour >= 8 && hour < 18 && dow >= 1 && dow <= 5,
        call_created_time: ts(start), call_direction: "inbound",
        call_duration_seconds: dur, call_talk_time_seconds: talk, call_ring_time_seconds: ring,
        call_recording_duration_seconds: hasRec ? talk : 0,
        call_has_recording: hasRec, call_has_transcript: hasTx,
        call_is_first_time_caller: firstTime, call_prior_calls: firstTime ? 0 : 1 + Math.floor(rand() * 4),
        call_tracking_number: num.phone,
        call_caller_number: `+614${String(10000000 + Math.floor(rand() * 89999999))}`,
        call_caller_name: rand() < 0.35 ? "Mobile Caller" : null,
        call_caller_city: ["Brisbane", "Gold Coast", "Sydney", "Melbourne", "Perth"][Math.floor(rand() * 5)],
        call_caller_state: ["QLD", "QLD", "NSW", "VIC", "WA"][Math.floor(rand() * 5)],
        call_caller_country: "AU",
        call_destination_number: client.dest, call_destination_name: "Main line",
        call_agent_name: answered ? ["Sam", "Priya", "Jordan", "Alex"][Math.floor(rand() * 4)] : null,
        call_recording_url: hasRec ? `https://recordings.wildjar.com/${callId}.mp3` : null,

        attribution_source: num.src, attribution_medium: num.med, attribution_campaign: num.camp,
        attribution_keyword: paid ? KEYWORDS[Math.floor(rand() * KEYWORDS.length)] : null,
        attribution_utm_source: paid ? num.src : null, attribution_utm_medium: paid ? num.med : null,
        attribution_utm_campaign: paid ? num.camp : null,
        attribution_gclid: num.src === "google" && num.med === "cpc" ? `Cj0KCQ${Math.floor(rand() * 1e10).toString(36)}` : null,
        attribution_fbclid: num.med === "paid_social" ? `IwAR${Math.floor(rand() * 1e10).toString(36)}` : null,
        attribution_landing_page_url: `https://${client.slug}.com.au/${paid ? "swim-spas" : ""}`,
        attribution_referrer_domain: num.med === "organic" ? "google.com" : null,
        attribution_visitor_id: `v-${Math.floor(rand() * 9e7)}`,
        attribution_session_id: `s-${Math.floor(rand() * 9e7)}`,
        attribution_device: ["mobile", "desktop", "tablet"][rand() < 0.66 ? 0 : rand() < 0.9 ? 1 : 2],
        attribution_is_pool_number: num.pool,
        attribution_first_touch_source: num.src, attribution_first_touch_medium: num.med,
        attribution_last_touch_source: num.src, attribution_last_touch_medium: num.med,
        attribution_last_touch_campaign: num.camp,

        outcome_status: st.s, outcome_status_raw: st.s.toUpperCase(),
        outcome_is_answered: answered, outcome_is_missed: st.s === "missed",
        outcome_is_abandoned: st.s === "abandoned", outcome_is_voicemail: st.s === "voicemail",
        outcome_lead_status: qualified ? "qualified" : answered ? (enriched ? "unqualified" : "unreviewed") : "unreviewed",
        outcome_is_qualified_lead: qualified,
        outcome_score: enriched && answered ? r2(1 + rand() * 4) : null,
        outcome_score_label: qualified ? "Hot lead" : answered && enriched ? "Nurture" : null,
        outcome_value: qualified ? r2(client.value * (0.7 + rand() * 0.6)) : null,
        outcome_value_currency: qualified ? "AUD" : null,
        outcome_tags: enriched ? [TAG_POOL[Math.floor(rand() * TAG_POOL.length)]] : [],
        outcome_sentiment: hasTx ? (rand() < 0.6 ? "positive" : rand() < 0.85 ? "neutral" : "negative") : null,
        outcome_summary: hasTx ? "Caller enquired about pricing and availability." : null,
        outcome_transcript_text: hasTx ? "Hi, I'm calling about the swim spa range — could you tell me about pricing and delivery?" : null,
        outcome_transcript_confidence: hasTx ? r2(0.82 + rand() * 0.15) : null,
        outcome_keywords_spotted: hasTx ? [KEYWORDS[Math.floor(rand() * KEYWORDS.length)]] : [],
        outcome_highlights: [], outcome_modified_fields: [],
        outcome_speaker_percent_agent: hasTx ? r2(40 + rand() * 25) : null,
        outcome_speaker_percent_customer: hasTx ? r2(35 + rand() * 25) : null,

        _ingested_at: ts(addDays(end, 0)), _ingestion_source: "wildjar_api",
        _DATA_DATE: d, _LATEST_DATE: latest,
      }));

      /* accumulate the daily rollup */
      const k = `${num.src}|${num.med}|${num.camp || ""}|${num.phone}`;
      const b = (byKey[k] ||= { src: num.src, med: num.med, camp: num.camp, phone: num.phone,
        total: 0, answered: 0, missed: 0, voicemail: 0, abandoned: 0, first: 0, repeat: 0,
        qualified: 0, unqualified: 0, bh: 0, ah: 0, rec: 0, tx: 0, pos: 0, dur: 0, talk: 0, value: 0 });
      b.total++; b[st.s === "answered" ? "answered" : st.s]++;
      b[firstTime ? "first" : "repeat"]++;
      if (qualified) { b.qualified++; b.value += client.value; } else if (answered && enriched) b.unqualified++;
      b[(hour >= 8 && hour < 18 && dow >= 1 && dow <= 5) ? "bh" : "ah"]++;
      if (hasRec) b.rec++; if (hasTx) b.tx++;
      b.dur += dur; b.talk += talk;
    }

    for (const b of Object.values(byKey)) {
      rows.calls_DailyStats.push(pick("calls_DailyStats", {
        ...ident, segments_date: d, segments_source: b.src, segments_medium: b.med,
        segments_campaign: b.camp, segments_tracking_number: b.phone, segments_direction: "inbound",
        metrics_total_calls: b.total, metrics_answered_calls: b.answered, metrics_missed_calls: b.missed,
        metrics_abandoned_calls: b.abandoned, metrics_voicemail_calls: b.voicemail,
        metrics_first_time_callers: b.first, metrics_repeat_callers: b.repeat,
        metrics_unique_callers: b.total, metrics_qualified_leads: b.qualified,
        metrics_unqualified_calls: b.unqualified, metrics_business_hours_calls: b.bh,
        metrics_after_hours_calls: b.ah, metrics_recorded_calls: b.rec, metrics_transcribed_calls: b.tx,
        metrics_total_duration_seconds: b.dur, metrics_total_talk_time_seconds: b.talk,
        metrics_average_duration_seconds: r2(b.dur / b.total),
        metrics_average_talk_time_seconds: r2(b.talk / b.total),
        metrics_answer_rate: r2(b.answered / b.total), metrics_missed_rate: r2(b.missed / b.total),
        metrics_qualified_rate: r2(b.qualified / b.total),
        metrics_total_value: r2(b.value), metrics_value_currency: "AUD",
        _DATA_DATE: d, _LATEST_DATE: latest,
      }));
    }
  }

  for (const [table, list] of Object.entries(rows)) {
    await writeFile(path.join(dir, `${table}.ndjson`), list.map((r) => JSON.stringify(r)).join("\n") + "\n");
    totalRows += list.length;
    console.log(`${ds}.${table}: ${list.length} rows`);
  }
}
console.log(`\n✓ ${totalRows} call-tracking rows → local-bq/dummy/ (window ${iso(addDays(END, -(DAYS - 1)))} → ${iso(END)})`);
