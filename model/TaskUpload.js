// models/TaskUpload.js
const mongoose = require("mongoose");

const taskUploadSchema = new mongoose.Schema({
  clientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Client",
    required: true
  },

   fileName: {
    type: String,
    required: true
  },
  
  taskUrl: {
    type: String,
    required: true
  },
  status:{
    type:String, enum:["pending", "in-progress", "verified"], default:"pending"
  },
  uploadedAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model("TaskUpload", taskUploadSchema);
