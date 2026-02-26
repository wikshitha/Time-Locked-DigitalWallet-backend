import jwt from "jsonwebtoken";
import User from "../models/User.js";

const generateToken = (user) => {
  return jwt.sign({ 
    id: user._id, 
    email: user.email 
 }, process.env.JWT_SECRET, { expiresIn: "7d" });
};

// Register
export const register = async (req, res) => {
  try {
    const { firstName, lastName, email, password } = req.body;
    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ message: "User already exists" });

    // All new users are created as "owner" by default
    // Specific roles (beneficiary, witness, shared) are assigned when added to vaults
    const user = new User({ 
      firstName, 
      lastName, 
      email, 
      password, 
      role: "owner",
      lastActiveAt: new Date()
    });
    await user.save();

    const token = generateToken(user);
    res.status(201).json({ 
      message: "User registered successfully", 
      user: { id: user._id, email: user.email, role: user.role }, 
      token 
    });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// Login
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "Invalid credentials" });

    const isMatch = await user.comparePassword(password);
    if (!isMatch) return res.status(400).json({ message: "Invalid credentials" });

    // Update last active timestamp on login
    user.lastActiveAt = new Date();
    await user.save();

    const token = generateToken(user);
    res.json({ 
      message: "Login successful", 
      user: { 
        id: user._id, 
        email: user.email, 
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        publicKey: user.publicKey,
        privateKeyEnc: user.privateKeyEnc
      }, 
      token 
    });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// Get Current User
export const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};
