const Agent = require("../model/Agent");
const Client = require("../model/Client");
const Task = require("../model/Task");
const TaskUpload = require("../model/TaskUpload");
const Notification = require("../model/Notification")
const Complaint = require("../model/Complaint")
const { assignTaskSchema } = require("../util/validationSchemas");
const mongoose = require("mongoose")
const XLSX = require("xlsx");
const fs = require("fs/promises");
const path = require("path");
const cloudinary = require("../config/cloudinary");
const sendEmail = require("../util/sendEmail"); 
const { generateTaskPDF, uploadPDFToCloudinary } = require("../service/pdfService")
const axios = require("axios");
const {pushTaskResultToClient} = require("../util/pushTaskResult")

const listTasks = async (req, res) => {
  try {
    const { statusFilter = "all", state, startDate, endDate, search } = req.query;

    const validStatuses = ["assigned", "inProgress", "incomplete", "completed", "pending", "overDue", "all"];
    if (!validStatuses.includes(statusFilter)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Use "assigned", "incomplete", "inProgress", "completed", "pending", "overDue", or "all"`,
      });
    }

    const statusMap = {
      pending: ["pending"],
      assigned: ["assigned"],
      overDue: ["over-due"],
      inComplete: ["incomplete"],
      completed: ["completed"],
      all: ["pending", "incomplete", "assigned", "completed", "over-due"],
    };

    const allowedStatuses = statusMap[statusFilter] || statusMap["all"];

    // === Build Filter Object ===
    const filter = {
      status: { $in: allowedStatuses },
    };

    if (state) {
      filter.state = state;
    }

    if (startDate || endDate) {
      filter.createdAt = {};

      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        filter.createdAt.$gte = start;
      }

      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = end;
      }
    }

    // Build main query with population
    let query = Task.find(filter)
      .populate({
        path: "clientId",
        select: "companyName email"
      })
      .populate({
        path: "agentId",
        select: "fullName email phoneNumber"
      })
      .sort({ createdAt: -1 });

    // Apply search
    if (search) {
      // Perform search after population using aggregation pipeline
      const regex = new RegExp(search, "i");

      const tasks = await Task.aggregate([
        { $match: filter },
        {
          $lookup: {
            from: "clients", // this should match your clients collection name
            localField: "clientId",
            foreignField: "_id",
            as: "client"
          }
        },
        {
          $lookup: {
            from: "users", // if "agentId" refers to users
            localField: "agentId",
            foreignField: "_id",
            as: "agent"
          }
        },
         { $unwind: { path: "$client", preserveNullAndEmptyArrays: true } },
         { $unwind: { path: "$agent", preserveNullAndEmptyArrays: true } },
        {
          $match: {
            $or: [
              { state: regex },
              { city: regex },
              { activityId: regex },
              { "client.companyName": regex },
              { verificationAddress: regex },
              { customerName: regex }
            ]
          }
        },
        { $sort: { createdAt: -1 } }
      ]);

      return res.status(200).json({
        success: true,
        message: "Tasks retrieved with search",
        totalTasks: tasks.length,
        data: tasks
      });
    }

    // No search: use regular query
    const [tasks, total] = await Promise.all([
      query.exec(),
      Task.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      message: "Tasks retrieved",
      totalTasks: total,
      data: tasks,
    });
  } catch (err) {
    console.error("Error fetching tasks:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};



const assignTask = async (req, res) => {
  try {
    const { taskIds } = req.body; // array of task IDs
    const agentId = new mongoose.Types.ObjectId(req.params.agentId);

    if (!Array.isArray(taskIds) || taskIds.length === 0) {
      return res.status(400).json({ success: false, message: "No task IDs provided" });
    }

    const agent = await Agent.findById(agentId);
    if (!agent) {
      return res.status(404).json({ success: false, message: "Agent not found" });
    }

    const now = new Date();
    const taskSubmissionDeadline = new Date(now.getTime() + 48 * 60 * 60 * 1000); // 48 hours

    let assignedTasks = [];
    let skippedTasks = [];

    for (const id of taskIds) {
      const taskObjectId = new mongoose.Types.ObjectId(id);
      const task = await Task.findById(taskObjectId);

      if (!task) {
        skippedTasks.push({ taskId: id, reason: "Task not found" });
        continue;
      }

      if (task.status !== "pending") {
        skippedTasks.push({ taskId: id, reason: "Task already assigned or completed" });
        continue;
      }

      task.agentId = agent._id;
      task.status = "assigned";
      task.assignedDate = now;
      task.taskSubmissionDate = taskSubmissionDeadline;
      await task.save();

      assignedTasks.push(task);
    }

    return res.status(200).json({
      success: true,
      message: "Tasks assignment processed",
      data:{
        assigned: assignedTasks.length,
        skipped: skippedTasks.length,
        assignedTasks,
        skippedTasks,
      }
    });

  } catch (err) {
    console.error("Assign multiple tasks error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};


const assignTasksToAgent = async (req, res) => {
  try {
    const agentId = new mongoose.Types.ObjectId(req.params.agentId);
    const taskIds = req.body.taskIds; // array of taskId strings

    if (!Array.isArray(taskIds) || taskIds.length === 0) {
      return res.status(400).json({ success: false, message: "No task IDs provided" });
    }

    const agent = await Agent.findById(agentId);
    if (!agent) {
      return res.status(404).json({ success: false, message: "Agent not found" });
    }

    const tasks = await Task.find({ _id: { $in: taskIds }, status: "pending" });

    if (tasks.length === 0) {
      return res.status(404).json({ success: false, message: "No valid pending tasks found" });
    }

    // Update task assignment
    const now = new Date();
    for (let task of tasks) {
      task.agentId = agent._id;
      task.status = "assigned";
      task.assignedDate = now;
      await task.save();
    }

    // === Create Excel Sheet ===
    const sheetData = tasks.map(task => ({
      "Activity ID": task.activityId,
      "Customer Name": task.customerName,
      "Verification Address": task.verificationAddress,
      "State": task.state || "N/A",
      "Assigned Date": now.toLocaleDateString(),
      "Status": "Assigned"
    }));

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(sheetData);
    XLSX.utils.book_append_sheet(workbook, worksheet, "Assigned Tasks");

    const tempPath = path.join(__dirname, `../uploads/tasks-${agent._id}-${Date.now()}.xlsx`);
    XLSX.writeFile(workbook, tempPath);

    // === Upload to Cloudinary ===
    const cloudResult = await cloudinary.uploader.upload(tempPath, {
      folder: "tasks/excels",
      resource_type: "raw"
    });

    await fs.unlink(tempPath); // Cleanup

    // === Send Email ===
    await sendEmail.sendAssignedTasks(agent.email, agent.fullName, tasks.length, cloudResult.secure_url,)

    res.status(200).json({
      success: true,
      message: `${tasks.length} task(s) assigned to agent successfully and email sent`,
      data: tasks
    });
  } catch (err) {
    console.error("Assign tasks error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

const getAgentsWithCompletedTasks = async (req, res) => {
  try {
    const {
      fullName,
      email,
      startDate,
      endDate,
    } = req.query;


    // Base filter: only verified agents
    const agentFilter = { isVerified: true };

    if (fullName) {
      agentFilter.fullName = { $regex: fullName, $options: "i" };
    }

    if (email) {
      agentFilter.email = { $regex: email, $options: "i" };
    }

    const agents = await Agent.find(agentFilter).lean();

    const agentIds = agents.map(agent => agent._id);

    // Filter completed tasks by these agentIds and date range
    const taskMatch = {
      agentId: { $in: agentIds },
      status: "completed",
    };

    if (startDate || endDate) {
      taskMatch.createdAt = {};
      if (startDate) {
        taskMatch.createdAt.$gte = new Date(startDate).setHours(0, 0, 0, 0);
      }
      if (endDate) {
        taskMatch.createdAt.$lte = new Date(endDate).setHours(23, 59, 59, 999);
      }
    }

    // Group tasks to count completed per agent
    const taskCounts = await Task.aggregate([
      { $match: taskMatch },
      {
        $group: {
          _id: "$agentId",
          completedTaskCount: { $sum: 1 }
        }
      }
    ]);

    const taskCountMap = taskCounts.reduce((acc, cur) => {
      acc[cur._id.toString()] = cur.completedTaskCount;
      return acc;
    }, {});

    // Filter verified agents who have completed tasks
    const verifiedAgentsWithTasks = agents.map(agent => ({
    id: agent._id,
    fullName: agent.fullName,
    email: agent.email,
    phoneNumber: agent.phoneNumber,
    teamName: agent.teamName,
    profileImage: agent.profileImage,
    isVerified: agent.isVerified,
    completedTaskCount: taskCountMap[agent._id.toString()] || 0,
  }));

    res.status(200).json({
      success: true,
      message: "Verified agents with completed task count retrieved successfully",
      totalAgents: verifiedAgentsWithTasks.length,
      data: verifiedAgentsWithTasks
    });

  } catch (err) {
    console.error("Error fetching verified agents:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

const getClientsWithTaskUploads = async (req, res) => {
  try {
    const {
      companyName,
      email,
      startDate,
      endDate
    } = req.query;


    const clientFilter = {};

    if (companyName) {
      clientFilter.companyName = { $regex: companyName, $options: "i" }; // case-insensitive
    }

    if (email) {
      clientFilter.email = { $regex: email, $options: "i" };
    }

    const [clients, totalClients] = await Promise.all([
      Client.find(clientFilter).lean(),
      Client.countDocuments(clientFilter)
    ]);

    const clientIds = clients.map(c => c._id);

    const uploadFilter = { clientId: { $in: clientIds } };

    if (startDate || endDate) {
      uploadFilter.uploadedAt = {};
      if (startDate) {
        uploadFilter.uploadedAt.$gte = new Date(startDate).setHours(0, 0, 0, 0);
      }
      if (endDate) {
        uploadFilter.uploadedAt.$lte = new Date(endDate).setHours(23, 59, 59, 999);
      }
    }

    const uploads = await TaskUpload.find(uploadFilter).lean();

    const uploadsByClient = uploads.reduce((acc, upload) => {
      const id = upload.clientId.toString();
      if (!acc[id]) acc[id] = [];
      acc[id].push({
        taskUrl: upload.taskUrl,
        uploadedAt: upload.uploadedAt,
      });
      return acc;
    }, {});

    const result = clients.map(client => ({
      id:client._id,
      companyName: client.companyName,
      email: client.email,
      uploaderName: client.uploaderName,
      uploaderPhone: client.uploaderPhone,
      taskUploads: uploadsByClient[client._id.toString()] || []
    }));

    res.status(200).json({
      success: true,
      message: "Filtered clients and uploaded tasks retrieved",
      totalClients,
      data: result
    });

  } catch (err) {
    console.error("Error retrieving clients with uploads:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};



const getClientMonthlySummary = async (req, res) => {
  try {
    const clientId = new mongoose.Types.ObjectId(req.query.clientId);
    const startMonth = parseInt(req.query.startMonth) || new Date().getMonth() + 1; // default: current month

    const startOfYear = new Date(new Date().getFullYear(), 0, 1);

    const tasks = await Task.find({
      clientId,
      createdAt: { $gte: startOfYear }
    });

    const summaryMap = {};

    // Initialize month buckets from startMonth to December
    for (let month = startMonth; month <= 12; month++) {
      const monthName = new Date(0, month - 1).toLocaleString("default", { month: "long" });
      summaryMap[monthName] = {
        month,
        totalTasks: 0,
        totalReports: 0,
        approvedReports: 0,
        unapprovedReports: 0,
        overdueTasks: 0
      };
    }

    // Populate actual data
    for (const task of tasks) {
      const taskMonth = task.createdAt.getMonth() + 1;

      if (taskMonth >= startMonth) {
        const monthName = new Date(0, taskMonth - 1).toLocaleString("default", { month: "long" });
        const summary = summaryMap[monthName];

        summary.totalTasks += 1;

        if (task.feedback?.visitFeedback) {
          summary.totalReports += 1;
          if (task.reportIsApproved) summary.approvedReports += 1;
          else summary.unapprovedReports += 1;
        }

        if (task.status === "over-due") {
          summary.overdueTasks += 1;
        }
      }
    }

    // Convert to array
    const summaryArray = Object.entries(summaryMap).map(([monthName, data]) => ({
      month: monthName,
      ...data
    }));

    const monthNames = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const formattedResult = summaryArray.map((item) => ({
  month: monthNames[item.month - 1], // Convert number to month name
  totalTasks: item.totalTasks,
  totalReports: item.totalReports,
  approvedReports: item.approvedReports,
  unapprovedReports: item.unapprovedReports,
  overdueTasks: item.overdueTasks
}));


    res.status(200).json({
      success: true,
      message: "Monthly summary fetched successfully",
      data: formattedResult
    });
  } catch (err) {
    console.error("Client monthly summary error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};



const getDashboardStats = async (req, res) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [totalTasks, assignedTasks, overdueTasks, pendingTasks, verifiedTasks, agentCount, taskFiles] = await Promise.all([
      Task.countDocuments({ createdAt: { $gte: startOfMonth } }),
      Task.countDocuments({status:"assigned" , createdAt: { $gte: startOfMonth }}),
      Task.countDocuments({status:"over-due" , createdAt: { $gte: startOfMonth }}),
      Task.countDocuments({ status:"pending", createdAt: { $gte: startOfMonth } }),
      Task.countDocuments({ status:"completed", createdAt: { $gte: startOfMonth }}),
      Agent.countDocuments(),
      TaskUpload
          .find()
          .select("fileName taskUrl uploadedAt status")
          .sort({ uploadedAt:-1})
    ]);

    return res.status(200).json({
      success: true,
      data: {
        totalTasks,
        assignedTasks,
        overdueTasks,
        pendingTasks,
        verifiedTasks,
        agentCount,
        taskFiles
      },
    });
  } catch (err) {
    console.error("Dashboard stats error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};


const getTaskSummaryByMonth = async (req, res) => {
  try {
    const now = new Date();
    const currentMonth = now.getMonth() + 1; // 1-based
    const startMonth = parseInt(req.query.startMonth) || currentMonth;
    const year = parseInt(req.query.year) || now.getFullYear();

    const startDate = new Date(`${year}-${String(startMonth).padStart(2, '0')}-01`);
    const endDate = new Date(`${year}-12-31T23:59:59.999Z`);

    const monthNames = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
    ];

    const pipeline = [
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $addFields: {
          month: { $month: "$createdAt" },
          year: { $year: "$createdAt" }
        }
      },
      {
        $group: {
          _id: { month: "$month", year: "$year" },
          totalTasks: { $sum: 1 },
          assignedTasks: {
            $sum: { $cond: [{ $eq: ["$status", "assigned"] }, 1, 0] }
          },
          pendingRequests: {
            $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] }
          },
          incompleteRequests: {
            $sum: { $cond: [{ $eq: ["$status", "incomplete"] }, 1, 0] }
          },
          tat: {
            $sum: { $cond: [{ $ne: ["$status", "over-due"] }, 1, 0] }
          },
          otat: {
            $sum: { $cond: [{ $eq: ["$status", "over-due"] }, 1, 0] }
          },
          passReports: {
            $sum: { $cond: [{ $eq: ["$feedback.customerKnown", "Yes"] }, 1, 0] }
          },
          failReports: {
            $sum: { $cond: [{ $eq: ["$feedback.customerKnown", "No"] }, 1, 0] }
          }
        }
      }
    ];

    const aggregated = await Task.aggregate(pipeline);

    // Convert aggregation result to lookup object
    const lookup = {};
    aggregated.forEach(item => {
      lookup[item._id.month] = {
        totalTasks: item.totalTasks,
        assignedTasks: item.assignedTasks,
        pendingRequests: item.pendingRequests,
        incompleteRequests: item.incompleteRequests,
        tat: item.tat,
        otat: item.otat,
        passReports: item.passReports,
        failReports: item.failReports
      };
    });

    const result = [];
    for (let month = startMonth; month <= 12; month++) {
      result.push({
        month: monthNames[month - 1],
        year,
        totalTasks: lookup[month]?.totalTasks || 0,
        assignedTasks: lookup[month]?.assignedTasks || 0,
        pendingRequests: lookup[month]?.pendingRequests || 0,
        incompleteRequests: lookup[month]?.incompleteRequests || 0,
        tat: lookup[month]?.tat || 0,
        otat: lookup[month]?.otat || 0,
        passReports: lookup[month]?.passReports || 0,
        failReports: lookup[month]?.failReports || 0
      });
    }

    res.status(200).json({ success: true, data: result });
  } catch (error) {
    console.error("Error getting task summary:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};


// const getDashboardStats = async (req, res) => {
//   try {
//     const today = new Date();
//     today.setHours(0, 0, 0, 0);

//     const startOfWeek = new Date(today);
//     startOfWeek.setDate(today.getDate() - today.getDay()); // Sunday

//     const [todaysTasks, currentWeekTasks, completedTasks, incompleteTasks, failedTasks, inProgressTasks, verifiedAgents, notVerifiedAgents, agentComplaints, clientComplaints, taskFiles] = await Promise.all([
//       Task.countDocuments({ createdAt: { $gte: today } }),
//       Task.countDocuments({ createdAt: { $gte: startOfWeek } }),
//       Task.countDocuments({ status: "completed" }),
//       Task.countDocuments({ status: "incomplete" }),
//       Task.countDocuments({ status: "pending" }),
//       Task.countDocuments({ status: "in-progress" }),
//       Agent.countDocuments({ isVerified: true }),
//       Agent.countDocuments({ isVerified: false }),
//       Complaint.countDocuments({ role: "agent" }),
//       Complaint.countDocuments({ role: "client" }),
//       TaskUpload
//           .find()
//           .select("fileName taskUrl uploadedAt status")
//           .sort({ uploadedAt:-1})
//     ]);



//     res.status(200).json({
//       success: true,
//       data: {
//         todaysTasks,
//         currentWeekTasks,
//         completedTasks,
//         incompleteTasks,
//         failedTasks,
//         inProgressTasks,
//         verifiedAgents,
//         notVerifiedAgents,
//         agentComplaints,
//         clientComplaints,
//         taskFiles
//       }
//     });

//   } catch (err) {
//     console.error("Dashboard stats error:", err);
//     res.status(500).json({ success: false, message: "Server error" });
//   }
// };

const fetchComplaints = async (req, res) => {
  try {
    const {
      status,
      subject
    } = req.query;


    const filter = {};

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
        .limit(20),
      Complaint.countDocuments(filter)
    ]);

    res.status(200).json({
      success: true,
      message: "Complaints fetched successfully",
      totalComplaints: total,
      data: complaints
    });

  } catch (err) {
    console.error("Fetch complaints error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

const viewComplaint = async (req, res) => {
  try {
    const complaintId = new mongoose.Types.ObjectId(req.params.complaintId) ;

    const openedComplaint = await Complaint.findById(complaintId);

    if (!openedComplaint) {
      return res.status(404).json({
        success: false,
        message: "Complaint not found."
      });
    }

    if(openedComplaint.status == "in-review"){
      openedComplaint.status = "opened"
      await openedComplaint.save()
    }

    return res.status(200).json({
      success: true,
      message: "Complaint viewed successfully.",
      data:openedComplaint
    });

  } catch (err) {
    console.error("Complaint status error:", err);
    return res.status(500).json({
      success: false,
      message: err.message
    });
  }
};



const sendNotification = async (req, res) => {
  try {
    const { recipientRole, recipientId, type, title, body, complaintId } = req.body;

    if (!["agent", "client"].includes(recipientRole)) {
      return res.status(400).json({ success: false, message: "Invalid recipient role" });
    }

    if (!["message", "report", "complaint resolution"].includes(type)) {
      return res.status(400).json({ success: false, message: "Invalid notification type" });
    }

    if (type === "complaint resolution" && !complaintId) {
      return res.status(400).json({ success: false, message: "Complaint ID is required for complaint resolution type" });
    }

    if (type === "complaint resolution") {
      const complaint = await Complaint.findByIdAndUpdate(
      complaintId,
      {status:"resolved"},
      { new: true }
     );
      if (!complaint) {
        return res.status(404).json({ success: false, message: "Complaint not found" });
      }
    }

    const notification = await Notification.create({
      recipientRole:recipientRole=="agent"? "Agent": "Client",
      recipientId,
      type,
      title,
      body,
      complaintId: type === "complaint resolution" ? complaintId : undefined,
    });

    res.status(201).json({ success: true, message: "Notification sent", data: notification });

  } catch (err) {
    console.error("Send notification error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};


const updateFileStatus = async (req, res) => {
  try {
    const { fileId } = req.params;
    const { decision } = req.body;

    const validStatuses = ["pending", "in-progress", "verified"];
    if (!validStatuses.includes(decision)) {
      return res.status(400).json({
        success: false,
        message: "Invalid decision value. Must be one of: pending, in-progress, verified."
      });
    }

    const updatedTask = await TaskUpload.findByIdAndUpdate(
      fileId,
      { status:decision },
      { new: true }
    );

    if (!updatedTask) {
      return res.status(404).json({
        success: false,
        message: "TaskFileUpload not found."
      });
    }

    return res.status(200).json({
      success: true,
      message: "Task File upload status updated successfully.",
      data: updatedTask
    });

  } catch (err) {
    console.error("Update task upload status error:", err);
    return res.status(500).json({
      success: false,
      message: err.message
    });
  }
};


const deleteFileUpload = async (req, res) => {
  try {
    const fileId = new mongoose.Types.ObjectId(req.params.fileId)

    const deletedTask = await TaskUpload.findByIdAndDelete(fileId);

    if (!deletedTask) {
      return res.status(404).json({
        success: false,
        message: "TaskUpload not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "TaskUpload deleted successfully.",
    });

  } catch (err) {
    console.error("Delete task upload error:", err);
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

const deleteTask = async (req, res) => {
  try {
    const taskId = new mongoose.Types.ObjectId(req.params.taskId)

    const deletableTask = await Task.findById(taskId);

    if (!deletableTask) {
      return res.status(404).json({
        success: false,
        message: "Task not found.",
      });
    }

    if(deletableTask == "in-progress"){
       return res.status(400).json({
        success: false,
        message: "You can't delete a task in progress.",
      });
    }

    await Task.findByIdAndDelete(taskId);


    return res.status(200).json({
      success: true,
      message: "Task deleted successfully.",
    });

  } catch (err) {
    console.error("Delete task error:", err);
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

const approveTaskReport = async (req, res) => {
  try {
    const { taskIds } = req.body; 

    if (!Array.isArray(taskIds) || taskIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "taskIds must be a non-empty array.",
      });
    }

    const results = {
      approved: [],
      notFound: [],
      failed: []
    };

    for (const id of taskIds) {
      try {
        const taskId = new mongoose.Types.ObjectId(id);
        const task = await Task.findById(taskId);

        if (!task) {
          results.notFound.push(id);
          continue;
        }

        task.reportIsApproved = true;
        await task.save();

        if (task.clientId.integration?.integrationEnabled) {
          await pushTaskResultToClient(
            task,
            await Client.findById(task.clientId)
          );
        }

        results.approved.push(id);
      } catch (err) {
        console.error(`Failed to approve report for task ${id}:`, err);
        results.failed.push({ id, error: err.message });
      }
    }

    return res.status(200).json({
      success: true,
      message: "Task report approval completed.",
      results
    });

  } catch (err) {
    console.error("Mass report approval error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error.",
    });
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

    const task = await Task.findById(taskId);

    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Task not found.",
      });
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
    task.reportIsApproved = true;

    await task.save();

    await pushTaskResultToClient(
      task,
      await Client.findById(task.clientId)
    );

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

const autoRejectTask = async (req, res) => {
  try {
    const taskId = new mongoose.Types.ObjectId(req.params.taskId);
    const { comments } = req.body;

    if (!comments || typeof comments !== "string" || comments.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Rejection reason (comments) is required.",
      });
    }

    const task = await Task.findById(taskId);

    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Task not found.",
      });
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
    task.reportIsApproved = true;

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




const getAnalytics = async (req, res) => {
  try {
    const [totalPending, totalVerified] = await Promise.all([
      Task.countDocuments({status: "pending" }),
      Task.countDocuments({status: "completed" }),
    ]);

    // 2. Monthly breakdown
    const startOfYear = new Date(new Date().getFullYear(), 0, 1);
    const endOfYear = new Date(new Date().getFullYear(), 11, 31, 23, 59, 59, 999);

    const monthlyAggregation = await Task.aggregate([
      {
        $match: {
          createdAt: { $gte: startOfYear, $lte: endOfYear },
          status: { $in: ["pending", "completed"] }
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
    ]);

    // Month map
    const monthNames = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
    ];

    // Initialize all 12 months
    const monthlyStats = monthNames.map((name, index) => ({
      month: name,
      pending: 0,
      verified: 0,
      total: 0
    }));

    // Fill counts
    monthlyAggregation.forEach(({ _id, count }) => {
      const idx = _id.month - 1;
      if (_id.status === "pending") monthlyStats[idx].pending += count;
      if (_id.status === "completed") monthlyStats[idx].verified += count;
      monthlyStats[idx].total += count;
    });
    
    res.status(200).json({
      success: true,
      data: {
        totalRequest:totalPending + totalVerified,
        totalPending,
        totalVerified,
        monthlyTasks: monthlyStats // for graph
      }
    });

  } catch (err) {
    console.error("Analytics error:", err);
    res.status(500).json({ success: false, message:err.message });
  }
};






// Helper to calculate distance (Haversine formula in meters)
const getDistanceInMeters = (coord1, coord2) => {
  const toRad = (value) => (value * Math.PI) / 180;

  const R = 6371000; // Earth radius in meters
  const dLat = toRad(coord2.lat - coord1.lat);
  const dLng = toRad(coord2.lng - coord1.lng);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(coord1.lat)) *
      Math.cos(toRad(coord2.lat)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // distance in meters
};

const verifyTaskAddress = async (req, res) => {
  try {
    const taskId = new mongoose.Types.ObjectId(req.params.taskId) 

    // Find task
    const task = await Task.findById(taskId);
    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Task not found",
      });
    }

    if (!task.feedback || !task.feedback.geoMapping) {
      return res.status(400).json({
        success: false,
        message: "No geoMapping submitted by agent yet",
      });
    }

    const submittedCoords = task.feedback.geoMapping;

    // Step 1: Geocode the verificationAddress to get actual coordinates
    const apiKey = process.env.GOOGLE_MAPS_API_KEY; // put in .env
    const geoRes = await axios.get(
      `https://maps.googleapis.com/maps/api/geocode/json`,
      {
        params: {
          address: `${task.verificationAddress} ${task.city}, ${task.state}, Nigeria`,
          key: apiKey,
        },
      }
    );

    if (!geoRes.data.results.length) {
      return res.status(400).json({
        success: false,
        message: "Unable to geocode verification address",
      });
    }

    const addressCoords = geoRes.data.results[0].geometry.location; // { lat, lng }

    // Step 2: Calculate distance
    const distance = getDistanceInMeters(submittedCoords, addressCoords);

    // Define radius threshold (e.g., 100 meters)
    const threshold = 100;

    const isMatch = distance <= threshold;

    res.status(200).json({
      success: true,
      message: "Verification check completed",
      verificationResult: {
        address: task.verificationAddress,
        submittedCoords,
        addressCoords,
        distanceInMeters: distance,
        threshold,
        isMatch,
      },
    });
  } catch (err) {
    console.error("Error verifying address:", err);
    res.status(500).json({
      success: false,
      message: "Server error verifying address",
    });
  }
};


const updateClientIntegration = async (req, res) => {
  try {
    const clientId = new mongoose.Types.ObjectId(req.params.clientId);

    const {
      avsEndpoint,
      subscriptionKey,
      vendorExternalId,
      integrationEnabled
    } = req.body;

    if (!avsEndpoint || !subscriptionKey || !vendorExternalId) {
      return res.status(400).json({
        success: false,
        message: "avsEndpoint, subscriptionKey and vendorExternalId are required"
      });
    }

    const client = await Client.findById(clientId);
    if (!client) {
      return res.status(404).json({
        success: false,
        message: "Client not found"
      });
    }

    client.integration = {
      avsEndpoint,
      subscriptionKey,
      vendorExternalId,
      integrationEnabled: Boolean(integrationEnabled)
    };

    await client.save();

    return res.status(200).json({
      success: true,
      message: "Client AVS integration configured successfully"
    });

  } catch (err) {
    console.error("Integration config error:", err);
    return res.status(500).json({
      success: false,
      message: err.message
    });
  }
};




module.exports = {
  listTasks,
  assignTask,
  assignTasksToAgent,
  getAgentsWithCompletedTasks,
  getClientsWithTaskUploads,
  getClientMonthlySummary,
  getDashboardStats,
  getTaskSummaryByMonth,
  fetchComplaints,
  viewComplaint,
  sendNotification,
  updateFileStatus,
  deleteFileUpload,
  deleteTask ,
  approveTaskReport,
  rejectTask,
  getAnalytics,
  verifyTaskAddress,
  updateClientIntegration
};
