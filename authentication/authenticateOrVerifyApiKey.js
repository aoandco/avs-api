const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const Client = require("../model/Client");

/**
 * Combined authentication middleware that supports both JWT and API key authentication.
 * Tries JWT authentication first, then falls back to API key authentication if JWT fails.
 * Normalizes req.user for controllers to use consistently.
 */
module.exports = async function authenticateOrVerifyApiKey(req, res, next) {
  // Try JWT authentication first if Bearer token is present
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.split(" ")[1];
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = { id: decoded.id, role: decoded.role };
      return next();
    } catch (err) {
      // JWT verification failed, continue to try API key
    }
  }

  // Try API key authentication
  try {
    const apiKey = req.headers["x-api-key"];

    if (!apiKey) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: Valid authentication token or API key required",
      });
    }

    const hashedKey = crypto.createHash("sha256").update(apiKey).digest("hex");
    const client = await Client.findOne({ apiKeyHash: hashedKey }).select("_id email");

    if (!client) {
      return res.status(403).json({
        success: false,
        message: "Invalid API key",
      });
    }

    // Normalize: set req.user from req.client so controllers can use req.user.id and req.user.role
    req.user = {
      id: client._id,
      role: "client",
    };
    req.client = client; // Also keep req.client for backward compatibility if needed
    return next();
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}
