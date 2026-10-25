import rateLimit from "express-rate-limit";
import { config } from "../config/env.js";

const base = { standardHeaders: true, legacyHeaders: false };
const tooMany = (error) => (_req, res) => res.status(429).json({ error });

export const ipLimiter = rateLimit({
  ...base,
  windowMs: 60_000,
  limit: config.limits.ipPerMinute,
  handler: tooMany("Too many requests. Please slow down."),
});

export const registerLimiter = rateLimit({
  ...base,
  windowMs: 60 * 60_000,
  limit: config.limits.registerPerHour,
  handler: tooMany("Too many registrations from this network. Try again later."),
});

// Per-device limits protect your LLM quota/bill (keyed by the authenticated device id).
export const chatMinuteLimiter = rateLimit({
  ...base,
  windowMs: 60_000,
  limit: config.limits.chatPerMinute,
  keyGenerator: (req) => `m:${req.deviceId}`,
  handler: tooMany("You are talking too fast. Give me a moment, sir."),
});

export const chatDayLimiter = rateLimit({
  ...base,
  windowMs: 24 * 60 * 60_000,
  limit: config.limits.chatPerDay,
  keyGenerator: (req) => `d:${req.deviceId}`,
  handler: tooMany("Daily message limit reached. Please try again tomorrow."),
});
