import Chat from "../models/Chat.js";
import { config } from "../config/env.js";
import { dbReady } from "../config/db.js";
import { runAgent } from "../services/agent/index.js";
import { sanitizeContext } from "../services/agent/context.js";

export const handleChat = async (req, res) => {
  const userId = req.deviceId;
  const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
  if (!message) return res.status(400).json({ error: "message is required" });
  const question = message.slice(0, 2000);

  // 1. Memory (degrades gracefully: if the DB is down, still answer, just without memory)
  let history = [];
  if (dbReady()) {
    try {
      const recent = await Chat.find({ userId })
        .sort({ createdAt: -1 })
        .limit(config.maxContextTurns)
        .select("question answer -_id")
        .lean();
      history = recent.reverse();
    } catch (e) {
      console.warn("[chat] history read failed:", e.message);
    }
  }

  // 2. Agent: LLM (auto model discovery + provider fallback) <-> tools (weather, search, memory, notes, phone actions)
  const ctx = sanitizeContext(req.body?.context);
  let result;
  try {
    result = await runAgent({ userId, message: question, history, ctx });
  } catch (e) {
    console.error("[chat] LLM failure:", e.message);
    return res.status(503).json({
      error: "The assistant is temporarily unavailable. Please try again in a moment.",
      ...(config.isProd ? {} : { detail: e.message }),
    });
  }

  // 3. Persist
  if (dbReady()) {
    Chat.create({ userId, question, answer: result.reply, provider: result.provider, model: result.model }).catch((e) =>
      console.warn("[chat] save failed:", e.message)
    );
  }

  res.json({ reply: result.reply, lang: result.lang, actions: result.actions });
};

export const getHistory = async (req, res) => {
  if (!dbReady()) return res.status(503).json({ error: "The database is not available right now." });
  try {
    const chats = await Chat.find({ userId: req.deviceId })
      .sort({ createdAt: 1 })
      .select("question answer createdAt -_id")
      .lean();
    res.json({ history: chats });
  } catch {
    res.status(500).json({ error: "Could not retrieve history." });
  }
};

export const clearHistory = async (req, res) => {
  if (!dbReady()) return res.status(503).json({ error: "The database is not available right now." });
  try {
    const { deletedCount } = await Chat.deleteMany({ userId: req.deviceId });
    res.json({ deleted: deletedCount });
  } catch {
    res.status(500).json({ error: "Could not clear history." });
  }
};
