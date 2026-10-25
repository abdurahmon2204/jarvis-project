import Note from "../../../models/Note.js";
import { config } from "../../../config/env.js";
import { dbReady } from "../../../config/db.js";

const unavailable = { error: "notes are unavailable right now" };
const norm = (s) => String(s).toLowerCase().trim();

export const addNote = {
  name: "add_note",
  kind: "server",
  webOk: true,
  usage: 'add_note {"text":"Buy milk and bread"}  -> add an item to the user\'s notes / to-do list',
  async run(args, env) {
    const text = typeof args.text === "string" ? args.text.replace(/\s+/g, " ").trim().slice(0, 500) : "";
    if (!text) return { error: "text is required" };
    if (!dbReady()) return unavailable;
    if ((await Note.countDocuments({ userId: env.userId })) >= config.tools.maxNotes) return { error: "the notes list is full; delete some first" };
    await Note.create({ userId: env.userId, text });
    return { text: `Note added: "${text}"` };
  },
};

export const listNotes = {
  name: "list_notes",
  kind: "server",
  webOk: true,
  usage: "list_notes {}  -> read the user's notes (numbered, oldest first)",
  async run(_args, env) {
    if (!dbReady()) return unavailable;
    const notes = await Note.find({ userId: env.userId }).sort({ createdAt: 1 }).limit(30).select("text -_id").lean();
    if (!notes.length) return { text: "The notes list is empty." };
    return { text: notes.map((n, i) => `${i + 1}. ${n.text}`).join("\n") };
  },
};

export const deleteNote = {
  name: "delete_note",
  kind: "server",
  webOk: true,
  usage: 'delete_note {"index":2} or {"match":"milk"} or {"all":true}  -> remove note(s) (index is the number from list_notes)',
  async run(args, env) {
    if (!dbReady()) return unavailable;
    if (args.all === true) {
      const r = await Note.deleteMany({ userId: env.userId });
      return { text: `Deleted ${r.deletedCount} notes.` };
    }
    const notes = await Note.find({ userId: env.userId }).sort({ createdAt: 1 }).limit(30).select("_id text").lean();
    let target;
    if (Number.isInteger(args.index)) target = notes[args.index - 1];
    else if (typeof args.match === "string" && args.match.trim()) target = notes.find((n) => norm(n.text).includes(norm(args.match)));
    if (!target) return { error: "I couldn't find that note." };
    await Note.deleteOne({ _id: target._id });
    return { text: `Deleted: "${target.text}"` };
  },
};
