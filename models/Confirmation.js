import mongoose from "mongoose";

const confirmationSchema = new mongoose.Schema({
  releaseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Release",
    required: true,
  },
  participantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  status: {
    type: String,
    enum: ["pending","approved", "rejected"],
    default: "pending",
    required: true,
  },
  comment: {
    type: String,
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
});

export default mongoose.model("Confirmation", confirmationSchema);
