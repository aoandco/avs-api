const Client = require("../model/Client");
const Task = require("../model/Task");
const { createTaskSchema } = require("../util/validationSchemas");
const { v4: uuidv4 } = require("uuid");
const cloudinary = require("../config/cloudinary");
const { updateClientProfileSchema } = require("../util/validationSchemas");
const XLSX = require("xlsx");
const fs = require("fs/promises");
const TaskUpload = require("../model/TaskUpload");
const Complaint = require("../model/Complaint");
const Notification = require("../model/Notification");
const mongoose = require("mongoose");
const mime = require("mime-types")
const { generateApiKey, hashApiKey } = require("../util/generateApiKey");

const generateClientApiKey = async (req, res) => {
  try {
    const clientId = req.user.id; // from JWT middleware

    const client = await Client.findById(clientId);
    if (!client) {
      return res.status(404).json({ success: false, message: "Client not found" });
    }

    const apiKey = generateApiKey();
    const hashedKey = hashApiKey(apiKey);

    client.apiKeyHash = hashedKey;
    client.apiKeyCreatedAt = new Date();
    await client.save();

    return res.status(201).json({
      success: true,
      message: "API key generated successfully",
      data: {
        apiKey, 
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};


const updateClientProfile = async (req, res) => {
  try {
    const { error, value } = updateClientProfileSchema.validate(req.body);
    if (error) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Validation failed",
          errors: error.details,
        });
    }

    const client = await Client.findById(req.user.id);
    if (!client) {
      return res
        .status(404)
        .json({ success: false, message: "Client not found" });
    }

    const fields = ["companyName", "uploaderName", "uploaderPhone"];
    fields.forEach((field) => {
      if (value[field]) client[field] = value[field];
    });

    if (req.file) {
      // Upload profile image to Cloudinary
      const result = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder: "clients/profileImages",
            resource_type: "image",
          },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        );
        stream.end(req.file.buffer);
      });

      client.profileImage = result.secure_url;
    }

    await client.save();

    res.status(200).json({
      success: true,
      message: "Client profile updated successfully",
      data: {
        companyName: client.companyName,
        uploaderName: client.uploaderName,
        uploaderPhone: client.uploaderPhone,
        profileImage: client.profileImage,
      },
    });
  } catch (err) {
    console.error("Client update error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

const uploadTasksFromExcel = async (req, res) => {
  try {
    const clientId = req.user.id;
    const filePath = req.file.path;
    const originalFileName = req.file.originalname;

    const extension = mime.extension(req.file.mimetype);
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e4);
    const fileName = `upload-${uniqueSuffix}.${extension}`;
    
    // 1. Upload the Excel sheet to Cloudinary
    const cloudinaryRes = await cloudinary.uploader.upload(filePath, {
      public_id:fileName,
      folder: "tasks/excel",
      resource_type: "raw", 
      type: "upload",
    });

    const taskUrl = cloudinaryRes.secure_url;

    // 2. Store the uploaded Excel file URL
    await TaskUpload.create({
      clientId,
      taskUrl,
      fileName:originalFileName,
    });

    // 3. Read the file
    const workbook = XLSX.readFile(filePath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);

    const tasks = [];

    for (const row of rows) {
      const mapped = {
        customerName: row["Customer Name"]?.trim(),
        activityId: row["Activity ID"]?.toString().trim(),
        verificationAddress: row["Verification Address"]?.trim(),
        state: row["State"]?.trim(),
        city: row["City"]?.trim(),
      };

      // Basic validation (skip invalid rows)
      if (
        !mapped.customerName ||
        !mapped.activityId ||
        !mapped.verificationAddress ||
        !mapped.state ||
        !mapped.city
      )
        continue;

      tasks.push({
        clientId,
        ...mapped,
      });
    }

    // 4. Save to DB
    await Task.insertMany(tasks);

    // 5. Cleanup
    await fs.unlink(filePath);

    res.status(200).json({
      success: true,
      message: "Tasks created and file uploaded successfully",
      totalTasks: tasks.length,
      taskUrl,
    });
  } catch (err) {
    console.error("Excel upload error:", err);
    res.status(500).json({ success: false, message: err.message });
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
      role: role == "agent" ? "Agent" : "Client",
      userId,
      complaintID,
      subject,
      message,
    });

    res.status(201).json({
      success: true,
      message: "Complaint submitted successfully",
      data: newComplaint,
    });
  } catch (err) {
    console.error("Submit complaint error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

const fetchComplaints = async (req, res) => {
  try {
    const id = req.user.id;
    const { status, search } = req.query;

    const filter = { userId: id };

    if (status && ["in-review", "opened", "resolved"].includes(status)) {
      filter.status = status;
    }

    if (search) {
      filter.$or = [{ subject: { $regex: search, $options: "i" } }];
    }

    const [complaints, total] = await Promise.all([
      Complaint.find(filter)
        .populate("userId", "fullName email") // populates either Agent or Client depending on role
        .sort({ createdAt: -1 }),

      Complaint.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      message: "Complaints fetched successfully",
      totalComplaints: total,
      data: complaints,
    });
  } catch (err) {
    console.error("Fetch complaints error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

const getAllNotifications = async (req, res) => {
  try {
    const userId = req.user.id;
    const role = req.user.role;
    const { type, search } = req.query;

    const normalizedRole = role === "client" ? "Client" : "Agent";

    const queryFilter = {
      recipientRole: normalizedRole,
      recipientId: userId,
    };

    if (type && ["message", "report", "complaint resolution"].includes(type)) {
      queryFilter.type = type;
    }

    if (search) {
      queryFilter.$or = [{ title: { $regex: search, $options: "i" } }];
    }

    // === 1. Paginated result
    const notifications = await Notification.find(queryFilter).sort({
      createdAt: -1,
    });

    // === 2. Total for pagination
    const totalCount = await Notification.countDocuments(queryFilter);

    // === 3. Count by type (regardless of filter)
    const counts = await Notification.aggregate([
      {
        $match: {
          recipientRole: normalizedRole,
          recipientId:new mongoose.Types.ObjectId(userId),
        },
      },
      {
        $group: {
          _id: "$type",
          count: { $sum: 1 },
        },
      },
    ]);

    const countMap = {
      message: 0,
      report: 0,
      "complaint resolution": 0,
    };

    counts.forEach((item) => {
      countMap[item._id] = item.count;
    });

    res.status(200).json({
      success: true,
      message: "Notifications retrieved",
      total: totalCount,
      counts: countMap,
      data: notifications,
    });
  } catch (err) {
    console.error("Fetch notifications error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

const getDashboardStats = async (req, res) => {
  try {
    const clientId = req.user.id;

    let [
      totalPendingFiles,
      totalVerifiedFiles,
      totalComplaints,
      taskFiles,
      reportTasks,
    ] = await Promise.all([
      TaskUpload.countDocuments({ clientId, status: "pending" }),
      TaskUpload.countDocuments({ clientId, status: "completed" }),
      Complaint.countDocuments({ userId: clientId }),
      TaskUpload.find({ clientId })
        .select("fileName uploadedAt status")
        .sort({ uploadedAt: -1 }),

      Task.find({ 
        clientId,
        "feedback.reportUrl": { $ne: null },
        reportIsApproved: true
        })
        .sort({ createdAt: -1 })
        .select(`
          activityId 
          customerName 
          verificationAddress 
          state 
          feedback.addressExistence 
          feedback.addressResidential 
          feedback.customerResident 
          feedback.customerKnown 
          feedback.metWith 
          feedback.nameOfPersonMet 
          feedback.easeOfLocation 
          feedback.comments 
          feedback.additionalComments 
          feedback.relatioshipWithCustomer 
          feedback.customerRelationshipWithAddress 
          feedback.buildingColor 
          feedback.buildingType 
          feedback.areaProfile 
          feedback.landMark 
          feedback.receivedDate 
          feedback.personMetOthers 
          feedback.visitFeedback 
          feedback.geoMapping 
          feedback.geotaggedImages 
          feedback.recordedAudio 
          feedback.recordedVideo 
          feedback.reportUrl
        `)
    ]);

    const [totalPending, totalVerified] = await Promise.all([
      Task.countDocuments({ clientId, status: "pending" }),
      Task.countDocuments({ clientId, status: "completed" }),
    ]);

    // Monthly breakdown
    const startOfYear = new Date(new Date().getFullYear(), 0, 1);
    const endOfYear = new Date(
      new Date().getFullYear(),
      11,
      31,
      23,
      59,
      59,
      999
    );

    const monthlyAggregation = await Task.aggregate([
      {
        $match: {
          clientId: new mongoose.Types.ObjectId(clientId),
          createdAt: { $gte: startOfYear, $lte: endOfYear },
          status: { $in: ["pending", "completed"] },
        },
      },
      {
        $group: {
          _id: {
            month: { $month: "$createdAt" },
            status: "$status",
          },
          count: { $sum: 1 },
        },
      },
    ]);

    const monthNames = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];

    const monthlyStats = monthNames.map((name, index) => ({
      month: name,
      pending: 0,
      verified: 0,
      total: 0,
    }));

    monthlyAggregation.forEach(({ _id, count }) => {
      const idx = _id.month - 1;
      if (_id.status === "pending") monthlyStats[idx].pending += count;
      if (_id.status === "completed") monthlyStats[idx].verified += count;
      monthlyStats[idx].total += count;
    });


    const formattedTasks = reportTasks.map(task => {
  const { activityId, customerName, verificationAddress, state, feedback = {} } = task;

  const {
    addressExistence,
    addressResidential,
    customerResident,
    customerKnown,
    metWith,
    nameOfPersonMet,
    easeOfLocation,
    comments,
    additionalComments,
    relatioshipWithCustomer,
    customerRelationshipWithAddress,
    buildingColor,
    buildingType,
    areaProfile,
    landMark,
    receivedDate,
    personMetOthers,
    visitFeedback,
    reportUrl,
    recordedAudio,
    recordedVideo,
    geoMapping = {},
    geotaggedImages = []
  } = feedback;

  const { lat, lng } = geoMapping;

  // Use first geotagged image or null
  const firstImage = geotaggedImages[0] || null;
  const secondImage = geotaggedImages[1] || null;

  return {
    activityId,
    customerName,
    verificationAddress,
    state,
    addressExistence,
    addressResidential,
    customerResident,
    customerKnown,
    metWith,
    nameOfPersonMet,
    easeOfLocation,
    comments,
    additionalComments,
    relatioshipWithCustomer,
    customerRelationshipWithAddress,
    buildingColor,
    buildingType,
    areaProfile,
    landMark,
    receivedDate,
    personMetOthers,
    visitFeedback,
    recordedAudio,
    recordedVideo,
    latitude: lat,
    longitude: lng,
    firstGeotaggedImage: firstImage,
    firstGeotaggedImage:secondImage,
    reportUrl,
  };
});


    res.status(200).json({
      success: true,
      data: {
        totalPendingFiles,
        totalVerifiedFiles,
        totalComplaints,
        uploads: taskFiles, // For the table
        reports: formattedTasks, 
        totalRequest: totalPending + totalVerified,
        totalPending,
        totalVerified,
        monthlyTasks: monthlyStats, // For graph
      },
    });
  } catch (err) {
    console.error("Dashboard stats error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

const getAllUploads = async (req, res) => {
  try {
    const clientId = req.user.id;
    let { filterStatus } = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    let query = { clientId };
    if (filterStatus) {
      query.status = filterStatus;
    }

    if (
      filterStatus &&
      !["pending", "in-progress", "verified"].includes(filterStatus)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid status",
      });
    }

    const { taskUploads, total } = await Promise.all([
      TaskUpload.find(query)
        .populate("clientId")
        .sort({ uploadedAt: -1 })
        .skip(skip)
        .limit(limit),

      TaskUpload.countDocuments(query),
    ]);


    res.status(200).json({
      success: true,
      currentPage: parseInt(page),
      totalPages: Math.ceil(total / limit),
      totalUploads: total,
      data: taskUploads,
    });
  } catch (err) {
    console.error("Uploads retrieving error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

const getAnalytics = async (req, res) => {
  try {
    const clientId = req.user.id;

    const [totalPending, totalVerified] = await Promise.all([
      Task.countDocuments({ clientId, status: "pending" }),
      Task.countDocuments({ clientId, status: "completed" }),
    ]);

    // 2. Monthly breakdown
    const startOfYear = new Date(new Date().getFullYear(), 0, 1);
    const endOfYear = new Date(
      new Date().getFullYear(),
      11,
      31,
      23,
      59,
      59,
      999
    );

    const monthlyAggregation = await Task.aggregate([
      {
        $match: {
          createdAt: { $gte: startOfYear, $lte: endOfYear },
          status: { $in: ["pending", "completed"] },
        },
      },
      {
        $group: {
          _id: {
            month: { $month: "$createdAt" },
            status: "$status",
          },
          count: { $sum: 1 },
        },
      },
    ]);

    // Month map
    const monthNames = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];

    // Initialize all 12 months
    const monthlyStats = monthNames.map((name, index) => ({
      month: name,
      pending: 0,
      verified: 0,
      total: 0,
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
        totalRequest: totalPending + totalVerified,
        totalPending,
        totalVerified,
        monthlyTasks: monthlyStats, // for graph
      },
    });
  } catch (err) {
    console.error("Analytics error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};



const submitAddressVerification = async (req, res) => {
  try {
    const { addressVerificationResponses } = req.body;

    if (!Array.isArray(addressVerificationResponses) || !addressVerificationResponses.length) {
      return res.status(400).json({
        success: false,
        message: "addressVerificationResponses is required"
      });
    }

    const tasks = [];

    for (const item of addressVerificationResponses) {
    const exists = await Task.findOne({ activityId: item.activityId });

    if (exists) {
      results.duplicates.push(item.activityId);
      continue;
    }

    const address = item.address;

    tasks.push({
      clientId: req.client._id,
      activityId: item.activityId,
      customerName: item.customerName,

      address,

      verificationAddress: [
        address.street,
        address.area,
        address.city,
        address.state,
        address.country
      ]
        .filter(Boolean)
        .join(", "),

      status: "pending"
    });

  }

    await Task.insertMany(tasks, { ordered: false });

    return res.status(200).json({
      status: "success",
      message: "AVR request submitted successfully",
      requestId: tasks.map(t => t.activityId)
    });

  } catch (err) {
    console.error("AVS ingestion error:", err);
    return res.status(500).json({
      status: "error",
      message: err.message
    });
  }
};


module.exports = {
  generateClientApiKey,
  updateClientProfile,
  uploadTasksFromExcel,
  submitComplaint,
  fetchComplaints,
  getAllNotifications,
  getDashboardStats,
  getAllUploads,
  getAnalytics,

  submitAddressVerification
};
