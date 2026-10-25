import { Router } from "express";
import { handleChat, getHistory, clearHistory } from "../controllers/chatController.js";
import { requireAuth } from "../middleware/auth.js";
import { chatDayLimiter, chatMinuteLimiter } from "../middleware/rateLimits.js";

const router = Router();
router.use(requireAuth);

router.post("/", chatMinuteLimiter, chatDayLimiter, handleChat);
router.get("/history", getHistory);
router.delete("/history", clearHistory);

export default router;
