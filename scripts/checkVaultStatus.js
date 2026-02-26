import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

// Define schemas inline for standalone script
const releaseSchema = new mongoose.Schema({
  vaultId: { type: mongoose.Schema.Types.ObjectId, ref: "Vault" },
  triggeredAt: Date,
  status: String,
  gracePeriodEnd: Date,
  countdownEnd: Date,
  approvalsNeeded: Number,
  approvalsReceived: Number,
  completedAt: Date,
});

const vaultSchema = new mongoose.Schema({
  title: String,
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  ruleSetId: { type: mongoose.Schema.Types.ObjectId, ref: "RuleSet" },
  releaseTriggered: Boolean,
}, { timestamps: true });

const userSchema = new mongoose.Schema({
  email: String,
  lastActiveAt: Date,
});

const ruleSetSchema = new mongoose.Schema({
  inactivityPeriod: Number,
  gracePeriod: Number,
  timeLock: Number,
  approvalsRequired: Number,
});

const Vault = mongoose.model("Vault", vaultSchema);
const Release = mongoose.model("Release", releaseSchema);
const User = mongoose.model("User", userSchema);
const RuleSet = mongoose.model("RuleSet", ruleSetSchema);

const checkVaultStatus = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log("Connected to MongoDB\n");

    // Get all vaults with their release status
    const vaults = await Vault.find({})
      .populate('ownerId', 'email lastActiveAt')
      .populate('ruleSetId');

    console.log(`📊 VAULT STATUS SUMMARY\n`);
    console.log(`Found ${vaults.length} vault(s)\n`);

    for (const vault of vaults) {
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`🏛️  Vault: "${vault.title}"`);
      console.log(`   ID: ${vault._id}`);
      console.log(`   Owner: ${vault.ownerId.email}`);
      console.log(`   Owner Last Active: ${vault.ownerId.lastActiveAt ? vault.ownerId.lastActiveAt.toLocaleString() : 'Never'}`);
      console.log(`   Release Triggered: ${vault.releaseTriggered ? '✅ Yes' : '❌ No'}`);

      if (vault.ruleSetId) {
        console.log(`   Inactivity Period: ${vault.ruleSetId.inactivityPeriod} ${process.env.TEST_MODE === 'true' ? 'minute(s)' : 'day(s)'}`);
        console.log(`   Grace Period: ${vault.ruleSetId.gracePeriod} ${process.env.TEST_MODE === 'true' ? 'minute(s)' : 'day(s)'}`);
        console.log(`   Time Lock: ${vault.ruleSetId.timeLock} ${process.env.TEST_MODE === 'true' ? 'minute(s)' : 'day(s)'}`);
        console.log(`   Approvals Required: ${vault.ruleSetId.approvalsRequired}`);
      }

      // Find releases for this vault
      const releases = await Release.find({ vaultId: vault._id }).sort({ triggeredAt: -1 });
      
      if (releases.length > 0) {
        console.log(`\n   📋 Releases (${releases.length}):`);
        releases.forEach((release, index) => {
          console.log(`\n   ${index + 1}. Release ID: ${release._id}`);
          console.log(`      Status: ${release.status.toUpperCase()}`);
          console.log(`      Triggered: ${release.triggeredAt.toLocaleString()}`);
          console.log(`      Grace Period End: ${release.gracePeriodEnd ? release.gracePeriodEnd.toLocaleString() : 'N/A'}`);
          console.log(`      Approvals: ${release.approvalsReceived}/${release.approvalsNeeded}`);
          if (release.countdownEnd) {
            console.log(`      Time Lock End: ${release.countdownEnd.toLocaleString()}`);
          }
          if (release.completedAt) {
            console.log(`      Completed: ${release.completedAt.toLocaleString()}`);
          }
        });
      } else {
        console.log(`\n   📋 Releases: None`);
      }
      console.log(`\n`);
    }

    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

    await mongoose.connection.close();
    console.log("✅ Database connection closed");
    process.exit(0);
  } catch (err) {
    console.error("❌ Error:", err.message);
    process.exit(1);
  }
};

checkVaultStatus();
