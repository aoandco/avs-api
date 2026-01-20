const crypto = require("crypto");
const Client = require("../model/Client");

module.exports = async function verifyApiKey(req, res, next) {
  try {
    // const authHeader = req.headers.authorization;

    // if (!authHeader || !authHeader.startsWith("ApiKey ")) {
    //   return res.status(401).json({
    //     success: false,
    //     message: "Missing or invalid API key",
    //   });
    // }

    const apiKey = req.headers["x-api-key"];

    const hashedKey = crypto.createHash("sha256").update(apiKey).digest("hex");

    const client = await Client.findOne({ apiKeyHash: hashedKey }).select("_id email");

    if (!client) {
      return res.status(403).json({
        success: false,
        message: "Invalid API key",
      });
    }

    req.client = client;
    next();
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
