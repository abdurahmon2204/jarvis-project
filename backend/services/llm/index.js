import { config } from "../../config/env.js";
import { LLMError } from "./http.js";
import groq from "./providers/groq.js";
import gemini from "./providers/gemini.js";
import claude from "./providers/claude.js";

const REGISTRY = { groq, gemini, claude };
const MODEL_TTL_MS = 6 * 60 * 60 * 1000;   // re-discover models every 6 h
const BAD_MODEL_MS = 6 * 60 * 60 * 1000;   // a retired/unusable model is skipped for 6 h
const AUTH_COOLDOWN_MS = 10 * 60 * 1000;

export const SYSTEM_PROMPT = `You are J.A.R.V.I.S., a highly capable, composed AI assistant with dry British wit.
Address the user respectfully (e.g., "sir" or "ma'am" sparingly).
Your replies are spoken aloud, so:
- Keep answers short: 1 to 3 sentences unless detail is explicitly requested.
- Never use markdown, bullet points, emojis, or code blocks.
- Write numbers and symbols the way they should be spoken.
- Reply in the same language the user speaks.`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const state = {}; // per provider runtime state

const providers = () =>
  config.llm.order
    .filter((n) => REGISTRY[n] && config.llm.keys[n])
    .map((n) => REGISTRY[n]);

const st = (name) =>
  (state[name] ||= { models: [], fetchedAt: 0, bad: new Map(), disabledUntil: 0, lastError: null, active: null });

const isBad = (s, m) => (s.bad.get(m) || 0) > Date.now();

async function candidatesFor(p) {
  const s = st(p.name);
  const key = config.llm.keys[p.name];
  const out = [];
  const pinned = config.llm.pinned[p.name];
  if (pinned && !isBad(s, pinned)) out.push(pinned);

  if (!s.models.length || Date.now() - s.fetchedAt > MODEL_TTL_MS) {
    try {
      const ids = await p.listModels({ key, timeoutMs: config.llm.timeoutMs });
      s.models = p.rank(ids);
      s.fetchedAt = Date.now();
    } catch (e) {
      if (e.kind === "auth") throw e;
      console.warn(`[llm] ${p.name}: could not list models (${e.message}); using built-in fallbacks`);
    }
  }
  for (const m of s.models) if (!out.includes(m) && !isBad(s, m)) out.push(m);
  if (!out.length) for (const m of p.fallbackModels) if (!isBad(s, m)) out.push(m);
  return out.slice(0, 3);
}

/**
 * Tries providers in priority order; for each, tries up to 3 discovered models.
 * - auth error      -> provider benched for 10 min, move on
 * - model error     -> that model is benched for 6 h, try the next model
 * - rate limit      -> short wait if tiny, else bench provider briefly and move on
 * - transient error -> one quick retry, then next model
 */
export async function generate({ system, messages, maxTokens }) {
  const errors = [];
  const list = providers();
  if (!list.length) {
    throw new Error("No LLM provider configured. Set GROQ_API_KEY, GEMINI_API_KEY or ANTHROPIC_API_KEY in backend/.env");
  }

  for (const p of list) {
    const s = st(p.name);
    if (Date.now() < s.disabledUntil) {
      errors.push(`${p.name}: benched (${s.lastError})`);
      continue;
    }
    let models;
    try {
      models = await candidatesFor(p);
    } catch (e) {
      s.lastError = e.message;
      if (e.kind === "auth") s.disabledUntil = Date.now() + AUTH_COOLDOWN_MS;
      errors.push(e.message);
      continue;
    }

    providerLoop: for (const model of models) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const text = await p.generate({
            key: config.llm.keys[p.name],
            model,
            system,
            messages,
            maxTokens: maxTokens || config.llm.maxTokens,
            timeoutMs: config.llm.timeoutMs,
          });
          if (!text) throw new LLMError(`${p.name}/${model}: empty response`, { kind: "empty", provider: p.name });
          s.active = model;
          s.lastError = null;
          return { text, provider: p.name, model };
        } catch (e) {
          const err = e instanceof LLMError ? e : new LLMError(`${p.name}: ${e.message}`, { kind: "transient", provider: p.name });
          s.lastError = err.message;
          errors.push(`${p.name}/${model}: ${err.message}`);
          console.warn(`[llm] ${p.name}/${model} failed (${err.kind}): ${err.message}`);

          if (err.kind === "auth") {
            s.disabledUntil = Date.now() + AUTH_COOLDOWN_MS;
            break providerLoop;
          }
          if (err.kind === "model" || err.kind === "bad_request") {
            s.bad.set(model, Date.now() + BAD_MODEL_MS);
            if (s.active === model) s.active = null;
            break; // next model
          }
          if (err.kind === "rate_limit") {
            if (err.retryAfterMs && err.retryAfterMs <= 2000 && attempt === 0) {
              await sleep(err.retryAfterMs);
              continue;
            }
            s.disabledUntil = Date.now() + Math.min(err.retryAfterMs || 30_000, 60_000);
            break providerLoop;
          }
          // transient / empty
          if (attempt === 0) await sleep(400);
        }
      }
    }
  }
  throw new Error(`All LLM providers failed: ${errors.slice(-6).join(" | ")}`);
}

/** Turns stored {question, answer} pairs + a new message into a flat chat transcript. */
export const toMessages = (history, message) => [
  ...history.flatMap((h) => [
    { role: "user", content: h.question },
    { role: "assistant", content: h.answer },
  ]),
  ...(message ? [{ role: "user", content: message }] : []),
];

/** Simple one-shot helper (used by `npm run doctor` and tests). */
export const generateReply = (history, message) =>
  generate({ system: SYSTEM_PROMPT, messages: toMessages(history, message) });

/** Pre-discover models at startup so problems are visible in the logs immediately. */
export async function warmup() {
  const list = providers();
  if (!list.length) {
    console.warn("⚠️  No LLM API key found. Set GROQ_API_KEY and/or GEMINI_API_KEY (and restart).");
    return;
  }
  for (const p of list) {
    try {
      const c = await candidatesFor(p);
      console.log(`🧠 ${p.name}: will use ${c[0]}${c.length > 1 ? ` (fallbacks: ${c.slice(1).join(", ")})` : ""}`);
    } catch (e) {
      console.warn(`⚠️  ${p.name}: ${e.message}`);
    }
  }
}

export const getLLMStatus = () =>
  config.llm.order
    .filter((n) => REGISTRY[n])
    .map((n) => {
      const s = st(n);
      const enabled = Boolean(config.llm.keys[n]);
      return {
        provider: n,
        enabled,
        model: s.active || s.models[0] || config.llm.pinned[n] || null,
        state: !enabled ? "no-key" : Date.now() < s.disabledUntil ? "benched" : "ok",
      };
    });

export const __internals = { REGISTRY, state, candidatesFor, providers };
