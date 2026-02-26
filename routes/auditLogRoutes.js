import express from "express";
import { recordLog, getLogs, getLogsByFilter } from "../controllers/auditLogController.js";
import { protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

// Record a log
router.post("/", protect, recordLog);

// Get all logs
router.get("/", protect, getLogs);

// Get logs by filter (vaultId or userId)
router.get("/filter", protect, getLogsByFilter);

export default router;
