import { config } from "./config/env.js"; // must be first: loads and validates .env
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import mongoose from "mongoose";
import { connectDB, dbReady } from "./config/db.js";
import { ipLimiter } from "./middleware/rateLimits.js";
import authRoutes from "./routes/authRoutes.js";
import chatRoutes from "./routes/chatRoutes.js";
import dataRoutes from "./routes/dataRoutes.js";
import { getLLMStatus, warmup } from "./services/llm/index.js";

const app = express();
app.set("trust proxy", 1); // behind Render/Railway/Fly/nginx: use the real client IP for rate limits

// "upgrade-insecure-requests" would break the app when opened over plain http on a LAN address.
app.use(helmet({ contentSecurityPolicy: { useDefaults: true, directives: { "upgrade-insecure-requests": null } } }));
// Native mobile requests carry no Origin header and are not subject to CORS.
app.use(cors({ origin: config.clientOrigins.includes("*") ? true : config.clientOrigins }));
app.use(express.json({ limit: "10kb" }));
app.use(ipLimiter);

app.get("/api/health", (_req, res) => {
  const llm = getLLMStatus();
  const llmOk = llm.some((p) => p.state === "ok");
  res.status(dbReady() && llmOk ? 200 : 503).json({
    status: dbReady() && llmOk ? "online" : "degraded",
    db: dbReady(),
    llm,
  });
});

app.use("/api", authRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api", dataRoutes);

// The built web client (web/dist) is served from the same address as the API when it exists.
const webDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../web/dist");
const hasWeb = fs.existsSync(path.join(webDist, "index.html"));
if (hasWeb) {
  app.use(express.static(webDist));
  app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(webDist, "index.html")));
}

app.use((_req, res) => res.status(404).json({ error: "Not found" }));
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error("Unhandled error:", err);
  res.status(err.status || 500).json({ error: "Internal server error" });
});

await connectDB();
const server = app.listen(config.port, "0.0.0.0", () => {
  console.log(`🚀 J.A.R.V.I.S. backend listening on 0.0.0.0:${config.port} (${config.isProd ? "production" : "development"})`);
  if (hasWeb) console.log(`🌐 Web app: http://localhost:${config.port}`);
  warmup(); // non-blocking: logs which model each provider will use
});

const shutdown = (sig) => {
  console.log(`${sig} received, shutting down...`);
  server.close(async () => {
    await mongoose.connection.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
