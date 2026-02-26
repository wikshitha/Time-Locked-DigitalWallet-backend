import mongoose from "mongoose";
import dotenv from "dotenv";
import Vault from "../models/Vault.js";
import Release from "../models/Release.js";
import User from "../models/User.js";

dotenv.config();

const resetVaultForTesting = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log("Connected to MongoDB");

    // Get vault title from command line argument
    const vaultTitle = process.argv[2];

    if (!vaultTitle) {
      console.log("\n❌ Usage: node scripts/resetVault.js \"Vault Title\"");
      console.log("\nThis script resets a vault for re-testing the release workflow:");
      console.log("  - Deletes all releases for the vault");
      console.log("  - Resets releaseTriggered flag");
      console.log("  - Updates owner's lastActiveAt to now");
      process.exit(1);
    }

    // Find the vault
    const vault = await Vault.findOne({ title: vaultTitle }).populate('ownerId');
    
    if (!vault) {
      console.log(`\n❌ Vault "${vaultTitle}" not found`);
      process.exit(1);
    }

    console.log(`\n🔍 Found vault: "${vault.title}"`);
    console.log(`   Owner: ${vault.ownerId.email}`);
    console.log(`   ID: ${vault._id}`);

    // Delete all releases for this vault
    const deleteResult = await Release.deleteMany({ vaultId: vault._id });
    console.log(`\n🗑️  Deleted ${deleteResult.deletedCount} release(s)`);

    // Reset the releaseTriggered flag
    vault.releaseTriggered = false;
    await vault.save();
    console.log(`✅ Reset releaseTriggered flag to false`);

    // Update owner's lastActiveAt to now
    await User.findByIdAndUpdate(vault.ownerId._id, { lastActiveAt: new Date() });
    console.log(`⏰ Updated owner's lastActiveAt to now`);

    console.log(`\n✅ Vault "${vaultTitle}" has been reset for testing!`);
    console.log(`\n📋 Next steps:`);
    console.log(`   1. Make sure owner (${vault.ownerId.email}) doesn't make any requests`);
    console.log(`   2. Wait for inactivity period to trigger release`);
    console.log(`   3. Watch the complete workflow execute`);

    await mongoose.connection.close();
    console.log(`\n✅ Database connection closed`);
    process.exit(0);
  } catch (err) {
    console.error("❌ Error:", err.message);
    process.exit(1);
  }
};

resetVaultForTesting();
