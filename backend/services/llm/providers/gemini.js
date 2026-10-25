import { request, stripThinking, LLMError } from "../http.js";

const BASE = "https://generativelanguage.googleapis.com/v1beta";
const SKIP = /(embed|imagen|image|tts|live|audio|robotics|computer-use|veo|aqa|learnlm|gemma|nano|deep-research|vision|exp)/i;

// `gemini-flash-latest` is an alias Google keeps pointing at the newest Flash model,
// so it survives model retirements. After it: newest stable flash, then flash-lite, then pro.
export const geminiScore = (n) => {
  if (n === "gemini-flash-latest") return 1000;
  if (n === "gemini-flash-lite-latest") return 900;
  const m = n.match(/^gemini-(\d+(?:\.\d+)?)-(flash-lite|flash|pro)(.*)$/);
  if (!m) return 0;
  const tier = { flash: 300, "flash-lite": 200, pro: 100 }[m[2]];
  const penalty = m[3] ? (/preview|exp/i.test(m[3]) ? 40 : 20) : 0;
  return tier + parseFloat(m[1]) * 10 - penalty;
};

export default {
  name: "gemini",
  fallbackModels: ["gemini-flash-latest"],

  async listModels({ key, timeoutMs }) {
    const data = await request("gemini", `${BASE}/models?pageSize=200`, {
      method: "GET",
      headers: { "x-goog-api-key": key },
      timeoutMs,
    });
    return (data.models || [])
      .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
      .map((m) => String(m.name).replace(/^models\//, ""))
      .filter((n) => /^gemini/i.test(n) && !SKIP.test(n));
  },

  rank: (ids) => ids.filter((n) => geminiScore(n) > 0).sort((a, b) => geminiScore(b) - geminiScore(a)),

  async generate({ key, model, system, messages, maxTokens, timeoutMs }) {
    const contents = messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
    const data = await request("gemini", `${BASE}/models/${encodeURIComponent(model)}:generateContent`, {
      headers: { "x-goog-api-key": key },
      body: {
        systemInstruction: { parts: [{ text: system }] },
        contents,
        // thinking models spend part of this budget on reasoning, so keep headroom
        generationConfig: { maxOutputTokens: Math.max(maxTokens, 1024), temperature: 0.7 },
      },
      timeoutMs,
    });
    const cand = data.candidates?.[0];
    const text = stripThinking((cand?.content?.parts || []).map((p) => p.text || "").join(""));
    if (!text && data.promptFeedback?.blockReason) {
      throw new LLMError(`gemini: prompt blocked (${data.promptFeedback.blockReason})`, { kind: "bad_request", provider: "gemini" });
    }
    return text;
  },
};
