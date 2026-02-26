// backend/controllers/vaultController.js
import Vault from "../models/Vault.js";
import RuleSet from "../models/RuleSet.js";
import AuditLog from "../models/AuditLog.js";
import User from "../models/User.js"; // Required for participant lookup

// ---------------- CREATE VAULT ----------------
export const createVault = async (req, res) => {
  try {
    const { title, description, ruleSet, sealedKeys } = req.body;

    if (!title || !description || !ruleSet)
      return res.status(400).json({ message: "Title, description, and ruleSet required" });

    // Create and save RuleSet
    const newRuleSet = new RuleSet({ ...ruleSet });
    await newRuleSet.save();

    // Create vault
    const vault = new Vault({
      ownerId: req.user._id,
      title,
      description,
      ruleSetId: newRuleSet._id,
      sealedKeys: sealedKeys || [],
    });
    await vault.save();

    // Log audit
    await AuditLog.create({
      user: req.user._id,
      action: "Created Vault",
      details: { vaultId: vault._id, vaultName: vault.title },
    });

    return res.status(201).json({ message: "Vault created", vault });
  } catch (err) {
    console.error("Error creating vault:", err);
    return res.status(500).json({ message: "Error creating vault", error: err.message });
  }
};

// ---------------- GET USER VAULTS ----------------
export const getMyVaults = async (req, res) => {
  try {
    const userId = req.user._id;

    // Fetch vaults owned by user
    const ownedVaults = await Vault.find({ ownerId: userId })
      .populate("ruleSetId")
      .populate("participants.participantId", "firstName lastName email role")
      .populate({
        path: "items",
        select: "metadata fileUrl encKey createdAt",
      });

    // Fetch vaults where user is a participant
    const participatedVaults = await Vault.find({ "participants.participantId": userId })
      .populate("ownerId", "firstName lastName email role")
      .populate("ruleSetId")
      .populate("participants.participantId", "firstName lastName email role")
      .populate({
        path: "items",
        select: "metadata fileUrl encKey createdAt",
      });

    return res.status(200).json({
      ownedVaults,
      participatedVaults,
    });
  } catch (err) {
    console.error("Error fetching vaults:", err);
    return res.status(500).json({ message: "Failed to fetch vaults" });
  }
};

// ---------------- ADD PARTICIPANT ----------------
export const addParticipant = async (req, res) => {
  try {
    const { vaultId, email, role } = req.body;

    if (!vaultId || !email || !role)
      return res.status(400).json({ message: "vaultId, email, and role required" });

    const vault = await Vault.findById(vaultId);
    if (!vault) return res.status(404).json({ message: "Vault not found" });

    if (vault.ownerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Only owner can add participants" });
    }

    const participant = await User.findOne({ email });
    if (!participant)
      return res.status(404).json({ message: "User not found with that email" });

    const alreadyAdded = vault.participants.some(
      (p) => p.participantId.toString() === participant._id.toString()
    );
    if (alreadyAdded)
      return res.status(400).json({ message: "User already added as participant" });

    vault.participants.push({
      participantId: participant._id,
      role,
      encKey: "pending",
    });

    await vault.save();

    // Audit log
    await AuditLog.create({
      user: req.user._id,
      action: "Added Participant",
      details: { 
        vaultId: vault._id,
        vaultName: vault.title,
        participantEmail: participant.email,
        participantName: `${participant.firstName} ${participant.lastName}`,
        role: role
      },
    });

    return res.status(200).json({ message: "Participant added successfully", vault });
  } catch (err) {
    console.error("Error adding participant:", err);
    return res.status(500).json({ message: "Failed to add participant" });
  }
};

export const removeParticipant = async (req, res) => {
  try {
    const { id, participantId } = req.params;

    const vault = await Vault.findById(id);
    if (!vault) return res.status(404).json({ message: "Vault not found" });

    // Only owner can remove
    if (vault.ownerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Only owner can remove participants" });
    }

    // Find participant info before removing for audit log
    const participantToRemove = vault.participants.find(
      (p) => p.participantId.toString() === participantId
    );

    vault.participants = vault.participants.filter(
      (p) => p.participantId.toString() !== participantId
    );
    await vault.save();

    // Audit log
    if (participantToRemove) {
      const participantUser = await User.findById(participantId);
      await AuditLog.create({
        user: req.user._id,
        action: "Removed Participant",
        details: { 
          vaultId: vault._id,
          vaultName: vault.title,
          participantEmail: participantUser?.email,
          participantName: participantUser ? `${participantUser.firstName} ${participantUser.lastName}` : "Unknown",
          role: participantToRemove.role
        },
      });
    }

    res.json({ message: "Participant removed successfully", vault });
  } catch (err) {
    console.error("Error removing participant:", err);
    res.status(500).json({ message: "Failed to remove participant" });
  }
};


// ---------------- GET VAULT BY ID ----------------
export const getVaultById = async (req, res) => {
  try {
    const vault = await Vault.findById(req.params.id)
      .populate({
        path: "items",
        select: "metadata fileUrl encKey createdAt",
      })
      .populate("ruleSetId")
      .populate("ownerId", "firstName lastName email")
      .populate("participants.participantId", "firstName lastName email role");

    if (!vault) return res.status(404).json({ message: "Vault not found" });

    // Access control: only owner or participant can view
    const userId = req.user._id.toString();
    const isOwner = vault.ownerId._id.toString() === userId;
    const participant = vault.participants.find(
      (p) => p.participantId && p.participantId._id.toString() === userId
    );
    const isParticipant = !!participant;

    if (!isOwner && !isParticipant)
      return res.status(403).json({ message: "Access denied to this vault" });

    // Determine if user can access files
    let canAccessFiles = isOwner; // Owner can always access
    let items = vault.items || [];

    // For participants, check release status and role
    if (!isOwner && isParticipant) {
      const Release = (await import("../models/Release.js")).default;
      
      // Find active release for this vault
      const release = await Release.findOne({
        vaultId: vault._id,
        status: { $in: ["pending", "in_progress", "approved", "released"] }
      }).sort({ triggeredAt: -1 });

      // Only beneficiaries can access files after release is fully complete
      // Witnesses and shared users cannot decrypt/download files
      if (release && release.isFullyReleased() && participant.role === "beneficiary") {
        canAccessFiles = true;
      } else {
        // Hide files from all participants until release is complete
        // And always hide files from witnesses and shared users
        items = [];
      }
    }

    return res.status(200).json({ 
      vault, 
      items,
      canAccessFiles,
      isOwner,
      userRole: isOwner ? "owner" : participant?.role || "participant"
    });
   
  } catch (err) {
    console.error("Error fetching vault:", err);
    return res.status(500).json({ message: "Failed to fetch vault" });
  }
};

// ---------------- DELETE VAULT ----------------
export const deleteVault = async (req, res) => {
  try {
    const { id } = req.params;

    // Find the vault
    const vault = await Vault.findById(id);
    if (!vault)
      return res.status(404).json({ message: "Vault not found" });

    // Check if the user is the owner
    if (vault.ownerId.toString() !== req.user._id.toString())
      return res.status(403).json({ message: "Only vault owner can delete this vault" });

    // Audit log before deletion
    await AuditLog.create({
      user: req.user._id,
      action: "Deleted Vault",
      details: { 
        vaultId: vault._id,
        vaultName: vault.title,
      },
    });

    // Delete associated ruleset and vault
    if (vault.ruleSetId) await RuleSet.findByIdAndDelete(vault.ruleSetId);
    await Vault.findByIdAndDelete(vault._id);

    return res.status(200).json({ message: "Vault deleted successfully" });
  } catch (err) {
    console.error("Error deleting vault:", err);
    return res.status(500).json({ message: "Error deleting vault", error: err.message });
  }
};

// ---------------- GET SEALED VAULT KEY FOR CURRENT USER ----------------
export const getSealedVaultKey = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id.toString();

    const vault = await Vault.findById(id);
    if (!vault) {
      return res.status(404).json({ message: "Vault not found" });
    }

    // Check if user has access to this vault
    const isOwner = vault.ownerId.toString() === userId;
    const isParticipant = vault.participants.some(
      (p) => p.participantId && p.participantId.toString() === userId
    );

    if (!isOwner && !isParticipant) {
      return res.status(403).json({ message: "Access denied to this vault" });
    }

    // Find sealed key for this user
    const sealedKey = vault.sealedKeys.find(
      (sk) => sk.participantId && sk.participantId.toString() === userId
    );

    if (!sealedKey) {
      return res.status(404).json({ 
        message: "No sealed key found for your account. Contact vault owner to add your encryption key.",
        userId: userId 
      });
    }

    return res.status(200).json({ 
      encKey: sealedKey.encKey,
      vaultId: vault._id 
    });
  } catch (err) {
    console.error("Error fetching sealed vault key:", err);
    return res.status(500).json({ message: "Error fetching sealed key", error: err.message });
  }
};
