import express from "express";
import { 
  checkMyInactivityStatus, 
  checkUserInactivityStatus 
} from "../controllers/inactivityController.js";
import { protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

// Check current user's inactivity status
router.get("/my-status", protect, checkMyInactivityStatus);

// Admin: Check any user's inactivity status (for testing/admin purposes)
router.get("/user/:userId", protect, checkUserInactivityStatus);

export default router;
