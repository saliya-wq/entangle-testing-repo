/* ============================================================
   generate-dummy-social.mjs — organic social dummy data for
   Facebook Page, Instagram and LinkedIn.

   All three share a shape: a daily entity snapshot, a daily stats row,
   one row per post/media, and audience demographics. Metrics differ per
   platform and follow each API's CURRENT vocabulary (Meta pruned Page
   Insights in 2024; Instagram replaced impressions with views).

   Organic behaves unlike paid: no spend, follower growth compounds,
   engagement is driven by post cadence, and a handful of posts carry
   most of the reach. That's modelled here.

   Platforms whose schema directory is absent are skipped, so this can
   run before every schema has landed.

   Usage: npm run gen:dummy:social
   ============================================================ */
import { mkdir, writeFile, readFile, access } from "node:fs/promises";
import path from "node:path";

const OUT = path.join(process.cwd(), "local-bq", "dummy");
const SCHEMAS = path.join(process.cwd(), "local-bq", "schemas");
const END = new Date("2026-08-06T00:00:00Z");
const DAYS = 90;

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const iso = (d) => d.toISOString().slice(0, 10);
const ts = (d) => d.toISOString().replace("T", " ").replace("Z", " UTC");
const addDays = (d, n) => new Date(d.getTime() + n * 86400000);
const datasetOf = (slug) => "client_" + slug.replace(/-/g, "_");
const r2 = (x) => Math.round(x * 100) / 100;
const exists = async (p) => { try { await access(p); return true; } catch { return false; } };

const CLIENTS = [
  { slug: "aqua-pulse-spas", name: "Aqua Pulse Spas", f: 1.0, fans: 46000, ig: 27000, li: 3200, site: "aquapulsespas.com.au", industry: "Retail" },
  { slug: "care-for-you-at-home", name: "Care For You at Home", f: 0.42, fans: 12000, ig: 6400, li: 1800, site: "careforyouathome.com.au", industry: "Hospitals and Health Care" },
  { slug: "ms-plus", name: "MS Plus", f: 1.8, fans: 78000, ig: 41000, li: 9400, site: "msplus.com.au", industry: "Non-profit Organizations" },
];

const DOW = [1.06, 1.08, 1.05, 1.04, 0.98, 0.85, 0.82];
const POST_TOPICS = [
  ["Before / after — deck install", "photo"], ["Customer story: the Nolans", "photo"],
  ["Winter maintenance tips", "link"], ["New arrivals — rattan range", "photo"],
  ["Behind the scenes at the showroom", "video"], ["5 questions to ask before buying", "link"],
  ["Team spotlight", "photo"], ["Install timelapse", "video"],
];
const AGES = [["18-24", 0.08], ["25-34", 0.23], ["35-44", 0.28], ["45-54", 0.22], ["55-64", 0.13], ["65+", 0.06]];
const GENDERS = [["F", 0.62], ["M", 0.36], ["U", 0.02]];
const CITIES = [["Brisbane", 0.3], ["Sydney", 0.28], ["Melbourne", 0.22], ["Perth", 0.1], ["Adelaide", 0.1]];
const LI_FACETS = {
  seniority: [["Entry", 0.20], ["Senior", 0.26], ["Manager", 0.22], ["Director", 0.16], ["VP", 0.09], ["CXO", 0.07]],
  industry: [["Construction", 0.32], ["Hospitals and Health Care", 0.22], ["Real Estate", 0.18], ["Retail", 0.15], ["Professional Services", 0.13]],
  function: [["Operations", 0.24], ["Sales", 0.22], ["Business Development", 0.18], ["Marketing", 0.2], ["Engineering", 0.16]],
  staffCountRange: [["1-10", 0.18], ["11-50", 0.27], ["51-200", 0.24], ["201-500", 0.16], ["501-1000", 0.09], ["1001+", 0.06]],
  region: [["Queensland", 0.3], ["New South Wales", 0.29], ["Victoria", 0.23], ["Western Australia", 0.1], ["South Australia", 0.08]],
};

/* load a platform's schemas; returns null if that platform isn't designed yet */
async function loadSchemas(dir, tables) {
  const base = path.join(SCHEMAS, dir);
  if (!(await exists(base))) return null;
  const out = {};
  for (const t of tables) {
    const p = path.join(base, `${t}.json`);
    if (!(await exists(p))) return null;
    out[t] = new Set(JSON.parse(await readFile(p, "utf8")).map((c) => c.name));
  }
  return out;
}
const picker = (schemas) => (table, obj) => {
  const allowed = schemas[table]; const out = {};
  for (const [k, v] of Object.entries(obj)) if (allowed.has(k) && v !== undefined) out[k] = v;
  return out;
};

let totalRows = 0;
const written = {};
const emit = async (ds, table, rows) => {
  const dir = path.join(OUT, ds);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, `${table}.ndjson`), rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
  totalRows += rows.length;
  (written[ds] ||= []).push(`${table}:${rows.length}`);
};

/* ================= Facebook Page ================= */
const fbSchemas = await loadSchemas("facebook_page", ["fbpage_Page", "fbpage_DailyStats", "fbpage_Post", "fbpage_Demographics"]);
if (fbSchemas) {
  const pick = picker(fbSchemas);
  for (const c of CLIENTS) {
    const rand = rng(c.fans);
    const ds = datasetOf(c.slug), latest = iso(END);
    const pageId = `1000${String(c.fans).slice(0, 6)}`;
    const R = { fbpage_Page: [], fbpage_DailyStats: [], fbpage_Post: [], fbpage_Demographics: [] };
    let fans = Math.round(c.fans * 0.94); // grows across the window

    for (let i = DAYS - 1; i >= 0; i--) {
      const date = addDays(END, -i), d = iso(date);
      const season = DOW[(date.getUTCDay() + 6) % 7];
      const adds = Math.round((28 + rand() * 55) * c.f * season);
      const removes = Math.round((6 + rand() * 14) * c.f);
      fans += adds - removes;
      const impressions = Math.round((5200 + rand() * 4200) * c.f * season);
      const reach = Math.round(impressions * (0.58 + rand() * 0.12));
      const eng = Math.round(impressions * (0.035 + rand() * 0.025));
      const reactions = Math.round(eng * 0.62);

      R.fbpage_Page.push(pick("fbpage_Page", {
        page_id: pageId, page_name: c.name, page_username: c.slug.replace(/-/g, ""),
        page_category: "Local business", page_link: `https://facebook.com/${c.slug}`,
        page_website: `https://${c.site}`, page_is_published: true,
        page_fan_count: fans, page_followers_count: Math.round(fans * 1.04),
        page_new_like_count: adds, page_talking_about_count: Math.round(eng * 1.6),
        page_location_city: "Brisbane", page_location_country: "Australia", page_location_state: "QLD",
        page_verification_status: "blue_verified", page_overall_star_rating: 4.7, page_rating_count: 128,
        page_category_list: ["Local business"], page_emails: [`hello@${c.site}`],
        _DATA_DATE: d, _LATEST_DATE: latest,
      }));
      R.fbpage_DailyStats.push(pick("fbpage_DailyStats", {
        page_id: pageId, page_name: c.name, segments_date: d, segments_period: "day",
        metrics_impressions: impressions, metrics_views_total: Math.round(impressions * 0.22),
        metrics_post_engagements: eng, metrics_total_actions: Math.round(eng * 0.28),
        metrics_fans: fans, metrics_fan_adds: adds, metrics_fan_adds_unique: Math.round(adds * 0.97),
        metrics_fan_removes: removes, metrics_follows: adds, metrics_daily_follows: adds,
        metrics_daily_follows_unique: Math.round(adds * 0.97), metrics_daily_unfollows_unique: removes,
        metrics_lifetime_engaged_followers_unique: Math.round(reach * 0.3),
        metrics_post_reactions_total: reactions,
        metrics_post_reactions_like_total: Math.round(reactions * 0.68),
        metrics_post_reactions_love_total: Math.round(reactions * 0.2),
        metrics_post_reactions_haha_total: Math.round(reactions * 0.06),
        metrics_post_reactions_wow_total: Math.round(reactions * 0.04),
        metrics_post_reactions_sorry_total: Math.round(reactions * 0.01),
        metrics_post_reactions_anger_total: Math.round(reactions * 0.01),
        metrics_video_views: Math.round(impressions * 0.18),
        metrics_video_views_organic: Math.round(impressions * 0.16),
        metrics_video_view_time: Math.round(impressions * 0.18 * 9),
        metrics_total_media_view_unique: reach,
        _DATA_DATE: d, _LATEST_DATE: latest,
      }));

      /* posts ~3x a week; a few outperform heavily (the organic reality) */
      if (i % 2 === 0 && rand() < 0.75) {
        const [topic, type] = POST_TOPICS[Math.floor(rand() * POST_TOPICS.length)];
        const viral = rand() < 0.12 ? 3.2 : 1;
        const pImpr = Math.round((2400 + rand() * 2600) * c.f * viral);
        const pReact = Math.round(pImpr * (0.03 + rand() * 0.03));
        R.fbpage_Post.push(pick("fbpage_Post", {
          page_id: pageId, post_id: `${pageId}_${Date.parse(d) / 1000}`,
          post_created_time: ts(addDays(date, 0)), post_date: d, post_message: topic,
          post_permalink_url: `https://facebook.com/${c.slug}/posts/${Date.parse(d) / 1000}`,
          post_status_type: type === "video" ? "added_video" : type === "link" ? "shared_story" : "added_photos",
          post_attachment_media_type: type, post_is_published: true, post_is_hidden: false,
          post_from_id: pageId, post_from_name: c.name, post_message_tags: [],
          metrics_impressions: pImpr, metrics_impressions_organic: Math.round(pImpr * 0.86),
          metrics_impressions_fan: Math.round(pImpr * 0.54), metrics_impressions_viral: Math.round(pImpr * 0.14),
          metrics_clicks: Math.round(pImpr * 0.028), metrics_clicks_by_type_link_clicks: Math.round(pImpr * 0.012),
          metrics_reactions_like_total: Math.round(pReact * 0.68), metrics_reactions_love_total: Math.round(pReact * 0.2),
          metrics_reactions_haha_total: Math.round(pReact * 0.06), metrics_reactions_wow_total: Math.round(pReact * 0.04),
          metrics_likes_count: pReact, metrics_comments_count: Math.round(pReact * 0.16),
          metrics_shares_count: Math.round(pReact * 0.09),
          metrics_activity_by_action_type_like: pReact,
          metrics_activity_by_action_type_comment: Math.round(pReact * 0.16),
          metrics_activity_by_action_type_share: Math.round(pReact * 0.09),
          ...(type === "video" ? {
            metrics_video_views: Math.round(pImpr * 0.42), metrics_video_views_organic: Math.round(pImpr * 0.4),
            metrics_video_avg_time_watched: 11000 + Math.round(rand() * 9000), metrics_video_length: 45000,
          } : {}),
          _DATA_DATE: d, _LATEST_DATE: latest,
        }));
      }

      /* demographics snapshot weekly (they move slowly) */
      if (i % 7 === 0) {
        const push = (type, value, v) => R.fbpage_Demographics.push(pick("fbpage_Demographics", {
          page_id: pageId, page_name: c.name, segments_date: d, segments_period: "lifetime",
          segments_metric_name: "page_fans_" + (type === "city" ? "city" : "gender_age"),
          segments_segment_type: type, segments_segment_value: value, metrics_value: v,
          _DATA_DATE: d, _LATEST_DATE: latest,
        }));
        for (const [age, aw] of AGES) for (const [g, gw] of GENDERS) push("age_gender", `${g}.${age}`, Math.round(fans * aw * gw));
        for (const [city, w] of CITIES) push("city", city, Math.round(fans * w));
      }
    }
    for (const [t, rows] of Object.entries(R)) await emit(ds, t, rows);
  }
}

/* ================= LinkedIn ================= */
const liSchemas = await loadSchemas("linkedin", ["li_Organization", "li_DailyStats", "li_FollowerStats", "li_Post"]);
if (liSchemas) {
  const pick = picker(liSchemas);
  for (const c of CLIENTS) {
    const rand = rng(c.li * 7);
    const ds = datasetOf(c.slug), latest = iso(END);
    const orgId = String(3000000 + c.li);
    const urn = `urn:li:organization:${orgId}`;
    const R = { li_Organization: [], li_DailyStats: [], li_FollowerStats: [], li_Post: [] };
    let followers = Math.round(c.li * 0.93);

    for (let i = DAYS - 1; i >= 0; i--) {
      const date = addDays(END, -i), d = iso(date);
      const dow = date.getUTCDay();
      const season = dow === 0 || dow === 6 ? 0.35 : DOW[(dow + 6) % 7]; // LinkedIn is a weekday network
      const organicGain = Math.round((4 + rand() * 11) * c.f * season);
      followers += organicGain;
      const impressions = Math.round((1400 + rand() * 1500) * c.f * season);
      const uniq = Math.round(impressions * (0.72 + rand() * 0.1));
      const clicks = Math.round(impressions * (0.012 + rand() * 0.014));
      const likes = Math.round(impressions * (0.014 + rand() * 0.012));
      const comments = Math.round(likes * 0.12), shares = Math.round(likes * 0.08);
      const engagements = clicks + likes + comments + shares;

      R.li_Organization.push(pick("li_Organization", {
        organization_id: orgId, organization_urn: urn, organization_name: c.name,
        li_vanity_name: c.slug, li_localized_website: `https://${c.site}`,
        li_primary_industry_name: c.industry, li_industry_names: [c.industry],
        li_staff_count_range: "SIZE_11_TO_50", li_staff_count_range_min: 11, li_staff_count_range_max: 50,
        li_page_url: `https://www.linkedin.com/company/${c.slug}`,
        li_organization_status: "OPERATING", li_organization_type: "PRIVATELY_HELD",
        li_hq_city: "Brisbane", li_hq_country: "AU", li_hq_geographic_area: "Queensland",
        li_localized_description: `${c.name} — official LinkedIn page.`,
        li_default_locale_country: "AU", li_default_locale_language: "en",
        li_alternative_names: [], li_localized_specialties: [], li_industry_urns: [],
        li_founded_on_year: 2014, li_is_school: false, li_auto_created: false,
        metrics_follower_count: followers,
        _DATA_DATE: d, _LATEST_DATE: latest,
      }));
      R.li_DailyStats.push(pick("li_DailyStats", {
        organization_id: orgId, organization_urn: urn, organization_name: c.name,
        segments_date: d, segments_time_granularity: "DAY",
        metrics_impression_count: impressions, metrics_unique_impressions_count: uniq,
        metrics_click_count: clicks, metrics_like_count: likes,
        metrics_comment_count: comments, metrics_share_count: shares,
        metrics_engagement: engagements, metrics_total_engagements: engagements,
        metrics_engagement_rate: impressions ? r2(engagements / impressions) : 0,
        metrics_click_through_rate: impressions ? r2(clicks / impressions) : 0,
        metrics_follower_count: followers, metrics_organic_follower_gain: organicGain,
        metrics_paid_follower_gain: 0, metrics_total_follower_gain: organicGain,
        metrics_all_page_views: Math.round(impressions * 0.09),
        metrics_all_unique_page_views: Math.round(impressions * 0.07),
        metrics_overview_page_views: Math.round(impressions * 0.05),
        metrics_careers_page_views: Math.round(impressions * 0.02),
        metrics_jobs_page_views: Math.round(impressions * 0.01),
        metrics_all_desktop_page_views: Math.round(impressions * 0.05),
        metrics_all_mobile_page_views: Math.round(impressions * 0.04),
        _DATA_DATE: d, _LATEST_DATE: latest,
      }));

      /* LinkedIn posts ~2x a week */
      if (i % 3 === 0 && rand() < 0.7 && season > 0.5) {
        const [topic] = POST_TOPICS[Math.floor(rand() * POST_TOPICS.length)];
        const pImpr = Math.round((900 + rand() * 1500) * c.f);
        const pLikes = Math.round(pImpr * (0.02 + rand() * 0.02));
        const pClicks = Math.round(pImpr * (0.014 + rand() * 0.016));
        const pComments = Math.round(pLikes * 0.14), pShares = Math.round(pLikes * 0.1);
        const pEng = pLikes + pClicks + pComments + pShares;
        const pid = `${orgId}-${Date.parse(d)}`;
        R.li_Post.push(pick("li_Post", {
          organization_id: orgId, organization_urn: urn, organization_name: c.name,
          post_id: pid, post_urn: `urn:li:share:${Date.parse(d)}`, post_urn_type: "share",
          post_created: ts(date), post_published: ts(date), post_date: d,
          post_text: topic, post_text_length: topic.length,
          post_permalink: `https://www.linkedin.com/feed/update/urn:li:share:${Date.parse(d)}`,
          post_media_type: rand() < 0.4 ? "IMAGE" : "NONE", post_media_count: rand() < 0.4 ? 1 : 0,
          post_visibility: "PUBLIC", post_lifecycle_state: "PUBLISHED",
          post_author_urn: urn, post_is_reshare: false, post_is_edited_by_author: false,
          post_comments_state: "OPEN", post_feed_distribution: "MAIN_FEED",
          post_hashtags: ["#" + c.industry.split(" ")[0].toLowerCase()],
          post_media_urns: [], post_mentioned_organization_urns: [], post_poll_options: [],
          post_third_party_distribution_channels: [],
          metrics_impression_count: pImpr, metrics_unique_impressions_count: Math.round(pImpr * 0.78),
          metrics_click_count: pClicks, metrics_like_count: pLikes,
          metrics_comment_count: pComments, metrics_share_count: pShares,
          metrics_engagement: pEng, metrics_total_engagements: pEng,
          metrics_engagement_rate: pImpr ? r2(pEng / pImpr) : 0,
          metrics_click_through_rate: pImpr ? r2(pClicks / pImpr) : 0,
          metrics_reactions_total: pLikes, metrics_reactions_like: Math.round(pLikes * 0.72),
          metrics_reactions_praise: Math.round(pLikes * 0.14), metrics_reactions_empathy: Math.round(pLikes * 0.08),
          metrics_reactions_interest: Math.round(pLikes * 0.06),
          _DATA_DATE: d, _LATEST_DATE: latest,
        }));
      }

      /* follower breakdowns weekly — LinkedIn's signature analytic */
      if (i % 7 === 0) {
        for (const [facet, buckets] of Object.entries(LI_FACETS)) {
          buckets.forEach(([value, w], idx) => {
            const org = Math.round(followers * w);
            R.li_FollowerStats.push(pick("li_FollowerStats", {
              organization_id: orgId, organization_urn: urn, organization_name: c.name,
              segments_type: facet, segments_facet_field: facet, segments_value: value,
              segments_value_name: value, segments_value_urn: `urn:li:${facet}:${idx + 1}`,
              metrics_organic_follower_count: org, metrics_paid_follower_count: 0,
              metrics_total_follower_count: org, metrics_follower_share: r2(w),
              metrics_segment_rank: idx + 1,
              _DATA_DATE: d, _LATEST_DATE: latest,
            }));
          });
        }
      }
    }
    for (const [t, rows] of Object.entries(R)) await emit(ds, t, rows);
  }
}

/* ================= Instagram ================= */
const igTables = ["ig_Account", "ig_DailyStats", "ig_Media", "ig_Demographics"];
const igSchemas = await loadSchemas("instagram", igTables);
if (igSchemas) {
  const pick = picker(igSchemas);
  const cols = (t) => igSchemas[t];
  for (const c of CLIENTS) {
    const rand = rng(c.ig * 3);
    const ds = datasetOf(c.slug), latest = iso(END);
    const igId = `1784${String(c.ig).padStart(8, "0")}`;
    const R = { ig_Account: [], ig_DailyStats: [], ig_Media: [], ig_Demographics: [] };
    let followers = Math.round(c.ig * 0.95);

    for (let i = DAYS - 1; i >= 0; i--) {
      const date = addDays(END, -i), d = iso(date);
      const season = DOW[(date.getUTCDay() + 6) % 7];
      const gain = Math.round((22 + rand() * 42) * c.f * season);
      followers += gain;
      const reach = Math.round((3400 + rand() * 3000) * c.f * season);
      const views = Math.round(reach * (1.7 + rand() * 0.8)); // IG replaced impressions with views
      const interactions = Math.round(reach * (0.05 + rand() * 0.035));
      const likes = Math.round(interactions * 0.78), comments = Math.round(interactions * 0.08);
      const saves = Math.round(interactions * 0.09), shares = Math.round(interactions * 0.05);

      R.ig_Account.push(pick("ig_Account", {
        ig_user_id: igId, ig_legacy_user_id: igId,
        ig_username: c.slug.replace(/-/g, ""), ig_name: c.name,
        ig_biography: `${c.name} — official Instagram.`, ig_website: `https://${c.site}`,
        ig_account_type: "BUSINESS", ig_profile_picture_url: `https://cdn.example/${c.slug}.jpg`,
        metrics_followers_count: followers, metrics_follows_count: 480,
        metrics_media_count: 320 + (DAYS - i),
        _DATA_DATE: d, _LATEST_DATE: latest,
      }));
      R.ig_DailyStats.push(pick("ig_DailyStats", {
        ig_user_id: igId, ig_username: c.slug.replace(/-/g, ""), segments_date: d,
        metrics_reach: reach, metrics_views: views,
        metrics_reach_follower: Math.round(reach * 0.62), metrics_reach_non_follower: Math.round(reach * 0.38),
        metrics_views_post: Math.round(views * 0.45), metrics_views_reel: Math.round(views * 0.38),
        metrics_views_story: Math.round(views * 0.17),
        metrics_accounts_engaged: Math.round(reach * 0.045),
        metrics_total_interactions: interactions, metrics_likes: likes, metrics_comments: comments,
        metrics_saves: saves, metrics_shares: shares, metrics_replies: Math.round(interactions * 0.02),
        metrics_reposts: Math.round(interactions * 0.01),
        metrics_followers_count: followers, metrics_follows: gain + Math.round(gain * 0.3),
        metrics_unfollows: Math.round(gain * 0.3), metrics_net_follower_change: gain,
        metrics_follows_and_unfollows: gain + Math.round(gain * 0.6),
        metrics_profile_links_taps: Math.round(reach * 0.01),
        metrics_profile_links_taps_call: Math.round(reach * 0.002),
        metrics_profile_links_taps_email: Math.round(reach * 0.001),
        _DATA_DATE: d, _LATEST_DATE: latest,
      }));

      if (i % 2 === 0 && rand() < 0.8) {
        const [topic, type] = POST_TOPICS[Math.floor(rand() * POST_TOPICS.length)];
        const isReel = type === "video" || rand() < 0.35;
        const viral = rand() < 0.12 ? 3.5 : 1;
        const mReach = Math.round((1800 + rand() * 2000) * c.f * viral);
        const mInter = Math.round(mReach * (0.05 + rand() * 0.04));
        const mid = `1789${Date.parse(d)}`;
        R.ig_Media.push(pick("ig_Media", {
          ig_user_id: igId, ig_username: c.slug.replace(/-/g, ""),
          post_id: mid, post_shortcode: mid.slice(-11), post_owner_id: igId,
          post_media_type: isReel ? "VIDEO" : type === "photo" ? "IMAGE" : "CAROUSEL_ALBUM",
          post_media_product_type: isReel ? "REELS" : "FEED",
          post_caption: topic, post_permalink: `https://instagram.com/p/${mid}`,
          post_timestamp: ts(date), post_date: d,
          post_is_shared_to_feed: true, post_is_comment_enabled: true, post_is_ai_generated: false,
          post_children_ids: [], post_collaborator_usernames: [],
          metrics_reach: mReach, metrics_views: Math.round(mReach * (isReel ? 2.6 : 1.4)),
          metrics_total_views: Math.round(mReach * (isReel ? 2.6 : 1.4)),
          metrics_likes: Math.round(mInter * 0.78), metrics_total_likes: Math.round(mInter * 0.78),
          metrics_comments: Math.round(mInter * 0.08), metrics_total_comments: Math.round(mInter * 0.08),
          metrics_saved: Math.round(mInter * 0.09),
          metrics_shares: Math.round(mInter * 0.05), metrics_total_interactions: mInter,
          metrics_profile_visits: Math.round(mReach * 0.02), metrics_follows: Math.round(mReach * 0.004),
          ...(isReel ? {
            metrics_ig_reels_video_view_total_time: Math.round(mReach * 2.6 * 7200),
            metrics_ig_reels_avg_watch_time: 6800 + Math.round(rand() * 5200),
            metrics_reels_skip_rate: r2(0.2 + rand() * 0.25),
          } : {}),
          _DATA_DATE: d, _LATEST_DATE: latest,
        }));
      }

      if (i % 7 === 0) {
        const push = (type, value, v) => R.ig_Demographics.push(pick("ig_Demographics", {
          ig_user_id: igId, ig_username: c.slug.replace(/-/g, ""),
          segments_metric_name: "follower_demographics", segments_timeframe: "this_month",
          segments_segment_type: type, segments_segment_value: value, metrics_value: v,
          _DATA_DATE: d, _LATEST_DATE: latest,
        }));
        for (const [age, w] of AGES) push("age", age, Math.round(followers * w));
        for (const [g, w] of GENDERS) push("gender", g, Math.round(followers * w));
        for (const [city, w] of CITIES) push("city", city, Math.round(followers * w));
      }
    }
    for (const [t, rows] of Object.entries(R)) await emit(ds, t, rows);
  }
}

for (const [ds, list] of Object.entries(written)) console.log(`${ds}: ${list.join(", ")}`);
const done = [fbSchemas && "facebook_page", igSchemas && "instagram", liSchemas && "linkedin"].filter(Boolean);
const skipped = ["facebook_page", "instagram", "linkedin"].filter((p) => !done.includes(p));
console.log(`\n✓ ${totalRows} organic-social rows → local-bq/dummy/  [${done.join(", ")}]`);
if (skipped.length) console.log(`  skipped (schema not present yet): ${skipped.join(", ")}`);
