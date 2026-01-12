import mongoose from "mongoose";

const releaseSchema = new mongoose.Schema({
  vaultId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Vault",
    required: true,
  },
  triggeredAt: {
    type: Date,
    default: Date.now,
  },
  status: {
    type: String,
    enum: ["pending", "in_progress", "approved", "rejected", "revoked", "released"],
    default: "pending",
  },
  gracePeriodEnd: {
    type: Date,
  },
  countdownEnd: {
    type: Date,
  },
  approvalsNeeded: {
    type: Number,
    default: 0,
  },
  approvalsReceived: {
    type: Number,
    default: 0,
  },
  notifiedTimeLock: { 
    type: Boolean,
    default: false
   },
  completedAt: {
    type: Date,
  },
});

// Create a compound index to help with queries
releaseSchema.index({ vaultId: 1, status: 1 });
releaseSchema.index({ status: 1, gracePeriodEnd: 1 });
releaseSchema.index({ status: 1, countdownEnd: 1 });

// Helper method to check if release is fully complete and accessible
releaseSchema.methods.isFullyReleased = function() {
  return this.status === "released";
};

// Helper method to check if still in grace period
releaseSchema.methods.isInGracePeriod = function() {
  if (!this.gracePeriodEnd) return false;
  return new Date() < new Date(this.gracePeriodEnd);
};

// Helper method to check if in time lock period
releaseSchema.methods.isInTimeLock = function() {
  if (!this.countdownEnd) return false;
  return this.status === "approved" && new Date() < new Date(this.countdownEnd);
};

export default mongoose.model("Release", releaseSchema);
