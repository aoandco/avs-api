const mongoose = require("mongoose");

const ClientSchema = new mongoose.Schema({
  companyName: { type: String, required: true },
  email: { type: String, unique: true, required: true },
  uploaderName: { type: String, required: true },
  uploaderPhone: { type: String, required: true },
  password: { type: String, required: true },
  isVerified: { type: Boolean, default: false },
  emailOTP: { type: String },
  otpExpiresAt: { type: Date },
  linkExpiresAt:{ type: Date },
}, { timestamps: true });

module.exports = mongoose.model("Client", ClientSchema);
