import AuditLog from "../models/AuditLog.js";
import Vault from "../models/Vault.js";

// ✅ Record a new log
export const recordLog = async (req, res) => {
  try {
    const { action, details } = req.body;

    const log = await AuditLog.create({
      user: req.user?._id,
      action,
      details,
    });

    res.status(201).json(log);
  } catch (error) {
    console.error("Error recording audit log:", error);
    res.status(500).json({ message: "Failed to record audit log" });
  }
};

// ✅ Get all logs categorized by vault ownership and participation
export const getLogs = async (req, res) => {
  try {
    const userId = req.user._id;

    // Get all vaults where user is owner
    const ownedVaults = await Vault.find({ ownerId: userId }).select("_id title");

    // Get all vaults where user is a participant
    const participantVaults = await Vault.find({
      "participants.participantId": userId,
    })
      .select("_id title participants")
      .populate("participants.participantId");

    // Get vault IDs
    const ownedVaultIds = ownedVaults.map((v) => v._id.toString());
    const participantVaultIds = participantVaults.map((v) => v._id.toString());

    // Fetch all logs
    const allLogs = await AuditLog.find()
      .populate("user", "firstName lastName email role")
      .sort({ timestamp: -1 });

    // Categorize logs - only show logs from user's vaults or vaults they participate in
    const ownedVaultLogs = {};
    const participantVaultLogs = {};

    for (const log of allLogs) {
      const vaultId = log.details?.vaultId?.toString();

      // Only process logs that have a vaultId and belong to user's vaults
      if (vaultId) {
        if (ownedVaultIds.includes(vaultId)) {
          if (!ownedVaultLogs[vaultId]) {
            const vault = ownedVaults.find((v) => v._id.toString() === vaultId);
            ownedVaultLogs[vaultId] = {
              vaultId,
              vaultTitle: vault?.title || "Unknown Vault",
              logs: [],
            };
          }
          ownedVaultLogs[vaultId].logs.push(log);
        } else if (participantVaultIds.includes(vaultId)) {
          if (!participantVaultLogs[vaultId]) {
            const vault = participantVaults.find((v) => v._id.toString() === vaultId);
            const userParticipation = vault?.participants.find(
              (p) => p.participantId._id.toString() === userId.toString()
            );
            participantVaultLogs[vaultId] = {
              vaultId,
              vaultTitle: vault?.title || "Unknown Vault",
              userRole: userParticipation?.role || "unknown",
              logs: [],
            };
          }
          participantVaultLogs[vaultId].logs.push(log);
        }
        // Logs from vaults user doesn't have access to are ignored
      }
      // Logs without vaultId are also ignored for security
    }

    res.status(200).json({
      ownedVaultLogs: Object.values(ownedVaultLogs),
      participantVaultLogs: Object.values(participantVaultLogs),
    });
  } catch (error) {
    console.error("Error fetching audit logs:", error);
    res.status(500).json({ message: "Failed to fetch audit logs" });
  }
};

// ✅ Get logs for a specific vault or user
export const getLogsByFilter = async (req, res) => {
  try {
    const { vaultId, userId } = req.query;
    const filter = {};

    if (vaultId) filter["details.vaultId"] = vaultId;
    if (userId) filter.user = userId;

    const logs = await AuditLog.find(filter)
      .populate("user", "firstName lastName email role")
      .sort({ timestamp: -1 });

    res.status(200).json(logs);
  } catch (error) {
    console.error("Error fetching filtered logs:", error);
    res.status(500).json({ message: "Failed to fetch filtered logs" });
  }
};
