import { request, stripThinking } from "../http.js";

const BASE = "https://api.groq.com/openai/v1";
const NOT_CHAT = /whisper|tts|orpheus|guard|safeguard|embed|compound|distil|transcri/i;

const score = (id) => {
  if (id === "llama-3.3-70b-versatile") return 1000;
  if (id === "llama-3.1-8b-instant") return 900;
  const llama = id.match(/llama-?(\d+(?:\.\d+)?)/i);
  if (llama) return 500 + parseFloat(llama[1]) * 10;
  if (/qwen/i.test(id)) return 300;
  if (/gpt-oss/i.test(id)) return 200; // reasoning models: slower, kept as a later fallback
  return 100;
};

export default {
  name: "groq",
  fallbackModels: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"],

  async listModels({ key, timeoutMs }) {
    const data = await request("groq", `${BASE}/models`, {
      method: "GET",
      headers: { Authorization: `Bearer ${key}` },
      timeoutMs,
    });
    return (data.data || []).map((m) => m.id).filter((id) => id && !NOT_CHAT.test(id));
  },

  rank: (ids) => [...ids].sort((a, b) => score(b) - score(a)),

  async generate({ key, model, system, messages: turns, maxTokens, timeoutMs }) {
    const messages = [{ role: "system", content: system }, ...turns];
    const reasoning = /gpt-oss|qwen3|deepseek-r1/i.test(model);
    const body = { model, messages, temperature: 0.7 };
    if (reasoning) {
      body.max_completion_tokens = Math.max(maxTokens, 1024);
      if (/gpt-oss/i.test(model)) body.reasoning_effort = "low";
    } else {
      body.max_tokens = maxTokens;
    }
    const data = await request("groq", `${BASE}/chat/completions`, {
      headers: { Authorization: `Bearer ${key}` },
      body,
      timeoutMs,
    });
    return stripThinking(data.choices?.[0]?.message?.content);
  },
};
