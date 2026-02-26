import cron from "node-cron";
import Release from "../models/Release.js";
import AuditLog from "../models/AuditLog.js";
import { sendEmail } from "../utils/emailService.js";
import { getCronSchedule, getTestMode } from "../utils/timeHelper.js";

export const startReleaseScheduler = () => {
  // In test mode: run every minute
  // In production: run every hour
  const schedule = getCronSchedule("0 * * * *", "* * * * *");
  
  cron.schedule(schedule, async () => {
    const mode = getTestMode() ? "[TEST MODE]" : "[PRODUCTION]";
    console.log(`${mode} [Scheduler] Checking release countdowns...`);

    try {
      const now = new Date();

      // 1️⃣ Find approved releases still counting down
      const activeReleases = await Release.find({
        status: "approved",
        countdownEnd: { $gte: now },
      }).populate("vaultId");

      for (const release of activeReleases) {
        const msRemaining = new Date(release.countdownEnd) - now;
        const minutesRemaining = Math.ceil(msRemaining / (1000 * 60));
        const daysRemaining = Math.ceil(msRemaining / (1000 * 60 * 60 * 24));

        // Send reminders
        const timeRemaining = getTestMode() ? minutesRemaining : daysRemaining;
        const timeUnit = getTestMode() ? "minute(s)" : "day(s)";
        
        // In test mode: remind every minute if <= 2 minutes
        // In production: remind if <= 2 days
        if (timeRemaining <= 2) {
          const vault = release.vaultId;
          const participants = vault?.participants || [];

          for (const p of participants) {
            if (p.participantId && p.participantId.email) {
              await sendEmail(
                p.participantId.email,
                `Vault "${vault.title}" — Release Countdown`,
                `The time-lock for vault "${vault.title}" will complete in ${timeRemaining} ${timeUnit}.`
              );
            }
          }

          await AuditLog.create({
            user: vault?.ownerId,
            action: `Reminder Sent`,
            details: { 
              releaseId: release._id,
              timeRemaining: `${timeRemaining} ${timeUnit}`,
              message: `Reminder sent - ${timeRemaining} ${timeUnit} before release`
            }
          });

          console.log(`📧 ${mode} Reminder sent (${timeRemaining} ${timeUnit} left) for release ${release._id}`);
        }
      }

      // 2️⃣ Find releases whose countdown ended and finalize them
      const readyReleases = await Release.find({
        status: "approved",
        countdownEnd: { $lte: now },
      }).populate("vaultId");

      for (const release of readyReleases) {
        release.status = "released";
        release.completedAt = now;
        await release.save();

        const vault = release.vaultId;

        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        console.log(`🎉 ${mode} VAULT RELEASED!`);
        console.log(`   📋 Release ID: ${release._id}`);
        console.log(`   🏛️  Vault: "${vault?.title}"`);
        console.log(`   📊 Status Changed: approved → released`);
        console.log(`   🔓 TIME-LOCK EXPIRED!`);
        console.log(`   ⏰ Countdown Ended: ${release.countdownEnd}`);
        console.log(`   `);
        console.log(`   ✅ BENEFICIARIES CAN NOW ACCESS VAULT FILES!`);
        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        
        // Notify all participants
        if (vault?.participants) {
          for (const p of vault.participants) {
            if (p.participantId && p.participantId.email) {
              await sendEmail(
                p.participantId.email,
                `Vault "${vault.title}" Released!`,
                `The time-lock for vault "${vault.title}" has completed. You can now access the vault contents.`
              );
            }
          }
        }

        await AuditLog.create({
          user: vault?.ownerId,
          action: "Vault Auto-Released",
          details: { 
            releaseId: release._id,
            vaultId: vault?._id,
            message: "Time-lock expired, vault automatically released"
          }
        });
      }

      if (readyReleases.length === 0) {
        console.log(`   ℹ️  No releases ready to finalize`);
      }
    } catch (err) {
      console.error("[Scheduler Error]", err);
    }
  });

  const modeDesc = getTestMode() ? "every minute (TEST MODE)" : "hourly (PRODUCTION)";
  console.log(`⏳ Release Scheduler started — ${modeDesc}.`);
};
