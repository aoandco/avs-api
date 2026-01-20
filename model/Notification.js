const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema({
  recipientRole: {
    type: String,
    enum: ["Agent", "Client"],
    required: true,
  },
  recipientId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    refPath: "recipientRole", // dynamic reference to Agent or Client
  },
  type: {
    type: String,
    enum: ["message", "report", "complaint resolution"],
    required: true,
  },
  title: {
    type: String,
    required: true,
  },

  body: {
    type: String,
    required: true,
  },
  complaintId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Complaint",
    required: function () {
      return this.type === "complaint resolution";
    },
  },
  isRead: {
    type: Boolean,
    default: false,
  },
}, { timestamps: true });

module.exports = mongoose.model("Notification", notificationSchema);
