import { Router } from "express";
import { register } from "../controllers/authController.js";
import { requireAppKey } from "../middleware/auth.js";
import { registerLimiter } from "../middleware/rateLimits.js";

const router = Router();
router.post("/register", registerLimiter, requireAppKey, register);
export default router;
