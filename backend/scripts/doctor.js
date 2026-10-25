// Run:  npm run doctor      (diagnoses keys, model availability and the database)
import { config } from "../config/env.js";
import mongoose from "mongoose";
import { __internals, generateReply } from "../services/llm/index.js";
import weather from "../services/agent/tools/weather.js";
import { runAgent } from "../services/agent/index.js";
import { sanitizeContext } from "../services/agent/context.js";

const mask = (k) => (k ? `${k.slice(0, 4)}…(${k.length} chars)` : "— not set —");
const ok = (s) => console.log(`  ✅ ${s}`);
const bad = (s) => console.log(`  ❌ ${s}`);
let failed = false;

console.log("\n=== J.A.R.V.I.S. doctor ===\n");
console.log("Environment");
for (const [name, key] of Object.entries(config.llm.keys)) console.log(`  ${name.padEnd(7)} key: ${mask(key)}`);

console.log("\nLLM providers");
const providers = __internals.providers();
if (!providers.length) {
  bad("No API key found. Create backend/.env (copy .env.example) and set GROQ_API_KEY and/or GEMINI_API_KEY.");
  failed = true;
}
for (const p of providers) {
  console.log(`\n[${p.name}]`);
  try {
    const cands = await __internals.candidatesFor(p);
    ok(`models discovered, will try: ${cands.join(", ")}`);
    // Test each provider on its own
    const only = { ...config.llm, order: [p.name] };
    const saved = config.llm.order;
    config.llm.order = only.order;
    const t0 = Date.now();
    try {
      const r = await generateReply([], "Reply with exactly one word: OK");
      ok(`test call succeeded with ${r.model} in ${Date.now() - t0} ms → "${r.text.slice(0, 40)}"`);
    } catch (e) {
      bad(e.message);
      failed = true;
    } finally {
      config.llm.order = saved;
    }
  } catch (e) {
    bad(`${e.message}`);
    if (e.kind === "auth") console.log("     → The API key was rejected. Re-create it and check for extra spaces/quotes in .env.");
    failed = true;
  }
}

console.log("\nTools");
try {
  const w = await weather.run({ city: "London", days: 1 });
  w.error ? (bad(`weather: ${w.error}`), (failed = true)) : ok(`weather service works → ${w.text.slice(0, 70)}…`);
} catch (e) {
  bad(`weather service: ${e.message}`);
  failed = true;
}
config.tools.tavilyKey
  ? ok("web search: Tavily key found")
  : console.log("  ℹ️  web search: Wikipedia only. Set TAVILY_API_KEY (free tier at tavily.com) for news and general web search.");

console.log("\nAssistant brain (tool use)");
if (providers.length) {
  try {
    const r = await runAgent({
      userId: "doctor",
      message: "Set a timer for five minutes called tea.",
      history: [],
      ctx: sanitizeContext({ platform: "android", tzOffsetMin: 0 }),
    });
    const usedTool = r.actions.some((a) => a.type === "schedule" && a.kind === "timer");
    if (usedTool) ok(`${r.provider}/${r.model} follows the tool protocol → "${r.reply.slice(0, 60)}"`);
    else {
      bad(`${r.provider}/${r.model} answered without using the timer tool: "${r.reply.slice(0, 60)}"`);
      console.log("     → Phone commands may be unreliable with this model. Add a second provider key or pin a stronger model (GROQ_MODEL / GEMINI_MODEL).");
      failed = true;
    }
  } catch (e) {
    bad(`agent test failed: ${e.message}`);
    failed = true;
  }
}

console.log("\nDatabase");
try {
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 5000 });
  ok(`MongoDB reachable (${mongoose.connection.host})`);
  await mongoose.disconnect();
} catch (e) {
  bad(`MongoDB: ${e.message}`);
  failed = true;
}

console.log(failed ? "\nSome checks failed. Fix the ❌ items above and run again.\n" : "\nAll good. Start the server with: npm run dev\n");
process.exit(failed ? 1 : 0);
