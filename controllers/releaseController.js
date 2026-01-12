import Release from "../models/Release.js";
import Confirmation from "../models/Confirmation.js";
import AuditLog from "../models/AuditLog.js";
import Vault from "../models/Vault.js";
import { sendEmail } from "../utils/emailService.js";
import { addTimePeriod, getTimeDescription } from "../utils/timeHelper.js";


/**
 * Trigger a release (e.g., system detects inactivity)
 */
export const triggerRelease = async (req, res) => {
  try {
    const { vaultId } = req.body;

    // Find vault and verify ownership
    const vault = await Vault.findById(vaultId).populate("ruleSetId").populate("participants.participantId");
    if (!vault) {
      return res.status(404).json({ message: "Vault not found" });
    }

    const ruleSet = vault.ruleSetId;
    if (!ruleSet) {
      return res.status(400).json({ message: "Vault has no ruleset defined" });
    }

    // Check if release already exists for this vault
    const existingRelease = await Release.findOne({
      vaultId,
      status: { $in: ["pending", "in_progress", "approved"] }
    });

    if (existingRelease) {
      return res.status(400).json({ message: "Release already in progress for this vault" });
    }

    // Calculate grace period end using time helper
    const gracePeriodEnd = addTimePeriod(new Date(), ruleSet.gracePeriod);

    // Create new release
    const release = await Release.create({
      vaultId,
      status: "pending",
      triggeredAt: new Date(),
      gracePeriodEnd,
      approvalsNeeded: ruleSet.approvalsRequired || 1,
      approvalsReceived: 0,
    });

    // Notify witnesses and beneficiaries
    const participants = vault.participants || [];
    const gracePeriodDesc = getTimeDescription(ruleSet.gracePeriod);
    
    for (const p of participants) {
      if (p.participantId && p.participantId.email) {
        const role = p.role;
        let emailBody = "";
        
        if (role === "witness") {
          emailBody = `A release has been triggered for vault "${vault.title}". Grace period (${gracePeriodDesc}) ends on ${release.gracePeriodEnd.toLocaleString()}. You will be required to approve this release.`;
        } else if (role === "beneficiary") {
          emailBody = `A release has been triggered for vault "${vault.title}". Grace period (${gracePeriodDesc}) ends on ${release.gracePeriodEnd.toLocaleString()}. After approval and time-lock, you will gain access to the vault contents.`;
        } else {
          emailBody = `A release has been triggered for vault "${vault.title}". Grace period (${gracePeriodDesc}) ends on ${release.gracePeriodEnd.toLocaleString()}.`;
        }
        
        await sendEmail(
          p.participantId.email,
          "Release Triggered — Grace Period Started",
          emailBody
        );
      }
    }

    // Create audit log
    await AuditLog.create({
      user: req.user._id,
      action: "Release Triggered",
      details: { vaultId, releaseId: release._id, gracePeriodEnd, gracePeriodDesc },
    });

    res.status(201).json({
      message: "Release triggered and grace period started",
      release,
    });
  } catch (err) {
    console.error("Error triggering release:", err);
    res.status(500).json({ message: "Error triggering release", error: err.message });
  }
};

/**
 * Get all releases for a specific user (owner or executor)
 */
export const getReleasesForUser = async (req, res) => {
  try {
    // Find all releases and populate vault information
    const allReleases = await Release.find()
      .populate({
        path: "vaultId",
        populate: { path: "ownerId participants.participantId" }
      })
      .sort({ triggeredAt: -1 });

    // Filter and categorize releases
    const ownedVaultReleases = [];
    const participantVaultReleases = [];

    for (const release of allReleases) {
      if (!release.vaultId) continue;

      const vault = release.vaultId;
      const isOwner = vault.ownerId && vault.ownerId._id.toString() === req.user._id.toString();
      const isParticipant = vault.participants.some(
        (p) => p.participantId && p.participantId._id.toString() === req.user._id.toString()
      );

      if (isOwner) {
        ownedVaultReleases.push({ ...release.toObject(), userRole: "owner" });
      } else if (isParticipant) {
        const userParticipation = vault.participants.find(
          (p) => p.participantId && p.participantId._id.toString() === req.user._id.toString()
        );
        participantVaultReleases.push({ 
          ...release.toObject(), 
          userRole: "participant",
          participantRole: userParticipation?.role || "unknown"
        });
      }
    }

    res.json({
      ownedVaultReleases,
      participantVaultReleases
    });
  } catch (err) {
    res.status(500).json({ message: "Error fetching releases", error: err.message });
  }
};


/**
 * Approve or reject a release (witness action during grace period)
 */
export const confirmRelease = async (req, res) => {
  try {
    const { releaseId, status, comment } = req.body;

    // Validate status
    if (!["approved", "rejected"].includes(status)) {
      return res.status(400).json({ message: "Invalid status. Must be 'approved' or 'rejected'" });
    }

    // Check if release exists
    const release = await Release.findById(releaseId).populate({
      path: "vaultId",
      populate: [
        { path: "ruleSetId" },
        { path: "participants.participantId" }
      ]
    });
    
    if (!release) return res.status(404).json({ message: "Release not found" });

    const vault = release.vaultId;
    if (!vault) return res.status(404).json({ message: "Vault not found" });

    // Check if user is a witness for this vault
    const isWitness = vault.participants.some(
      (p) => p.participantId && p.participantId._id.toString() === req.user._id.toString() && p.role === "witness"
    );

    if (!isWitness) {
      return res.status(403).json({ message: "Only witnesses can approve or reject releases" });
    }

    // Witnesses can only approve/reject after grace period ends (status must be "in_progress")
    if (release.status === "pending") {
      return res.status(400).json({ 
        message: `Grace period is still active. Grace period ends on ${release.gracePeriodEnd.toLocaleString()}. Please wait until the grace period ends.` 
      });
    }

    if (release.status !== "in_progress") {
      return res.status(400).json({ 
        message: `Cannot approve/reject release. Current status: ${release.status}` 
      });
    }

    // Check if user already confirmed this release
    const existingConfirmation = await Confirmation.findOne({
      releaseId,
      participantId: req.user._id,
    });

    if (existingConfirmation) {
      return res.status(400).json({ message: "You have already submitted your confirmation for this release" });
    }

    // Create new confirmation
    const confirmation = await Confirmation.create({
      releaseId,
      participantId: req.user._id,
      status,
      comment,
    });

    // Update release based on witness decision
    if (status === "approved") {
      release.approvalsReceived += 1;

      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`✅ WITNESS APPROVED RELEASE`);
      console.log(`   👤 Witness: ${req.user.email}`);
      console.log(`   📋 Release ID: ${release._id}`);
      console.log(`   🏛️  Vault: "${vault.title}"`);
      console.log(`   📊 Approvals: ${release.approvalsReceived}/${release.approvalsNeeded}`);

      // Check if all required approvals are collected
      if (release.approvalsReceived >= release.approvalsNeeded) {
        release.status = "approved";
        
        // Start time-lock countdown using time helper
        const ruleSet = vault.ruleSetId;
        const countdownEnd = addTimePeriod(new Date(), ruleSet.timeLock);
        release.countdownEnd = countdownEnd;
        
        const timeLockDesc = getTimeDescription(ruleSet.timeLock);
        
        console.log(`   `);
        console.log(`   🎉 ALL APPROVALS RECEIVED!`);
        console.log(`   📊 Status Changed: in_progress → approved`);
        console.log(`   🔒 TIME-LOCK STARTED!`);
        console.log(`   ⏰ Time-Lock Duration: ${timeLockDesc}`);
        console.log(`   📅 Time-Lock Ends: ${countdownEnd.toLocaleString()}`);
        console.log(`   `);
        console.log(`   📌 NEXT STEP:`);
        console.log(`   → Wait for time-lock to expire`);
        console.log(`   → Status will change to 'released'`);
        console.log(`   → Beneficiaries can then access vault files`);
        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        
        // Notify participants about time-lock
        for (const p of vault.participants) {
          if (p.participantId && p.participantId.email) {
            await sendEmail(
              p.participantId.email,
              "Vault Approved — Time Lock Started",
              `Vault "${vault.title}" has received all required approvals (${release.approvalsReceived}/${release.approvalsNeeded}). Time-lock period (${timeLockDesc}) has started and will end on ${countdownEnd.toLocaleString()}.`
            );
          }
        }
      } else {
        release.status = "in_progress";
        console.log(`   ℹ️  Waiting for more approvals (${release.approvalsNeeded - release.approvalsReceived} remaining)`);
        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      }
    } else if (status === "rejected") {
      // If any witness rejects, the entire release is rejected
      release.status = "rejected";
      release.completedAt = new Date();

      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`❌ WITNESS REJECTED RELEASE`);
      console.log(`   👤 Witness: ${req.user.email}`);
      console.log(`   📋 Release ID: ${release._id}`);
      console.log(`   🏛️  Vault: "${vault.title}"`);
      console.log(`   📊 Status Changed: in_progress → rejected`);
      console.log(`   💬 Comment: ${comment || "No comment provided"}`);
      console.log(`   ℹ️  Release process terminated`);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

      // Notify participants about rejection
      for (const p of vault.participants) {
        if (p.participantId && p.participantId.email) {
          await sendEmail(
            p.participantId.email,
            "Vault Release Rejected",
            `The release of vault "${vault.title}" has been rejected by a witness. Comment: ${comment || "No comment provided"}`
          );
        }
      }
    }

    await release.save();

    // Log audit
    await AuditLog.create({
      user: req.user._id,
      action: `Witness ${status} release`,
      details: { releaseId, vaultId: vault._id, comment },
    });

    res.status(201).json({ 
      message: `Release ${status} successfully`, 
      confirmation, 
      release 
    });
  } catch (err) {
    console.error("Error confirming release:", err);
    res.status(500).json({ message: "Error confirming release", error: err.message });
  }
};

/**
 * Finalize a release after time-lock ends
 */
export const finalizeRelease = async (req, res) => {
  try {
    const { releaseId } = req.body;

    const release = await Release.findById(releaseId);
    if (!release) return res.status(404).json({ message: "Release not found" });

    if (release.status !== "approved") {
      return res.status(400).json({ message: "Cannot finalize — not all approvals complete" });
    }

    // Check time-lock expiration
    if (new Date() < new Date(release.countdownEnd)) {
      return res.status(400).json({ message: "Time-lock not yet finished" });
    }

    release.status = "released";
    release.completedAt = new Date();
    await release.save();

    // Log release event
    await AuditLog.create({
      actorId: req.user._id,
      action: `vault_released ${release.vaultId}`,
    });

    res.status(200).json({ message: "Vault released successfully", release });
  } catch (err) {
    res.status(500).json({ message: "Error finalizing release", error: err.message });
  }
};

export const getPendingReleasesForUser = async (req, res) => {
  try {
    const userId = req.user._id;

    const releases = await Release.find({
      status: { $in: ["pending", "in_progress"] },
    }).populate("vaultId");

    // Optional: filter where user is a vault participant
    const myReleases = releases.filter((r) =>
      r.vaultId?.participants?.some(
        (p) => p.userId?.toString() === userId.toString()
      )
    );

    res.json(myReleases);
  } catch (err) {
    res
      .status(500)
      .json({ message: "Error fetching pending releases", error: err.message });
  }
};

export const revokeRelease = async (req, res) => {
  try {
    const { releaseId, reason } = req.body;

    const release = await Release.findById(releaseId).populate({
      path: "vaultId",
      populate: { path: "participants.participantId" }
    });
    
    if (!release) return res.status(404).json({ message: "Release not found" });

    if (release.status === "released") {
      return res.status(400).json({ message: "Cannot revoke a released vault" });
    }

    const vault = release.vaultId;
    if (!vault) return res.status(404).json({ message: "Vault not found" });

    // Verify the user is the vault owner
    if (vault.ownerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Only the vault owner can revoke a release" });
    }

    // Only allow revoke during grace period (status: "pending")
    if (release.status !== "pending") {
      return res.status(400).json({ 
        message: `Release can only be revoked during grace period. Current status: ${release.status}` 
      });
    }

    // Mark release as rejected/revoked
    release.status = "revoked";
    release.completedAt = new Date();
    await release.save();

    // CRITICAL: Reset vault's releaseTriggered flag so inactivity watcher can trigger again
    vault.releaseTriggered = false;
    await vault.save();

    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`🚫 OWNER REVOKED RELEASE`);
    console.log(`   👤 Owner: ${req.user.email}`);
    console.log(`   📋 Release ID: ${release._id}`);
    console.log(`   🏛️  Vault: "${vault.title}"`);
    console.log(`   🔄 Status Changed: pending → revoked`);
    console.log(`   `);
    console.log(`   ♻️  SYSTEM RESET:`);
    console.log(`   → Vault flagged for inactivity monitoring again`);
    console.log(`   → If owner remains inactive, a new release will be triggered`);
    console.log(`   → Grace period will restart from the beginning`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    // Notify participants
    if (vault.participants) {
      for (const p of vault.participants) {
        if (p.participantId && p.participantId.email) {
          const role = p.role;
          await sendEmail(
            p.participantId.email,
            "Vault Release Revoked by Owner",
            `The owner has revoked the release for vault "${vault.title}". Reason: ${reason || "No reason provided"}.\n\nThe system will continue monitoring for owner inactivity. If the owner remains inactive, a new release will be triggered.`
          );
        }
      }
    }

    // Audit log
    await AuditLog.create({
      user: req.user._id,
      action: "Owner Revoked Release",
      details: { 
        releaseId: release._id, 
        vaultId: vault._id,
        reason: reason || "No reason provided",
        message: "Release revoked during grace period. Vault reset for inactivity monitoring."
      },
    });

    res.status(200).json({ 
      message: "Release successfully revoked. System will continue monitoring for inactivity.", 
      release 
    });
  } catch (err) {
    console.error("Error revoking release:", err);
    res.status(500).json({ message: "Error revoking release", error: err.message });
  }
};

/**
 * Get release status for a specific vault
 */
export const getVaultReleaseStatus = async (req, res) => {
  try {
    const { vaultId } = req.params;

    // Find the most recent active release for this vault
    const release = await Release.findOne({
      vaultId,
      status: { $in: ["pending", "in_progress", "approved", "released"] }
    }).sort({ triggeredAt: -1 });

    if (!release) {
      return res.json({
        hasActiveRelease: false,
        isReleased: false,
        status: null,
      });
    }

    const isReleased = release.isFullyReleased();
    const inGracePeriod = release.isInGracePeriod();
    const inTimeLock = release.isInTimeLock();

    // Check if current user has already confirmed this release
    const userConfirmation = await Confirmation.findOne({
      releaseId: release._id,
      participantId: req.user._id,
    });

    res.json({
      hasActiveRelease: true,
      isReleased,
      inGracePeriod,
      inTimeLock,
      status: release.status,
      gracePeriodEnd: release.gracePeriodEnd,
      countdownEnd: release.countdownEnd,
      approvalsReceived: release.approvalsReceived,
      approvalsNeeded: release.approvalsNeeded,
      releaseId: release._id,
      userHasConfirmed: !!userConfirmation,
      userConfirmationStatus: userConfirmation?.status || null,
    });
  } catch (err) {
    console.error("Error getting vault release status:", err);
    res.status(500).json({ message: "Error getting release status", error: err.message });
  }
};
