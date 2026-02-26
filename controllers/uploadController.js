// /controllers/uploadController.js
import cloudinary from "cloudinary";
import Item from "../models/Item.js";
import Vault from "../models/Vault.js";
import { v4 as uuidv4 } from "uuid";
import AuditLog from "../models/AuditLog.js";

// Cloudinary config
cloudinary.v2.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Upload encrypted file blob to Cloudinary and record it in DB
 */
export const uploadEncryptedFile = async (req, res) => {
  try {
    const { vaultId, metadata, encryptedData, encKey } = req.body;

    // Validate inputs
    if (!vaultId || !encryptedData || !encKey) {
      return res.status(400).json({ message: "Vault ID, encrypted data, and encKey required" });
    }

    // Verify vault existence
    const vault = await Vault.findById(vaultId);
    if (!vault) return res.status(404).json({ message: "Vault not found" });

    // Ensure data is in correct format for Cloudinary
    const uploadBase64 = encryptedData.startsWith("data:")
      ? encryptedData
      : `data:application/octet-stream;base64,${encryptedData}`;

    // Upload encrypted blob to Cloudinary
    const uploadResponse = await cloudinary.v2.uploader.upload(uploadBase64, {
      folder: "timelock_vaults",
      resource_type: "auto",
      public_id: `enc_${uuidv4()}`,
    });

    // Create Item entry in DB
    const item = await Item.create({
      vaultId,
      fileUrl: uploadResponse.secure_url,
      encKey,
      metadata: metadata || {},
    });

    // Push item ID to Vault.items
    vault.items.push(item._id);
    await vault.save();

    // Audit log
    await AuditLog.create({
      user: req.user._id,
      action: "Uploaded File",
      details: { 
        vaultId: vault._id, 
        vaultName: vault.title,
        itemId: item._id, 
        fileName: metadata?.name 
      },
    });

    return res.status(201).json({
      message: "Encrypted file uploaded successfully",
      item,
      vault, // optional: return updated vault with items
    });
  } catch (err) {
    console.error("Upload error:", err);
    return res.status(500).json({ message: "Error uploading encrypted file", error: err.message });
  }
};
