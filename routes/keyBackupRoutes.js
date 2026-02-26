import express from "express";
import { protect } from "../middlewares/authMiddleware.js";
import { uploadEncryptedVaultKey, getEncryptedVaultKey } from "../controllers/keyBackupController.js";

const router = express.Router();

router.post("/upload", protect, uploadEncryptedVaultKey);
router.get("/:vaultId", protect, getEncryptedVaultKey);

export default router;
