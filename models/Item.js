import mongoose from "mongoose";

const itemSchema = new mongoose.Schema({
  vaultId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Vault",
    required: true,
  },
  fileUrl: {
    type: String,
    required: true,
  },
  encKey: {
    type: String,
    required: true,
  },
  metadata: {
    name: { type: String },
    type: { type: String },
    size: { type: Number },
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

export default mongoose.model("Item", itemSchema);
