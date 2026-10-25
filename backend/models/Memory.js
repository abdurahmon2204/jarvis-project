import mongoose from "mongoose";

// Long-term facts about the user ("lives in Tashkent", "prefers short answers").
const memorySchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    key: { type: String, required: true }, // normalized text, used to avoid duplicates
    text: { type: String, required: true, maxlength: 200 },
  },
  { timestamps: true }
);
memorySchema.index({ userId: 1, key: 1 }, { unique: true });

export default mongoose.model("Memory", memorySchema);
