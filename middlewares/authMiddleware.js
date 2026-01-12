import jwt from "jsonwebtoken";
import User from "../models/User.js";
import Vault from "../models/Vault.js";

export const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
    try {
      token = req.headers.authorization.split(" ")[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = await User.findById(decoded.id).select("-password");
      
      // Define passive/read-only operations that don't count as activity
      const passiveEndpoints = [
        '/api/vaults',           // GET requests to view vaults
        '/api/releases',         // GET requests to view releases
        '/api/auditlogs',        // GET requests to view logs
        '/api/inactivity',       // GET requests to check inactivity status
      ];
      
      const isPassiveRequest = req.method === 'GET' && 
        passiveEndpoints.some(endpoint => req.path.startsWith(endpoint));
      
      // Update lastActiveAt for:
      // 1. Any non-GET request (POST, PUT, DELETE, etc.) - these are active user actions
      // 2. Any request if user doesn't have lastActiveAt set (first time after login)
      // 3. /api/auth/me endpoint (to ensure activity is tracked after fresh login)
      const shouldUpdateActivity = req.user && (
        !isPassiveRequest ||                           // Active operations (POST, PUT, DELETE)
        !req.user.lastActiveAt ||                       // First request, ensure it's set
        req.path === '/api/auth/me'                     // Auth check after login
      );
      
      if (shouldUpdateActivity) {
        await User.findByIdAndUpdate(req.user._id, { lastActiveAt: new Date() });
      }
      
      next();
    } catch (err) {
      return res.status(401).json({ message: "Not authorized, token failed" });
    }
  }

  if (!token) return res.status(401).json({ message: "Not authorized, no token" });
};

// Middleware to check if user is the vault owner
export const isVaultOwner = async (req, res, next) => {
  try {
    const vaultId = req.params.id || req.body.vaultId;
    
    if (!vaultId) {
      return res.status(400).json({ message: "Vault ID is required" });
    }

    const vault = await Vault.findById(vaultId);
    
    if (!vault) {
      return res.status(404).json({ message: "Vault not found" });
    }

    if (vault.ownerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Access denied. Only vault owner can perform this action." });
    }

    req.vault = vault;
    next();
  } catch (err) {
    console.error("isVaultOwner middleware error:", err);
    return res.status(500).json({ message: "Error checking vault ownership" });
  }
};

// Middleware to check if user has access to vault (owner or participant)
export const hasVaultAccess = async (req, res, next) => {
  try {
    const vaultId = req.params.id || req.body.vaultId;
    
    if (!vaultId) {
      return res.status(400).json({ message: "Vault ID is required" });
    }

    const vault = await Vault.findById(vaultId);
    
    if (!vault) {
      return res.status(404).json({ message: "Vault not found" });
    }

    const userId = req.user._id.toString();
    const isOwner = vault.ownerId.toString() === userId;
    const isParticipant = vault.participants.some(
      (p) => p.participantId && p.participantId.toString() === userId
    );

    if (!isOwner && !isParticipant) {
      return res.status(403).json({ message: "Access denied to this vault" });
    }

    req.vault = vault;
    req.isOwner = isOwner;
    next();
  } catch (err) {
    console.error("hasVaultAccess middleware error:", err);
    return res.status(500).json({ message: "Error checking vault access" });
  }
};

