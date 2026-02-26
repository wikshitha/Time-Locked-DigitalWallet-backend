import mongoose from "mongoose";

//
// Sub-schemas for participants and sealed keys
//
const participantSchema = new mongoose.Schema({
  participantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  role: {
    type: String,
    enum: ["beneficiary", "shared", "witness"],
    required: true,
  },
});

const sealedKeySchema = new mongoose.Schema({
  participantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  encKey: {
    type: String, // base64-encoded encrypted vault key
    required: true,
  },
});

//
// Main Vault schema
//
const vaultSchema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },

    // Link to ruleset
    ruleSetId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RuleSet",
    },

    // Encrypted file references
    items: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Item",
      },
    ],

    // Participants (executors, witnesses, beneficiaries)
    participants: [participantSchema],

    // Encrypted (sealed) vault keys per participant
    sealedKeys: [sealedKeySchema],

    // Track if inactivity release has been triggered
    releaseTriggered: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

export default mongoose.model("Vault", vaultSchema);
