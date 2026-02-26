import mongoose from "mongoose";
import dotenv from "dotenv";
import User from "../models/User.js";

dotenv.config();

const updateExistingUsers = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log("Connected to MongoDB");

    // Update all users who don't have lastActiveAt field
    const result = await User.updateMany(
      { lastActiveAt: { $exists: false } },
      { $set: { lastActiveAt: new Date() } }
    );

    console.log(`✅ Updated ${result.modifiedCount} users with lastActiveAt field`);

    // Show all users with their lastActiveAt
    const users = await User.find({}).select('email lastActiveAt');
    console.log("\n📋 All users:");
    users.forEach(user => {
      console.log(`  - ${user.email}: Last active at ${user.lastActiveAt || 'Not set'}`);
    });

    await mongoose.connection.close();
    console.log("\n✅ Database connection closed");
    process.exit(0);
  } catch (err) {
    console.error("❌ Error:", err.message);
    process.exit(1);
  }
};

updateExistingUsers();
