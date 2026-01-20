const mongoose = require("mongoose");

const AgentSchema = new mongoose.Schema({
  fullName: { type: String, required: true },
  email: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  dateOfBirth:{type:Date},
  teamName: { type: String },
  phoneNumber: { type: String },
  address: { type: String },
  profileImage: { type: String },
  isVerified: { type: Boolean, default: false },
  emailOTP: { type: String }, // for email verification
  otpExpiresAt: { type: Date },
  linkExpiresAt:{ type: Date },
}, { timestamps: true });

module.exports = mongoose.model("Agent", AgentSchema);
