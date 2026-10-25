import mongoose from "mongoose";

const noteSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    text: { type: String, required: true, maxlength: 500 },
  },
  { timestamps: true }
);

export default mongoose.model("Note", noteSchema);
