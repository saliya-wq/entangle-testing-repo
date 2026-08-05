/* ============================================================
   /api/insights — server-side AI insights via Claude.
   The ANTHROPIC_API_KEY never leaves the server. The browser POSTs
   the module's KPIs + targets + trend; Claude returns 3–4 concise,
   grounded insights. The frontend falls back to the deterministic
   rules engine (src/lib/insights.ts) on any error.
   Runs as a Vercel Node serverless function.
   ============================================================ */
import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-opus-4-8";

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    insights: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          kind: { type: "string", enum: ["up", "down", "info"] },
          text: { type: "string" },
        },
        required: ["kind", "text"],
      },
    },
  },
  required: ["insights"],
} as const;

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method not allowed" });
    return;
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(503).json({ error: "ANTHROPIC_API_KEY not configured" });
    return;
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const { moduleLabel = "this dashboard", rangeLabel = "the selected period", currency = "AUD", kpis = [], targets = [], trend = null } = body;

    const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env

    const system =
      "You are a senior performance-marketing analyst at Entangle, a data-driven agency. " +
      "You write crisp, specific dashboard insights for clients. Ground every insight in the numbers provided — " +
      "cite the actual metric and figure. Prefer explaining WHY something moved or WHAT to do next over restating the number. " +
      "Be direct and jargon-light. Never invent data not present in the input.";

    const user =
      `Module: ${moduleLabel}\nDate range: ${rangeLabel}\nCurrency: ${currency}\n\n` +
      `KPI cards (l=label, v=value, d=% change, dir=up/down, good=which direction is good, rate=is a ratio):\n` +
      JSON.stringify(kpis) +
      `\n\nClient KPI targets:\n` + JSON.stringify(targets) +
      (trend ? `\n\nHeadline trend "${trend.name}": first=${trend.first}, last=${trend.last} across the window.` : "") +
      `\n\nWrite 3–4 insights. Each: kind = "up" (good news), "down" (a concern), or "info" (neutral/context). ` +
      `Keep each under ~160 characters.`;

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 700,
      system,
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
      messages: [{ role: "user", content: user }],
    } as any);

    if (response.stop_reason === "refusal") {
      res.status(422).json({ error: "refused" });
      return;
    }
    const textBlock = response.content.find((b: any) => b.type === "text") as any;
    const parsed = JSON.parse(textBlock?.text ?? '{"insights":[]}');
    res.status(200).json({ insights: (parsed.insights || []).slice(0, 4), model: MODEL });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "insights failed" });
  }
}
