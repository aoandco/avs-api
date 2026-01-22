const mongoose = require("mongoose");

const ClientSchema = new mongoose.Schema({
  companyName: { type: String, required: true },
  email: { type: String, unique: true, required: true },
  uploaderName: { type: String, required: true },
  uploaderPhone: { type: String, required: true },
  password: { type: String, required: true },
  isVerified: { type: Boolean, default: false },
  emailOTP: { type: String },
  apiKeyHash: { type: String, select: false },
  apiKeyCreatedAt: Date,
  integration: {
  avsEndpoint: { type: String },               // CLIENT_AVS_ENDPOINT
  subscriptionKey: { type: String },           // Ocp-Apim-Subscription-Key
  vendorExternalId: { type: String },           // x-vendor-id if different
  integrationEnabled: { type: Boolean, default: false }
},
  otpExpiresAt: { type: Date },
  linkExpiresAt:{ type: Date },
}, { timestamps: true });

module.exports = mongoose.model("Client", ClientSchema);
