import mongoose from "mongoose";
import bcrypt from "bcrypt";

const userSchema = new mongoose.Schema({

  firstName: { 
    type: String,
    required: true 
 },
  lastName: { 
    type: String 
 },
  email: {
    type: String,
    required: true, 
    unique: true 
 },
  password: { 
    type: String, 
    required: true 
 },
  role: { 
    type: String, 
    enum: ["owner", "beneficiary", "shared", "witness"], 
    default: "owner" 
  },
  publicKey: String,
  privateKeyEnc: String, // encrypted private key
  vaultKeyBackups: {
    type: Map,
    of: String,
    default: {},
  },
  lastActiveAt: {
    type: Date,
    default: Date.now
  },
}, { timestamps: true });

// Hash password before save
userSchema.pre("save", async function(next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

// Password match
userSchema.methods.comparePassword = function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

export default mongoose.model("User", userSchema);
