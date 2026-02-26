import cron from "node-cron";
import Vault from "../models/Vault.js";
import User from "../models/User.js";
import RuleSet from "../models/RuleSet.js";
import Release from "../models/Release.js";
import { addTimePeriod, getCronSchedule, getTestMode, getTimeDescription } from "../utils/timeHelper.js";

/**
 * This job runs to check for inactive users.
 * In test mode: runs every minute
 * In production: runs daily at midnight
 */
export const startInactivityWatcher = () => {
  // In test mode: run every minute
  // In production: run daily at midnight
  const schedule = getCronSchedule("0 0 * * *", "* * * * *");
  
  cron.schedule(schedule, async () => {
    const mode = getTestMode() ? "[TEST MODE]" : "[PRODUCTION]";
    console.log(`🔍 ${mode} [Cron] Checking for inactive users...`);

    try {
      const now = new Date();
      const users = await User.find({ lastActiveAt: { $exists: true } });

      console.log(`📊 ${mode} Found ${users.length} users to check for inactivity`);
      
      let inactiveUsersFound = 0;
      let releasesTriggered = 0;

      for (const user of users) {
        const vaults = await Vault.find({ ownerId: user._id }).populate("ruleSetId");

        if (vaults.length === 0) continue;

        // Calculate user's last activity
        const lastActive = new Date(user.lastActiveAt);
        const inactiveDuration = Math.floor((now - lastActive) / (1000 * 60)); // in minutes
        const inactiveDurationDisplay = getTestMode() 
          ? `${inactiveDuration} minute(s)` 
          : `${Math.floor(inactiveDuration / (60 * 24))} day(s)`;

        console.log(`👤 ${mode} User: ${user.email} | Last Active: ${lastActive.toLocaleString()} | Inactive for: ${inactiveDurationDisplay}`);

        for (const vault of vaults) {
          const ruleSet = vault.ruleSetId;
          if (!ruleSet || !ruleSet.inactivityPeriod) {
            console.log(`   ⚠️  Vault "${vault.title}" has no inactivity period configured - skipping`);
            continue;
          }

          // Check if release has already been triggered for this vault
          if (vault.releaseTriggered) {
            console.log(`   ℹ️  Vault "${vault.title}" - Release already triggered previously - skipping`);
            continue;
          }

          // Use time helper to calculate inactivity end
          const inactivityEnd = addTimePeriod(new Date(user.lastActiveAt), ruleSet.inactivityPeriod);
          const inactivityPeriodDesc = getTimeDescription(ruleSet.inactivityPeriod);

          // Calculate time remaining or time over
          const timeRemaining = inactivityEnd - now;
          const isInactive = now > inactivityEnd;

          if (isInactive) {
            inactiveUsersFound++;
            
            // Calculate how long the user has been inactive beyond the threshold
            const overdueTime = Math.floor((now - inactivityEnd) / (1000 * 60));
            const overdueDisplay = getTestMode() 
              ? `${overdueTime} minute(s)` 
              : `${Math.floor(overdueTime / (60 * 24))} day(s)`;

            console.log(`   ⚠️  INACTIVITY THRESHOLD EXCEEDED!`);
            console.log(`   📦 Vault: "${vault.title}"`);
            console.log(`   ⏰ Inactivity Period: ${inactivityPeriodDesc}`);
            console.log(`   🕐 Threshold Exceeded: ${inactivityEnd.toLocaleString()}`);
            console.log(`   ⏱️  Overdue by: ${overdueDisplay}`);

            // Calculate grace period end
            const gracePeriodEnd = addTimePeriod(new Date(), ruleSet.gracePeriod);
            const gracePeriodDesc = getTimeDescription(ruleSet.gracePeriod);

            // Create release
            const release = await Release.create({
              vaultId: vault._id,
              status: "pending",
              triggeredAt: now,
              gracePeriodEnd,
              approvalsNeeded: ruleSet.approvalsRequired || 1,
              approvalsReceived: 0,
            });

            // Mark vault as release triggered to prevent duplicate releases
            vault.releaseTriggered = true;
            await vault.save();

            releasesTriggered++;

            console.log(`   🚨 RELEASE TRIGGERED AUTOMATICALLY!`);
            console.log(`   📋 Release ID: ${release._id}`);
            console.log(`   📊 Release Status: ${release.status}`);
            console.log(`   ⏳ Grace Period: ${gracePeriodDesc}`);
            console.log(`   📅 Grace Period Ends: ${gracePeriodEnd.toLocaleString()}`);
            console.log(`   ✅ Approvals Required: ${release.approvalsNeeded}`);
            console.log(`   `);
            console.log(`   📌 WORKFLOW NEXT STEPS:`);
            console.log(`   1️⃣  Wait for grace period to end (${gracePeriodDesc})`);
            console.log(`   2️⃣  Status will change to 'in_progress'`);
            console.log(`   3️⃣  Witnesses can then approve/reject`);
            console.log(`   4️⃣  After ${release.approvalsNeeded} approval(s), time-lock starts`);
            console.log(`   5️⃣  Beneficiaries can access files when status = 'released'`);
            console.log(`   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
          } else {
            // User is still within the allowed inactivity period
            const remainingMinutes = Math.floor(timeRemaining / (1000 * 60));
            const remainingDisplay = getTestMode() 
              ? `${remainingMinutes} minute(s)` 
              : `${Math.floor(remainingMinutes / (60 * 24))} day(s)`;

            console.log(`   ✅ Vault "${vault.title}" - User still active (${remainingDisplay} remaining before inactivity threshold)`);
          }
        }
      }

      // Summary
      console.log(`\n📊 ${mode} INACTIVITY CHECK SUMMARY:`);
      console.log(`   👥 Total Users Checked: ${users.length}`);
      console.log(`   ⚠️  Inactive Users Found: ${inactiveUsersFound}`);
      console.log(`   🚨 Releases Triggered: ${releasesTriggered}`);
      if (releasesTriggered > 0) {
        console.log(`   ⚡ Action: ${releasesTriggered} vault(s) have entered grace period!`);
      } else {
        console.log(`   ✅ Status: All users are active, no releases triggered`);
      }
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

    } catch (err) {
      console.error("❌ Cron job error:", err);
    }
  });

  const modeDesc = getTestMode() ? "every minute (TEST MODE)" : "daily at midnight (PRODUCTION)";
  console.log(`🔍 Inactivity Watcher started — ${modeDesc}.`);
};
