import express from "express";
import { uploadEncryptedFile } from "../controllers/uploadController.js";
import { protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

// Upload encrypted file (protected route)
router.post("/", protect, uploadEncryptedFile);

export default router;
