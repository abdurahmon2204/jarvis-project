import "dotenv/config";

// Windows editors love adding stray spaces / quotes / BOMs. Be tolerant.
const clean = (v) => (v ?? "").toString().replace(/^\uFEFF/, "").trim().replace(/^["']|["']$/g, "").trim();
const int = (v, d) => (clean(v) !== "" && Number.isFinite(Number(v)) ? Number(v) : d);
const list = (v) => clean(v).split(",").map((s) => s.trim()).filter(Boolean);

const isProd = process.env.NODE_ENV === "production";

let jwtSecret = clean(process.env.JWT_SECRET);
if (!jwtSecret || jwtSecret.length < 24) {
  if (isProd) {
    console.error("❌ JWT_SECRET is missing or too short (min 24 chars). Generate one with:");
    console.error("   node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"");
    process.exit(1);
  }
  jwtSecret = "dev-only-secret-change-me-dev-only-secret";
  console.warn("⚠️  JWT_SECRET not set: using an insecure development secret.");
}

if (clean(process.env.LLM_MODEL)) {
  console.warn(
    "⚠️  LLM_MODEL is ignored. Models are now auto-discovered and fall back automatically.\n" +
      "   To pin a model use GROQ_MODEL, GEMINI_MODEL or CLAUDE_MODEL."
  );
}

export const config = {
  isProd,
  port: int(process.env.PORT, 5000),
  mongoUri: clean(process.env.MONGODB_URI) || "mongodb://127.0.0.1:27017/jarvis",
  clientOrigins: list(process.env.CLIENT_ORIGIN || "http://localhost:5173"),
  jwtSecret,
  appKey: clean(process.env.APP_KEY), // optional shared key that the official clients send
  maxContextTurns: int(process.env.MAX_CONTEXT_TURNS, 10),
  historyTtlDays: int(process.env.HISTORY_TTL_DAYS, 90),
  limits: {
    ipPerMinute: int(process.env.LIMIT_IP_PER_MINUTE, 120),
    registerPerHour: int(process.env.LIMIT_REGISTER_PER_HOUR, 10),
    chatPerMinute: int(process.env.LIMIT_CHAT_PER_MINUTE, 20),
    chatPerDay: int(process.env.LIMIT_CHAT_PER_DAY, 300),
  },
  tools: {
    tavilyKey: clean(process.env.TAVILY_API_KEY), // optional: real web search (otherwise Wikipedia only)
    maxMemories: int(process.env.MAX_MEMORIES, 100),
    maxNotes: int(process.env.MAX_NOTES, 200),
    agentMaxSteps: int(process.env.AGENT_MAX_STEPS, 4),
    agentDeadlineMs: int(process.env.AGENT_DEADLINE_MS, 28000),
    toolTimeoutMs: int(process.env.TOOL_TIMEOUT_MS, 6000),
  },
  llm: {
    // Order = priority. Providers without an API key are skipped automatically.
    order: list(process.env.LLM_PROVIDERS || "groq,gemini,claude"),
    timeoutMs: int(process.env.LLM_TIMEOUT_MS, 20000),
    maxTokens: int(process.env.LLM_MAX_TOKENS, 400),
    keys: {
      groq: clean(process.env.GROQ_API_KEY),
      gemini: clean(process.env.GEMINI_API_KEY) || clean(process.env.GOOGLE_API_KEY),
      claude: clean(process.env.ANTHROPIC_API_KEY),
    },
    pinned: {
      groq: clean(process.env.GROQ_MODEL),
      gemini: clean(process.env.GEMINI_MODEL),
      claude: clean(process.env.CLAUDE_MODEL),
    },
  },
};
