import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { getMemory, clearMemory, getNotes, deleteMe } from "../controllers/dataController.js";

const router = Router();
router.get("/memory", requireAuth, getMemory);
router.delete("/memory", requireAuth, clearMemory);
router.get("/notes", requireAuth, getNotes);
router.delete("/me", requireAuth, deleteMe);
export default router;
