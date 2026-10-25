import mongoose from "mongoose";
import { config } from "./env.js";

mongoose.set("bufferCommands", false); // fail fast instead of hanging when the database is down

export const connectDB = async () => {
  try {
    await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 6000 });
    console.log("✅ MongoDB connected");
    return true;
  } catch (err) {
    console.error("❌ MongoDB connection failed:", err.message);
    console.error("   Check MONGODB_URI (for the cloud use a MongoDB Atlas connection string).");
    if (config.isProd) process.exit(1);
    console.warn("⚠️  Development mode: continuing WITHOUT a database. Chat works, but conversation history,");
    console.warn("   saved facts and notes are disabled until MongoDB is reachable (restart the server then).");
    return false;
  }
};

export const dbReady = () => mongoose.connection.readyState === 1;
