import mongoose from "mongoose";
import { config } from "../config/env.js";

const chatSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true, trim: true }, // = device id
    question: { type: String, required: true, maxlength: 2000 },
    answer: { type: String, required: true },
    provider: { type: String },
    model: { type: String },
  },
  { timestamps: true }
);

chatSchema.index({ userId: 1, createdAt: -1 });
// Privacy + storage hygiene: conversations expire automatically.
chatSchema.index({ createdAt: 1 }, { expireAfterSeconds: config.historyTtlDays * 86400 });

export default mongoose.model("Chat", chatSchema);
