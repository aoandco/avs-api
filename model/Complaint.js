const mongoose = require("mongoose");

const complaintSchema = new mongoose.Schema({
  role: {
    type: String,
    enum: ["Agent", "Client"],
    required: true,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    refPath: "role", // dynamically reference Agent or Client
  },
  complaintID:{type:String, required:true},
  subject: {
    type: String,
    required: true,
  },
  message: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    enum: ["in-review", "opened", "resolved"],
    default: "in-review",
  },
}, { timestamps: true });

module.exports = mongoose.model("Complaint", complaintSchema);
