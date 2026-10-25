import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { config } from "../config/env.js";

// Anonymous device registration: no accounts, just a signed per-install identity.
export const register = (_req, res) => {
  const deviceId = crypto.randomUUID();
  const token = jwt.sign({ sub: deviceId }, config.jwtSecret, { expiresIn: "365d" });
  res.status(201).json({ deviceId, token });
};
