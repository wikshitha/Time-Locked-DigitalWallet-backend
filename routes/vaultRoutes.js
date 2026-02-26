import express from "express";
import { createVault, getMyVaults, deleteVault, getVaultById, addParticipant, removeParticipant, getSealedVaultKey } from "../controllers/vaultController.js";
import { protect } from "../middlewares/authMiddleware.js"; 

const router = express.Router();

router.post("/", protect, createVault);
router.get("/", protect, getMyVaults);
router.get("/:id", protect, getVaultById);
router.get("/:id/sealed-key", protect, getSealedVaultKey);
router.post("/participant", protect, addParticipant);
router.delete("/:id/participant/:participantId", protect, removeParticipant);
router.delete("/:id", protect, deleteVault);

export default router;
