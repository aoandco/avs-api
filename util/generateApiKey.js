// util/generateApiKey.js
const crypto = require("crypto");

exports.generateApiKey = () => {
  const rawKey = crypto.randomBytes(32).toString("hex");
  return `sk_live_${rawKey}`;
};

exports.hashApiKey = (key) => {
  return crypto.createHash("sha256").update(key).digest("hex");
};
