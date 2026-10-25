import { config } from "../../../config/env.js";
import { getJson } from "../net.js";

const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const domain = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };

async function tavily(query) {
  const d = await getJson("https://api.tavily.com/search", {
    method: "POST",
    headers: { Authorization: `Bearer ${config.tools.tavilyKey}` },
    body: { query, max_results: 4, include_answer: true, search_depth: "basic" },
    timeoutMs: 9000,
  });
  const lines = [];
  if (d.answer) lines.push(`Summary: ${clip(String(d.answer), 400)}`);
  (d.results || []).slice(0, 4).forEach((x, i) => lines.push(`${i + 1}. ${clip(String(x.title || ""), 80)}: ${clip(String(x.content || ""), 260)} [${domain(x.url)}]`));
  return lines.length ? lines.join("\n") : null;
}

async function wikipedia(query, lang) {
  const base = `https://${lang}.wikipedia.org`;
  const s = await getJson(`${base}/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=2&utf8=1&format=json`);
  const hits = s.query?.search || [];
  if (!hits.length) return null;
  const parts = await Promise.all(
    hits.map(async (h) => {
      try {
        const d = await getJson(`${base}/api/rest_v1/page/summary/${encodeURIComponent(h.title.replace(/ /g, "_"))}`);
        return d.extract ? `${d.title || h.title}: ${clip(String(d.extract), 500)}` : null;
      } catch { return null; }
    })
  );
  const out = parts.filter(Boolean);
  return out.length ? `Wikipedia (${lang}):\n${out.join("\n")}` : null;
}

export default {
  name: "web_search",
  kind: "server",
  untrusted: true,
  webOk: true,
  usage: 'web_search {"query":"who won the 2026 world cup","language":"en"}  -> internet search for current facts, news, prices (language = 2-letter code, optional)',
  async run(args) {
    const query = typeof args.query === "string" ? args.query.trim().slice(0, 200) : "";
    if (query.length < 2) return { error: "query is required" };
    const lang = /^[a-z]{2,3}$/.test(String(args.language || "")) ? String(args.language) : "en";

    let text = null;
    if (config.tools.tavilyKey) {
      try { text = await tavily(query); } catch (e) { console.warn("[search] tavily failed:", e.message); }
    }
    if (!text) {
      try { text = await wikipedia(query, lang); } catch (e) { console.warn("[search] wikipedia failed:", e.message); }
      if (!text && lang !== "en") { try { text = await wikipedia(query, "en"); } catch { /* ignore */ } }
    }
    if (!text) return { error: `I found nothing for "${query}".${config.tools.tavilyKey ? "" : " (Only an encyclopedia is available; news needs a search key.)"}` };
    return { text: clip(text, 1500) };
  },
};
