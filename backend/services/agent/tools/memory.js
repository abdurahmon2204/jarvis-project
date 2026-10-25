import Memory from "../../../models/Memory.js";
import { config } from "../../../config/env.js";
import { dbReady } from "../../../config/db.js";

const SECRET_RE = /(?:\d[ -]?){13,19}|pass(?:word|code)|парол|parol|\bcvv\b|\bpin\b|api[ _-]?key|secret|token/i;
export const isSecret = (t) => SECRET_RE.test(t);
export const normKey = (t) => String(t).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** Facts injected into every prompt (most recent last). Never throws. */
export async function listMemories(userId, limit = 40) {
  if (!dbReady()) return [];
  try {
    const docs = await Memory.find({ userId }).sort({ createdAt: -1 }).limit(limit).select("text -_id").lean();
    return docs.reverse().map((d) => d.text);
  } catch {
    return [];
  }
}

export const remember = {
  name: "remember",
  kind: "server",
  webOk: true,
  usage: 'remember {"fact":"Lives in Tashkent"}  -> save a durable fact/preference the user shared (short, third person; never secrets)',
  async run(args, env) {
    const fact = typeof args.fact === "string" ? args.fact.replace(/\s+/g, " ").trim() : "";
    if (fact.length < 3 || fact.length > 200) return { error: "fact must be 3-200 characters" };
    if (isSecret(fact)) return { error: "I won't store passwords, card numbers or other secrets." };
    if (!dbReady()) return { error: "memory is unavailable right now" };
    const key = normKey(fact);
    if ((await Memory.countDocuments({ userId: env.userId })) >= config.tools.maxMemories) {
      const oldest = await Memory.findOne({ userId: env.userId }).sort({ createdAt: 1 }).select("_id").lean();
      if (oldest) await Memory.deleteOne({ _id: oldest._id });
    }
    const res = await Memory.updateOne({ userId: env.userId, key }, { $setOnInsert: { userId: env.userId, key, text: fact } }, { upsert: true });
    return { text: res.upsertedCount ? `Saved: "${fact}"` : "I already knew that." };
  },
};

export const forget = {
  name: "forget",
  kind: "server",
  webOk: true,
  usage: 'forget {"query":"Tashkent"} or forget {"all":true}  -> delete saved facts that match, or everything',
  async run(args, env) {
    if (!dbReady()) return { error: "memory is unavailable right now" };
    if (args.all === true) {
      const r = await Memory.deleteMany({ userId: env.userId });
      return { text: `Deleted ${r.deletedCount} saved facts.` };
    }
    const q = normKey(args.query ?? "");
    if (q.length < 2) return { error: "say what to forget, or use all:true" };
    const docs = await Memory.find({ userId: env.userId }).select("_id key text").lean();
    const hit = docs.filter((d) => d.key.includes(q)).slice(0, 20);
    if (!hit.length) return { error: "I have nothing saved that matches that." };
    await Memory.deleteMany({ _id: { $in: hit.map((h) => h._id) } });
    return { text: `Forgot ${hit.length} item(s): ${hit.map((h) => h.text).join("; ")}` };
  },
};
