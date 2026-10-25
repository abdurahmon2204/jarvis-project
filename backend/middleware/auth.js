import jwt from "jsonwebtoken";
import { config } from "../config/env.js";

export const requireAppKey = (req, res, next) => {
  if (config.appKey && req.get("x-app-key") !== config.appKey) {
    return res.status(401).json({ error: "Invalid app key." });
  }
  next();
};

export const requireAuth = (req, res, next) => {
  const header = req.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return res.status(401).json({ error: "Missing token.", code: "no_token" });
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    req.deviceId = String(payload.sub);
    next();
  } catch {
    // clients react to this code by registering again and retrying once
    res.status(401).json({ error: "Invalid or expired token.", code: "bad_token" });
  }
};
