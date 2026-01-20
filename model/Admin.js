const mongoose = require("mongoose");

const AdminSchema = new mongoose.Schema({
  fullName:{type: String, required: true},
  email: { type: String, unique: true, required: true },
  phoneNumber:{type: String, required: true},
  password: { type: String, required: true },
  isVerified: { type: Boolean, default: false },
  emailOTP: { type: String },
  otpExpiresAt: { type: Date },
  linkExpiresAt:{ type: Date },
}, { timestamps: true });

module.exports = mongoose.model("Admin", AdminSchema);
