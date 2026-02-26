import User from "../models/User.js";
import Vault from "../models/Vault.js";
import Release from "../models/Release.js";
import { addTimePeriod, getTimeDescription, getTestMode } from "../utils/timeHelper.js";

/**
 * Check current user's inactivity status for all their vaults
 */
export const checkMyInactivityStatus = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    
    if (!user || !user.lastActiveAt) {
      return res.status(400).json({ 
        message: "User activity tracking not initialized" 
      });
    }

    const now = new Date();
    const lastActive = new Date(user.lastActiveAt);
    const vaults = await Vault.find({ ownerId: user._id }).populate("ruleSetId");

    // Calculate inactive duration
    const inactiveDuration = Math.floor((now - lastActive) / (1000 * 60)); // in minutes
    const inactiveDurationDisplay = getTestMode() 
      ? `${inactiveDuration} minute(s)` 
      : `${Math.floor(inactiveDuration / (60 * 24))} day(s)`;

    const vaultStatuses = [];

    for (const vault of vaults) {
      const ruleSet = vault.ruleSetId;
      
      if (!ruleSet || !ruleSet.inactivityPeriod) {
        vaultStatuses.push({
          vaultId: vault._id,
          vaultTitle: vault.title,
          status: "no_inactivity_rule",
          message: "No inactivity period configured"
        });
        continue;
      }

      // Calculate inactivity threshold
      const inactivityEnd = addTimePeriod(lastActive, ruleSet.inactivityPeriod);
      const inactivityPeriodDesc = getTimeDescription(ruleSet.inactivityPeriod);
      const isInactive = now > inactivityEnd;

      // Check for existing release
      const existingRelease = await Release.findOne({
        vaultId: vault._id,
        status: { $in: ["pending", "in_progress", "approved"] }
      });

      if (isInactive) {
        // Calculate overdue time
        const overdueTime = Math.floor((now - inactivityEnd) / (1000 * 60));
        const overdueDisplay = getTestMode() 
          ? `${overdueTime} minute(s)` 
          : `${Math.floor(overdueTime / (60 * 24))} day(s)`;

        vaultStatuses.push({
          vaultId: vault._id,
          vaultTitle: vault.title,
          status: "inactive",
          inactivityPeriod: ruleSet.inactivityPeriod,
          inactivityPeriodDescription: inactivityPeriodDesc,
          thresholdExceededAt: inactivityEnd,
          overdueBy: overdueDisplay,
          hasActiveRelease: !!existingRelease,
          releaseStatus: existingRelease?.status || null,
          message: `⚠️ INACTIVITY THRESHOLD EXCEEDED! Overdue by ${overdueDisplay}. ${existingRelease ? `Release ${existingRelease.status}` : 'Release will be triggered soon.'}`
        });
      } else {
        // Still within allowed period
        const timeRemaining = inactivityEnd - now;
        const remainingMinutes = Math.floor(timeRemaining / (1000 * 60));
        const remainingDisplay = getTestMode() 
          ? `${remainingMinutes} minute(s)` 
          : `${Math.floor(remainingMinutes / (60 * 24))} day(s)`;

        vaultStatuses.push({
          vaultId: vault._id,
          vaultTitle: vault.title,
          status: "active",
          inactivityPeriod: ruleSet.inactivityPeriod,
          inactivityPeriodDescription: inactivityPeriodDesc,
          thresholdAt: inactivityEnd,
          timeRemaining: remainingDisplay,
          message: `✅ User is active. ${remainingDisplay} remaining before inactivity threshold.`
        });
      }
    }

    res.json({
      userId: user._id,
      email: user.email,
      lastActiveAt: lastActive,
      currentTime: now,
      inactiveDuration: inactiveDurationDisplay,
      totalVaults: vaults.length,
      testMode: getTestMode(),
      vaults: vaultStatuses,
      summary: {
        activeVaults: vaultStatuses.filter(v => v.status === "active").length,
        inactiveVaults: vaultStatuses.filter(v => v.status === "inactive").length,
        noRuleVaults: vaultStatuses.filter(v => v.status === "no_inactivity_rule").length
      }
    });

  } catch (err) {
    console.error("Error checking inactivity status:", err);
    res.status(500).json({ message: "Error checking inactivity status", error: err.message });
  }
};

/**
 * Admin endpoint - Check any user's inactivity status
 */
export const checkUserInactivityStatus = async (req, res) => {
  try {
    const { userId } = req.params;
    
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!user.lastActiveAt) {
      return res.status(400).json({ 
        message: "User activity tracking not initialized for this user" 
      });
    }

    const now = new Date();
    const lastActive = new Date(user.lastActiveAt);
    const vaults = await Vault.find({ ownerId: user._id }).populate("ruleSetId");

    // Calculate inactive duration
    const inactiveDuration = Math.floor((now - lastActive) / (1000 * 60));
    const inactiveDurationDisplay = getTestMode() 
      ? `${inactiveDuration} minute(s)` 
      : `${Math.floor(inactiveDuration / (60 * 24))} day(s)`;

    const vaultStatuses = [];

    for (const vault of vaults) {
      const ruleSet = vault.ruleSetId;
      
      if (!ruleSet || !ruleSet.inactivityPeriod) {
        vaultStatuses.push({
          vaultId: vault._id,
          vaultTitle: vault.title,
          status: "no_inactivity_rule"
        });
        continue;
      }

      const inactivityEnd = addTimePeriod(lastActive, ruleSet.inactivityPeriod);
      const isInactive = now > inactivityEnd;

      const existingRelease = await Release.findOne({
        vaultId: vault._id,
        status: { $in: ["pending", "in_progress", "approved"] }
      });

      if (isInactive) {
        const overdueTime = Math.floor((now - inactivityEnd) / (1000 * 60));
        const overdueDisplay = getTestMode() 
          ? `${overdueTime} minute(s)` 
          : `${Math.floor(overdueTime / (60 * 24))} day(s)`;

        vaultStatuses.push({
          vaultId: vault._id,
          vaultTitle: vault.title,
          status: "inactive",
          overdueBy: overdueDisplay,
          hasActiveRelease: !!existingRelease,
          releaseStatus: existingRelease?.status || null
        });
      } else {
        const timeRemaining = inactivityEnd - now;
        const remainingMinutes = Math.floor(timeRemaining / (1000 * 60));
        const remainingDisplay = getTestMode() 
          ? `${remainingMinutes} minute(s)` 
          : `${Math.floor(remainingMinutes / (60 * 24))} day(s)`;

        vaultStatuses.push({
          vaultId: vault._id,
          vaultTitle: vault.title,
          status: "active",
          timeRemaining: remainingDisplay
        });
      }
    }

    res.json({
      userId: user._id,
      email: user.email,
      name: `${user.firstName} ${user.lastName}`,
      lastActiveAt: lastActive,
      inactiveDuration: inactiveDurationDisplay,
      vaults: vaultStatuses
    });

  } catch (err) {
    console.error("Error checking user inactivity:", err);
    res.status(500).json({ message: "Error checking user inactivity", error: err.message });
  }
};
