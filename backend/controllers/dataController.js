import Chat from "../models/Chat.js";
import Memory from "../models/Memory.js";
import Note from "../models/Note.js";
import { dbReady } from "../config/db.js";

const fail = (res) => res.status(500).json({ error: "Request failed. Please try again." });
const noDb = (res) => res.status(503).json({ error: "The database is not available right now." });

export const getMemory = async (req, res) => {
  if (!dbReady()) return noDb(res);
  try {
    const facts = await Memory.find({ userId: req.deviceId }).sort({ createdAt: 1 }).select("text createdAt -_id").lean();
    res.json({ facts });
  } catch { fail(res); }
};

export const clearMemory = async (req, res) => {
  if (!dbReady()) return noDb(res);
  try {
    const { deletedCount } = await Memory.deleteMany({ userId: req.deviceId });
    res.json({ deleted: deletedCount });
  } catch { fail(res); }
};

export const getNotes = async (req, res) => {
  if (!dbReady()) return noDb(res);
  try {
    const notes = await Note.find({ userId: req.deviceId }).sort({ createdAt: 1 }).select("text createdAt -_id").lean();
    res.json({ notes });
  } catch { fail(res); }
};

/** "Delete my data": conversations, saved facts and notes of this installation. */
export const deleteMe = async (req, res) => {
  if (!dbReady()) return noDb(res);
  try {
    const [c, m, n] = await Promise.all([
      Chat.deleteMany({ userId: req.deviceId }),
      Memory.deleteMany({ userId: req.deviceId }),
      Note.deleteMany({ userId: req.deviceId }),
    ]);
    res.json({ deleted: { chats: c.deletedCount, facts: m.deletedCount, notes: n.deletedCount } });
  } catch { fail(res); }
};
