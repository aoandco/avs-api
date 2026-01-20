const Agent = require("../model/Agent");
const Task = require("../model/Task");
const Complaint = require("../model/Complaint")
const Notification = require("../model/Notification")
const cloudinary = require("../config/cloudinary");
const { submitTaskSchema } = require("../util/validationSchemas");
const { generateTaskPDF, uploadPDFToCloudinary } = require("../service/pdfService")
const mongoose = require("mongoose")
const fs = require("fs");


const updateAgentProfile = async (req, res) => {
  try {
    const {fullName, address, phoneNumber , dateOfBirth, teamName} = req.body;
    const agent = await Agent.findById(req.user.id);
    if (!agent) {
      return res.status(404).json({ success: false, message: "Agent not found" });
    }

    if(fullName) agent.fullName = fullName;
    if (address) agent.address = address;
    if (phoneNumber) agent.phoneNumber = phoneNumber;
    if(dateOfBirth) agent.dateOfBirth = dateOfBirth
    if(teamName) agent.dateOfBirth = teamName

    if (req.file) {
      // Upload profile image to Cloudinary
      const result = await cloudinary.uploader.upload_stream(
        {
          folder: "agents/profileImages",
          resource_type: "image"
        },
        async (error, result) => {
          if (error) {
            console.error("Cloudinary error:", error);
            return res.status(500).json({ success: false, message: "Image upload failed" });
          }

          agent.profileImage = result.secure_url;
          await agent.save();

          return res.status(200).json({
            success: true,
            message: "Profile updated successfully",
            data: {
              fullName:agent.fullName,
              teamName:agent?.teamName,
              address: agent?.address,
              phoneNumber: agent?.phoneNumber,
              profileImage: agent?.profileImage,
              dateOfBirth:agent?.dateOfBirth
            }
          });
        }
      );

      result.end(req.file.buffer);
    } else {
      await agent.save();

      res.status(200).json({
        success: true,
        message: "Profile updated successfully",
        data: {
          address: agent.address,
          phoneNumber: agent.phoneNumber,
          profileImage: agent.profileImage
        }
      });
    }
  } catch (err) {
    console.error("Update agent profile error:", err);
    res.status(500).json({ success: false, message:err.message });
  }
};


const getTasks = async (req, res) => {
  try {
    const agentId = req.user.id;
    const statusFilter = req.query.statusFilter || "all"; // all, assigned, completed

    if (!["assigned", "incomplete" , "inProgress", "overDue", "completed", "all"].includes(statusFilter)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Use "assigned", "incomplete","inProgress", "overDue", "completed", or "all"`,
      });
    }

    const statusMap = {
      assigned: ["assigned", "over-due"],
      inProgress: ["in-progress"],
      completed: ["completed"],
      overDue:["over-due"],
      incomplete:["incomplete"],
      all: ["assigned", "completed", "in-progress", "over-due", "incomplete"],
    };

    const allowedStatuses = statusMap[statusFilter] || statusMap["all"];

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const [tasks, total] = await Promise.all([
      Task.find({ agentId, status: { $in: allowedStatuses } })
        .populate("clientId", "companyName email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Task.countDocuments({ agentId, status: { $in: allowedStatuses } })
    ]);

    res.status(200).json({
      success: true,
      message: `${statusFilter} tasks fetched successfully`,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      totalTasks: total,
      data: tasks
    });
  } catch (err) {
    console.error("Fetch agent tasks error:", err);
    res.status(500).json({ success: false, message:err.message });
  }
};


const startTask = async (req, res) => {
  try {
    const taskId = new mongoose.Types.ObjectId(req.params.taskId) ;

    const task = await Task.findById(taskId);

    if (!task) {
      return res.status(404).json({ success: false, message: "Task not found" });
    }

    if (task.agentId.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: "Not authorized to start this task." });
    }

    res.status(200).json({
      success: true,
      message: "Task started.",
      data: task
    });
  } catch (err) {
    console.error("Start task error:", err);
    res.status(500).json({ success: false, message:err.message });
  }
};



const submitTask = async (req, res) => {
  try {
    const taskId = new mongoose.Types.ObjectId(req.params.taskId);
    const { error, value } = submitTaskSchema.validate(JSON.parse(req.body.data));
    if (error) {
      return res.status(400).json({ success: false, message: "Validation failed", errors: error.details });
    }

    const task = await Task.findById(taskId).populate("clientId").populate("agentId");
    if (!task) {
      return res.status(404).json({ success: false, message: "Task not found" });
    }


    if (task.agentId._id.toString() !== req.user.id.toString()) {
      return res.status(403).json({ success: false, message: "Unauthorized" });
    }

    if (task.status == "completed") {
      return res.status(403).json({ success: false, message: "This Task is already submitted" });
    }

    const media = {
      geotaggedImages: [],
      recordedAudio: "",
      recordedVideo: ""
    };

   const uploadToCloudinary = async (filePath, folder, resource_type = "video") => {
  
    const result = await cloudinary.uploader.upload(filePath, {
    folder,
    resource_type
  });
  await fs.promises.unlink(filePath); // delete file after upload

  return result.secure_url;
};

    // Upload images
    if (req.files?.geotaggedImages) {
      for (const img of req.files.geotaggedImages) {
        const url = await uploadToCloudinary(img.path, "tasks/images", "image");
        media.geotaggedImages.push(url);
      }
    }

    // Upload audio
    if (req.files?.recordedAudio?.[0]) {
      const url = await uploadToCloudinary(req.files.recordedAudio[0].path, "tasks/audio", "video");
      media.recordedAudio = url;
    }

    // Upload video
    if (req.files?.recordedVideo?.[0]) {
      const url = await uploadToCloudinary(req.files.recordedVideo[0].path, "tasks/video", "video");
      media.recordedVideo = url;
    }

    // Prepare feedback object
    const { lat, lng, visitDate, ...rest } = value;
    task.feedback = {
      ...rest,
      geoMapping: { lat, lng },
      geotaggedImages: media.geotaggedImages,
      recordedAudio: media.recordedAudio,
      recordedVideo: media.recordedVideo,
    };

    task.visitDate = visitDate;
   // Generate & upload PDF report
    const pdfBuffer = await generateTaskPDF(task); 

    const reportUrl = await uploadPDFToCloudinary(pdfBuffer, `report-${task._id}`);
    task.feedback.reportUrl = reportUrl;  
    
    task.status = "completed";
    await task.save();

    res.status(200).json({
      success: true,
      message: "Task submitted successfully",
      data: task
    });
  } catch (err) {
    console.error("Submit task error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

const rejectTask = async (req, res) => {
  try {
    const taskId = new mongoose.Types.ObjectId(req.params.taskId);
    const { comments } = req.body;

    if (!comments || typeof comments !== "string" || comments.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Rejection reason (comments) is required.",
      });
    }

    const task = await Task.findById(taskId).populate("clientId").populate("agentId");
    if (!task) {
      return res.status(404).json({ success: false, message: "Task not found" });
    }


    if (task.agentId._id.toString() !== req.user.id.toString()) {
      return res.status(403).json({ success: false, message: "Unauthorized" });
    }

    if (task.status == "completed") {
      return res.status(403).json({ success: false, message: "This Task is already submitted" });
    }

    task.status = "incomplete";
    task.visitDate = null;
    task.taskSubmissionDate = null;

    task.feedback = {
      addressExistence: "No",
      addressResidential: "N/A",
      customerResident: "No",
      customerKnown: "N/A",
      metWith: "N/A",
      nameOfPersonMet: "N/A",
      easeOfLocation: "N/A",
      comments,
      additionalComments: "N/A",
      relatioshipWithCustomer: "N/A", 
      customerRelationshipWithAddress: "N/A",
      buildingColor: "N/A",
      buildingType: "N/A",
      areaProfile: "N/A",
      landMark: "N/A",
      receivedDate:null,
      personMetOthers: "N/A",
      visitFeedback: "N/A",
      geoMapping: {
        lat: null,
        lng: null
      },
      geotaggedImages: [],
      recordedAudio: "N/A",
      recordedVideo: "N/A"
    };

    // Generate & upload PDF report
    const pdfBuffer = await generateTaskPDF(task);
    const reportUrl = await uploadPDFToCloudinary(pdfBuffer, `report-${task._id}`);

    task.feedback.reportUrl = reportUrl;
    // task.reportIsApproved = true;

    await task.save();

    return res.status(200).json({
      success: true,
      message: "Task rejected and report approved successfully.",
    });

  } catch (err) {
    console.error("Report approval error:", err);
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};


const deleteAccount = async (req, res) => {
  try {
    const { email } = req.body;
    
    const agent = await Agent.findOneAndDelete({ email }, {new:true});

    if(!agent){
      return res.status(404).json({
      success: false,
      message: "Agent not found",
    });
    }
    
    res.status(200).json({
      success: true,
      message: "Account deleted successful",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
};

const getAgentDashboard = async (req, res) => {
  try {
    const agentId = req.user.id;

    const [agent, completedCount, assignedCount, inCompleteCount, overDueCount] = await Promise.all([
      Agent.findById(agentId).select("-password -emailOTP -otpExpiresAt -linkExpiresAt"), // Exclude sensitive fields
      Task.countDocuments({ agentId, status: "completed" }),
      Task.countDocuments({ agentId, status: "assigned" }),
      Task.countDocuments({ agentId, status: "incomplete"}),
      Task.countDocuments({ agentId, status: "over-due"})
    ]);

    if (!agent) {
      return res.status(404).json({ success: false, message: "Agent not found" });
    }

    res.status(200).json({
      success: true,
      message: "Agent dashboard fetched successfully",
      data: {
        bio: agent,
        completedTasks: completedCount,
        assignedTasks: assignedCount,
        inCompleteTasks: inCompleteCount,
        overDueTasks:overDueCount,
      }
    });
  } catch (err) {
    console.error("Agent dashboard error:", err);
    res.status(500).json({ success: false, message:err.message });
  }
};

const searchTasks = async (req, res) => {
  try {
    const agentId = req.user.id;
    const { q } = req.query;

    if (!q || q.trim() === "") {
      return res.status(400).json({ success: false, message: "Search term required" });
    }

    const regex = new RegExp(q, "i");

    const tasks = await Task.find({
      agentId,
      $or: [
        { customerName: regex },
        { verificationAddress: regex }
      ]
    }).populate("clientId", "companyName email").sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      message: "Tasks search result",
      data: tasks
    });
  } catch (err) {
    console.error("Search tasks error:", err);
    res.status(500).json({ success: false, message:err.message });
  }
};

const submitComplaint = async (req, res) => {
  try {
    const { subject, message } = req.body;
    const role = req.user.role; // "agent" or "client"
    const userId = req.user.id;

    if (!["agent", "client"].includes(role)) {
      return res.status(400).json({ success: false, message: "Invalid role" });
    }

    // Count existing complaints to generate next ID
    const count = await Complaint.countDocuments();
    const serial = String(count + 1).padStart(4, "0"); // e.g., 0004
    const complaintID = `ID-${serial}`;

    const newComplaint = await Complaint.create({
      role:role=="agent"? "Agent": "Client",
      userId,
      complaintID,
      subject,
      message,
    });

    res.status(201).json({
      success: true,
      message: "Complaint submitted successfully",
      data: newComplaint
    });
  } catch (err) {
    console.error("Submit complaint error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};


const fetchComplaints = async (req, res) => {
  try {
    const id = req.user.id
    const {
      status,
      subject
    } = req.query;

     const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const filter = {userId:id};

    if (status && ["in-review", "opened", "resolved"].includes(status)) {
      filter.status = status;
    }

    if (subject) {
      filter.subject = { $regex: subject, $options: "i" };
    }

    const [complaints, total] = await Promise.all([
      Complaint.find(filter)
        .populate("userId", "fullName email") // populates either Agent or Client depending on role
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Complaint.countDocuments(filter)
    ]);

    res.status(200).json({
      success: true,
      message: "Complaints fetched successfully",
      currentPage: parseInt(page),
      totalPages: Math.ceil(total / limit),
      totalComplaints: total,
      data: complaints
    });

  } catch (err) {
    console.error("Fetch complaints error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

const getAllNotifications = async (req, res) => {
  try {
    const userId = req.user.id;             
    const role = req.user.role;             
    const { type } = req.query;

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const queryFilter = {
      recipientRole: role,
      recipientId: userId,
    };

    if (type && ["message", "report", "complaint resolution"].includes(type)) {
      queryFilter.type = type;
    }

    // === 1. Paginated result
    const notifications = await Notification.find(queryFilter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // === 2. Total for pagination
    const totalCount = await Notification.countDocuments(queryFilter);

    // === 3. Count by type (regardless of filter)
    const counts = await Notification.aggregate([
      {
        $match: {
          recipientRole: role,
          recipientId: userId
        }
      },
      {
        $group: {
          _id: "$type",
          count: { $sum: 1 }
        }
      }
    ]);

    const countMap = {
      message: 0,
      report: 0,
      "complaint resolution": 0
    };

    counts.forEach(item => {
      countMap[item._id] = item.count;
    });

    res.status(200).json({
      success: true,
      message: "Notifications retrieved",
      currentPage: parseInt(page),
      totalPages: Math.ceil(totalCount / limit),
      total: totalCount,
      counts: countMap,
      data: notifications
    });

  } catch (err) {
    console.error("Fetch notifications error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};


const getTaskHistory = async (req, res) => {
  try {
    const agentId = req.user.id;
    const statusFilter = req.query.statusFilter || "all"; // all, assigned, completed

    if (!["assigned", "inProgress", "overDue", "completed", "all"].includes(statusFilter)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Use "assigned", "inProgress", "overDue", "completed", or "all"`,
      });
    }

    const statusMap = {
      assigned: ["assigned"],
      inProgress: ["in-progress"],
      completed: ["completed"],
      overDue:["over-due"],
      all: ["assigned", "in-progress", "completed", "over-due"],
    };

    const allowedStatuses = statusMap[statusFilter];

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const filter = { agentId, status: { $in: allowedStatuses } };

    const [tasks, totalFiltered] = await Promise.all([
      Task.find(filter)
        .populate("clientId", "companyName email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Task.countDocuments(filter)
    ]);

    // === Count of all statuses (regardless of filter)
    const statusCountsAgg = await Task.aggregate([
      { $match: { agentId: new mongoose.Types.ObjectId(agentId) } },
      { $group: { _id: "$status", count: { $sum: 1 } } }
    ]);

    const statusCounts = {
      assigned: 0,
      "in-progress": 0,
      completed: 0,
      pending: 0,
      "over-due": 0
    };

    statusCountsAgg.forEach(item => {
      statusCounts[item._id] = item.count;
    });

    const totalAgentTasks = Object.values(statusCounts).reduce((a, b) => a + b, 0);
    const completedCount = statusCounts.completed || 0;
    const successRate = totalAgentTasks > 0 ? ((completedCount / totalAgentTasks) * 100).toFixed(2) : "0.00";

    res.status(200).json({
      success: true,
      message: `${statusFilter} tasks fetched successfully`,
      currentPage: page,
      totalPages: Math.ceil(totalFiltered / limit),
      totalFiltered,
      totalAgentTasks,
      successRate: `${successRate}%`,
      statusBreakdown: statusCounts,
      tasks: tasks,
    });
  } catch (err) {
    console.error("Fetch agent tasks error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};


const getMonthlyTaskStats = async (req, res) => {
  try {
    const agentId = req.user.id;
    const currentYear = new Date().getFullYear();
    const startOfYear = new Date(`${currentYear}-01-01T00:00:00.000Z`);
    const endOfYear = new Date(`${currentYear}-12-31T23:59:59.999Z`);

    const pipeline = [
      {
        $match: {
          agentId: new mongoose.Types.ObjectId(agentId),
          createdAt: { $gte: startOfYear, $lte: endOfYear },
          status: { $in: ["assigned", "in-progress", "completed", "over-due"] }
        }
      },
      {
        $group: {
          _id: {
            month: { $month: "$createdAt" },
            status: "$status"
          },
          count: { $sum: 1 }
        }
      }
    ];

    const monthlyResults = await Task.aggregate(pipeline);

    // Build base monthly data structure
    const statuses = ["assigned", "in-progress", "completed", "over-due"];
    const monthlyStats = {};
    for (let m = 1; m <= 12; m++) {
      monthlyStats[m] = {};
      statuses.forEach(s => {
        monthlyStats[m][s] = 0;
      });
    }

    // Fill in counts from aggregation
    monthlyResults.forEach(item => {
      const { month, status } = item._id;
      monthlyStats[month][status] = item.count;
    });

    // Convert to readable format
    const monthNames = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
    ];

    const formattedStats = monthNames.map((name, index) => ({
      month: name,
      ...monthlyStats[index + 1]
    }));

    // Overall counts
    const [assigned, inProgress, completed, overDue]  = await Promise.all([
      Task.countDocuments({ agentId, status: "assigned", createdAt: { $gte: startOfYear, $lte: endOfYear } }),
      Task.countDocuments({ agentId, status: "in-progress", createdAt: { $gte: startOfYear, $lte: endOfYear } }),
      Task.countDocuments({ agentId, status: "completed", createdAt: { $gte: startOfYear, $lte: endOfYear } }),
      Task.countDocuments({ agentId, status: "over-due", createdAt: { $gte: startOfYear, $lte: endOfYear } }),
    ]);

    const total = assigned + inProgress + completed + overDue ;

    return res.status(200).json({
      success: true,
      year: currentYear,
      data: formattedStats,
      totals: {
        assigned,
        inProgress,
        completed,
        total
      }
    });
  } catch (err) {
    console.error("Monthly stats error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};


module.exports = {
    updateAgentProfile,
    getTasks,
    startTask,
    submitTask,
    rejectTask,
    deleteAccount,
    getAgentDashboard,
    searchTasks,
    submitComplaint,
    fetchComplaints,
    getAllNotifications,
    getTaskHistory,
    getMonthlyTaskStats,
}