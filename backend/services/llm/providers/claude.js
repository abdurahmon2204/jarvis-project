import { request } from "../http.js";

const BASE = "https://api.anthropic.com/v1";
const headers = (key) => ({ "x-api-key": key, "anthropic-version": "2023-06-01" });
const tier = (id) => (/sonnet/i.test(id) ? 3 : /haiku/i.test(id) ? 2 : /opus/i.test(id) ? 1 : 0);

export default {
  name: "claude",
  fallbackModels: ["claude-sonnet-5-5"],

  async listModels({ key, timeoutMs }) {
    const data = await request("claude", `${BASE}/models?limit=100`, { method: "GET", headers: headers(key), timeoutMs });
    return (data.data || []).map((m) => m.id).filter(Boolean);
  },

  // the API lists newest first; keep that order within a tier
  rank: (ids) => ids.map((id, i) => ({ id, i })).sort((a, b) => tier(b.id) - tier(a.id) || a.i - b.i).map((x) => x.id),

  async generate({ key, model, system, messages, maxTokens, timeoutMs }) {
    const data = await request("claude", `${BASE}/messages`, {
      headers: headers(key),
      body: { model, max_tokens: maxTokens, system, messages },
      timeoutMs,
    });
    return (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("").trim();
  },
};
