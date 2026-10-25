import test from "node:test";
import assert from "node:assert/strict";

process.env.GROQ_API_KEY = "gsk_test";
process.env.GEMINI_API_KEY = "AIza_test";
process.env.LLM_PROVIDERS = "groq,gemini";
process.env.LLM_MODEL = "gemma2-9b-it"; // the old retired value must be ignored

const { generateReply, __internals } = await import("../services/llm/index.js");
const { geminiScore } = await import("../services/llm/providers/gemini.js");
const { classify } = await import("../services/llm/http.js");

const json = (status, body, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

const reset = () => {
  for (const k of Object.keys(__internals.state)) delete __internals.state[k];
};

test("classify() maps provider errors to the right kinds", () => {
  assert.equal(classify(400, "The model `gemma2-9b-it` has been decommissioned"), "model");
  assert.equal(classify(404, "models/x is not found"), "model");
  assert.equal(classify(400, "API key not valid. Please pass a valid API key."), "auth");
  assert.equal(classify(401, "bad"), "auth");
  assert.equal(classify(429, "quota exceeded"), "rate_limit");
  assert.equal(classify(429, "Quota exceeded, limit: 0"), "model");
  assert.equal(classify(503, "overloaded"), "transient");
});

test("gemini ranking prefers the -latest alias, then newest stable flash", () => {
  const ranked = ["gemini-2.0-flash", "gemini-2.5-flash", "gemini-2.5-pro", "gemini-3-flash-preview", "gemini-flash-latest", "gemini-2.5-flash-lite"]
    .sort((a, b) => geminiScore(b) - geminiScore(a));
  assert.equal(ranked[0], "gemini-flash-latest");
  assert.equal(ranked[1], "gemini-2.5-flash");
  assert.ok(ranked.indexOf("gemini-2.5-pro") > ranked.indexOf("gemini-2.5-flash-lite"));
});

test("retired Groq model -> auto-discovers and uses a live one (the bug from the logs)", async () => {
  reset();
  const calls = [];
  globalThis.fetch = async (url, init) => {
    url = String(url);
    calls.push(url);
    if (url.endsWith("/openai/v1/models")) {
      return json(200, { data: [{ id: "llama-3.1-8b-instant" }, { id: "whisper-large-v3" }, { id: "llama-3.3-70b-versatile" }] });
    }
    const body = JSON.parse(init.body);
    if (body.model === "llama-3.3-70b-versatile") return json(400, { error: { message: "The model `llama-3.3-70b-versatile` has been decommissioned" } });
    return json(200, { choices: [{ message: { content: `hello from ${body.model}` } }] });
  };
  const r = await generateReply([], "hi");
  assert.equal(r.provider, "groq");
  assert.equal(r.model, "llama-3.1-8b-instant"); // 70b was "decommissioned" -> next candidate
  assert.match(r.text, /hello from llama-3.1-8b-instant/);
});

test("Groq key rejected -> falls back to Gemini", async () => {
  reset();
  globalThis.fetch = async (url, init) => {
    url = String(url);
    if (url.includes("groq.com")) return json(401, { error: { message: "Invalid API Key" } });
    if (url.endsWith("/v1beta/models?pageSize=200")) {
      return json(200, { models: [{ name: "models/gemini-2.5-flash", supportedGenerationMethods: ["generateContent"] }, { name: "models/text-embedding-004", supportedGenerationMethods: ["embedContent"] }] });
    }
    assert.ok(url.includes("gemini-2.5-flash:generateContent"));
    return json(200, { candidates: [{ content: { parts: [{ text: "Gemini here." }] } }] });
  };
  const r = await generateReply([{ question: "a", answer: "b" }], "hi");
  assert.equal(r.provider, "gemini");
  assert.equal(r.text, "Gemini here.");
});

test("all providers down -> readable aggregate error", async () => {
  reset();
  globalThis.fetch = async () => json(401, { error: { message: "nope" } });
  await assert.rejects(() => generateReply([], "hi"), /All LLM providers failed/);
});
