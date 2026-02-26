import cron from "node-cron";
import Release from "../models/Release.js";
import Vault from "../models/Vault.js";
import AuditLog from "../models/AuditLog.js";
import { sendEmail } from "../utils/emailService.js";
import { getCronSchedule, getTestMode } from "../utils/timeHelper.js";

export const startGracePeriodChecker = () => {
  // In test mode: run every minute
  // In production: run every hour
  const schedule = getCronSchedule("0 * * * *", "* * * * *");
  
  cron.schedule(schedule, async () => {
    const mode = getTestMode() ? "[TEST MODE]" : "[PRODUCTION]";
    console.log(`⏳ ${mode} Checking grace periods...`);

    try {
      const now = new Date();

      // Find all releases that are pending and grace period has ended
      const releases = await Release.find({
        status: "pending",
        gracePeriodEnd: { $lte: now },
      }).populate({
        path: "vaultId",
        populate: [
          { path: "ruleSetId" },
          { path: "participants.participantId" }
        ]
      });

      for (const release of releases) {
        const vault = release.vaultId;
        if (!vault) continue;

        // Move release to "in_progress" - awaiting witness approvals
        release.status = "in_progress";
        await release.save();

        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        console.log(`🚀 ${mode} GRACE PERIOD ENDED!`);
        console.log(`   📋 Release ID: ${release._id}`);
        console.log(`   🏛️  Vault: "${vault.title}"`);
        console.log(`   📊 Status Changed: pending → in_progress`);
        console.log(`   👥 Approvals Needed: ${release.approvalsNeeded}`);
        console.log(`   ✅ Approvals Received: ${release.approvalsReceived}`);
        console.log(`   `);
        console.log(`   📌 NEXT STEP:`);
        console.log(`   → Witnesses can now APPROVE or REJECT this release`);
        console.log(`   → After ${release.approvalsNeeded} approval(s), time-lock will start`);
        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

        // Notify witnesses that they need to approve
        const witnesses = vault.participants.filter(p => p.role === "witness");
        for (const witness of witnesses) {
          if (witness.participantId && witness.participantId.email) {
            await sendEmail(
              witness.participantId.email,
              "Action Required: Approve Vault Release",
              `The grace period for vault "${vault.title}" has ended. As a witness, you are now required to approve or reject this release. Please log in to review and take action.`
            );
          }
        }

        // Notify beneficiaries
        const beneficiaries = vault.participants.filter(p => p.role === "beneficiary");
        for (const beneficiary of beneficiaries) {
          if (beneficiary.participantId && beneficiary.participantId.email) {
            await sendEmail(
              beneficiary.participantId.email,
              "Vault Release - Awaiting Witness Approval",
              `The grace period for vault "${vault.title}" has ended. The release is now awaiting approval from witnesses. You will be notified once it's approved.`
            );
          }
        }

        // Audit log entry
        await AuditLog.create({
          user: vault.ownerId,
          action: "Grace Period Ended",
          details: { 
            releaseId: release._id, 
            vaultId: vault._id,
            message: "Release moved to in_progress, awaiting witness approvals"
          },
        });
      }

      if (releases.length === 0) {
        console.log(`   ℹ️  No releases with expired grace periods found`);
      }
    } catch (err) {
      console.error("❌ GracePeriodChecker error:", err);
    }
  });

  const modeDesc = getTestMode() ? "every minute (TEST MODE)" : "hourly (PRODUCTION)";
  console.log(`⏳ Grace Period Checker started — ${modeDesc}.`);
};
