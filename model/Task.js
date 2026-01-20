const mongoose = require("mongoose");

const taskSchema = new mongoose.Schema({
  clientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Client",
    required: true
  },
  agentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Agent",
    default: null
  },
  activityId: {
    type: String,
    required: true,
    unique: true
  },
  customerName: {
    type: String,
    required: true
  },
  verificationAddress: {
    type: String,
    required: true
  },
  
  state: {
    type: String,
  },

  city: {
    type: String,
  },

  status: {
    type: String,
    enum: ["pending", "incomplete", "assigned", "over-due", "completed"],
    default: "pending"
  },
  visitDate: Date,
  feedback: {
    addressExistence: String,
    addressResidential: String,
    customerResident: String,
    customerKnown: String,
    metWith: String,
    nameOfPersonMet: String,
    easeOfLocation: String,
    comments: String,
    additionalComments: String,

    relatioshipWithCustomer:String,
    customerRelationshipWithAddress:String,
    buildingColor:String,
    buildingType:String,
    areaProfile: {type: String, enum:["low", "high", "medium", "major", "N/A"]},
    landMark:String,

    receivedDate: Date,
    personMetOthers: String,
    visitFeedback: String,
    geoMapping: {
      lat: Number,
      lng: Number
    },
    geotaggedImages: [String],
    recordedAudio: String,
    recordedVideo: String,
    reportUrl: String,
  },
  createdAt: {
    type: Date,
    default: Date.now
  },

  assignedDate: {
  type: Date,
  default: null
},

taskSubmissionDate: { type: Date },
reportIsApproved:{type:Boolean , default:false},


});

module.exports = mongoose.model("Task", taskSchema);
