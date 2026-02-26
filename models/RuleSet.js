import mongoose from "mongoose";

const ruleSetSchema = new mongoose.Schema({

  vaultId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "Vault" 
},
  inactivityPeriod: { 
    type: Number, 
    required: true 
}, // days
  gracePeriod: { 
    type: Number, 
    required: true 
},     // days
  approvalsRequired: { 
    type: Number, 
    default: 1 
},
  timeLock: { 
    type: Number, 
    required: true 
}         // days
}, { timestamps: true });

export default mongoose.model("RuleSet", ruleSetSchema);
