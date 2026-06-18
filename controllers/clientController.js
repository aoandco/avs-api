const Client = require("../model/Client");
const Task = require("../model/Task");
const { createTaskSchema, addressVerificationRequestSchema } = require("../util/validationSchemas");
const { v4: uuidv4 } = require("uuid");
const cloudinary = require("../config/cloudinary");
const { updateClientProfileSchema } = require("../util/validationSchemas");
const XLSX = require("xlsx");
const axios = require("axios");
const fs = require("fs/promises");
const TaskUpload = require("../model/TaskUpload");
const Complaint = require("../model/Complaint");
const Notification = require("../model/Notification");
const mongoose = require("mongoose");
const mime = require("mime-types")
const { generateApiKey, hashApiKey } = require("../util/generateApiKey");
const {
  formatApprovedReportTask,
  APPROVED_REPORT_TASK_SELECT,
} = require("../util/formatApprovedReport");

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

const getExcelCell = (row, ...keys) => {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return undefined;
};

function extractActivityIdsFromExcelRows(rows) {
  const activityIds = [];

  for (const row of rows) {
    const activityId = getExcelCell(
      row,
      "Activity id",
      "Activity Id",
      "ActivityID",
      "activityId"
    );
    if (activityId) {
      activityIds.push(activityId);
    }
  }

  return activityIds;
}

async function resolveUploadActivityIds(upload) {
  if (upload.activityIds?.length) {
    return upload.activityIds;
  }

  if (!upload.taskUrl) {
    return [];
  }

  try {
    const response = await axios.get(upload.taskUrl, {
      responseType: "arraybuffer",
    });
    const workbook = XLSX.read(response.data, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);
    const activityIds = extractActivityIdsFromExcelRows(rows);

    if (activityIds.length) {
      await TaskUpload.updateOne(
        { _id: upload._id },
        { $set: { activityIds } }
      );
    }

    return activityIds;
  } catch (err) {
    console.error("Failed to resolve upload activity IDs:", err);
    return [];
  }
}

async function applyTaskUploadFilter(filter, uploads) {
  if (!uploads.length) {
    return false;
  }

  const activityIdSets = await Promise.all(
    uploads.map((upload) => resolveUploadActivityIds(upload))
  );
  const activityIds = [...new Set(activityIdSets.flat())];
  const uploadIds = uploads.map((upload) => upload._id);
  const uploadMatch = [];

  if (uploadIds.length) {
    uploadMatch.push({ taskUploadId: { $in: uploadIds } });
  }

  if (activityIds.length) {
    uploadMatch.push({ activityId: { $in: activityIds } });
  }

  if (!uploadMatch.length) {
    return false;
  }

  if (uploadMatch.length === 1) {
    Object.assign(filter, uploadMatch[0]);
    return true;
  }

  filter.$or = uploadMatch;
  return true;
}

function applyDateRangeFilter(filter, startDate, endDate, field) {
  if (!startDate && !endDate) {
    return null;
  }

  const range = {};

  if (startDate) {
    const start = new Date(startDate);
    if (Number.isNaN(start.getTime())) {
      return { error: "Invalid startDate." };
    }
    start.setUTCHours(0, 0, 0, 0);
    range.$gte = start;
  }

  if (endDate) {
    const end = new Date(endDate);
    if (Number.isNaN(end.getTime())) {
      return { error: "Invalid endDate." };
    }
    end.setUTCHours(23, 59, 59, 999);
    range.$lte = end;
  }

  if (range.$gte && range.$lte && range.$gte.getTime() > range.$lte.getTime()) {
    return { error: "startDate cannot be after endDate." };
  }

  filter[field] = range;
  return null;
}

function resolveApprovedReportsDateField(dateFilter) {
  const normalized = String(dateFilter || "taskCreated").trim().toLowerCase();

  if (
    normalized === "taskcreated" ||
    normalized === "task_created" ||
    normalized === "createdat"
  ) {
    return { field: "createdAt" };
  }

  if (
    normalized === "reportcreated" ||
    normalized === "report_created" ||
    normalized === "receiveddate"
  ) {
    return { field: "feedback.receivedDate" };
  }

  return {
    error: 'Invalid dateFilter. Use "taskCreated" or "reportCreated".',
  };
}

function applyDirectSubmissionFilter(filter) {
  filter.$or = [{ taskUploadId: null }, { taskUploadId: { $exists: false } }];
}

const uploadTasksFromExcel = async (req, res) => {
  try {
    const clientId = req.user.id;
    const filePath = req.file.path;
    const originalFileName = req.file.originalname;

    const extension = mime.extension(req.file.mimetype);
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e4);
    const fileName = `upload-${uniqueSuffix}.${extension}`;

    // 1. Read and parse the Excel file first (before persisting anything)
    const workbook = XLSX.readFile(filePath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);

    const tasks = [];
    let skippedRows = 0;

    for (const row of rows) {
      const customerName = getExcelCell(row, "CustomerName", "Customer Name", "customerName");
      const verificationAddress = getExcelCell(
        row,
        "FullAddress",
        "Full Address",
        "fullAddress",
        "Verification Address",
        "VerificationAddress"
      );
      const street = getExcelCell(row, "Street", "street");
      const city = getExcelCell(row, "City", "city");
      const state = getExcelCell(row, "State", "state");
      const area = getExcelCell(row, "Town", "Area", "area");
      const landmark = getExcelCell(row, "Landmark", "landmark");
      const country = getExcelCell(row, "Country", "country") || "Nigeria";
      const activityId =
        getExcelCell(row, "Activity id", "Activity Id", "ActivityID", "activityId") ||
        uuidv4();
      const cif = getExcelCell(row, "Cif", "CIF", "cif");
      const reactivationRaw = getExcelCell(
        row,
        "ReactivationDateCreated",
        "Reactivation Date Created"
      );

      if (!customerName || !verificationAddress) {
        skippedRows += 1;
        continue;
      }

      const taskDoc = {
        clientId,
        activityId,
        customerName,
        verificationAddress,
        address: {
          street: street || verificationAddress,
          area,
          city: city || state || "N/A",
          state: state || "N/A",
          country,
          landmark,
          fullAddress: verificationAddress,
        },
      };

      if (cif) {
        taskDoc.cif = cif;
      }

      if (reactivationRaw) {
        const parsedDate = new Date(reactivationRaw);
        if (!Number.isNaN(parsedDate.getTime())) {
          taskDoc.reactivationDateCreated = parsedDate;
        }
      }

      tasks.push(taskDoc);
    }

    if (tasks.length === 0) {
      await fs.unlink(filePath);
      return res.status(400).json({
        success: false,
        message:
          "No valid tasks found in the Excel file. Check column headers (e.g. CustomerName, FullAddress) and required values.",
        skippedRows,
        totalRows: rows.length,
      });
    }

    const activityIds = tasks.map((task) => task.activityId);

    // Upload the Excel sheet to Cloudinary before persisting tasks
    const cloudinaryRes = await cloudinary.uploader.upload(filePath, {
      public_id: fileName,
      folder: "tasks/excel",
      resource_type: "raw",
      type: "upload",
    });

    const taskUrl = cloudinaryRes.secure_url;

    const taskUpload = await TaskUpload.create({
      clientId,
      taskUrl,
      fileName: originalFileName,
      activityIds,
    });

    const tasksWithUpload = tasks.map((task) => ({
      ...task,
      taskUploadId: taskUpload._id,
    }));

    await Task.insertMany(tasksWithUpload, { ordered: false });

    await Task.updateMany(
      {
        clientId,
        activityId: { $in: activityIds },
        $or: [{ taskUploadId: null }, { taskUploadId: { $exists: false } }],
      },
      { $set: { taskUploadId: taskUpload._id } }
    );

    // Cleanup
    await fs.unlink(filePath);

    res.status(200).json({
      success: true,
      message: "Tasks created and file uploaded successfully",
      totalTasks: tasks.length,
      skippedRows,
      totalRows: rows.length,
      taskUrl,
    });
  } catch (err) {
    console.error("Excel upload error:", err);
    if (req.file?.path) {
      await fs.unlink(req.file.path).catch(() => {});
    }
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

async function getClientUploadHistoryStats(clientId) {
  const clientObjectId = new mongoose.Types.ObjectId(clientId);
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

  const [totalRequest, totalPending, totalVerified] = await Promise.all([
    Task.countDocuments({ clientId: clientObjectId }),
    Task.countDocuments({
      clientId: clientObjectId,
      reportIsApproved: { $ne: true },
    }),
    Task.countDocuments({ clientId: clientObjectId, reportIsApproved: true }),
  ]);

  const monthlyAggregation = await Task.aggregate([
    {
      $match: {
        clientId: clientObjectId,
        createdAt: { $gte: startOfYear, $lte: endOfYear },
      },
    },
    {
      $group: {
        _id: { month: { $month: "$createdAt" } },
        total: { $sum: 1 },
        pending: {
          $sum: {
            $cond: [{ $ne: ["$reportIsApproved", true] }, 1, 0],
          },
        },
        verified: {
          $sum: {
            $cond: [{ $eq: ["$reportIsApproved", true] }, 1, 0],
          },
        },
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

  const monthlyTasks = monthNames.map((name) => ({
    month: name,
    pending: 0,
    verified: 0,
    total: 0,
  }));

  monthlyAggregation.forEach(({ _id, total, pending, verified }) => {
    const idx = _id.month - 1;
    monthlyTasks[idx].total = total;
    monthlyTasks[idx].pending = pending;
    monthlyTasks[idx].verified = verified;
  });

  return {
    totalRequest,
    totalPending,
    totalVerified,
    monthlyTasks,
  };
}

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
        reportIsApproved: true,
      })
        .populate({ path: "taskUploadId", select: "fileName uploadedAt" })
        .sort({ createdAt: -1 })
        .select(APPROVED_REPORT_TASK_SELECT),
    ]);

    const uploadHistoryStats = await getClientUploadHistoryStats(clientId);

    const formattedTasks = reportTasks.map(formatApprovedReportTask);

    res.status(200).json({
      success: true,
      data: {
        totalPendingFiles,
        totalVerifiedFiles,
        totalComplaints,
        uploads: taskFiles, // For the table
        reports: formattedTasks,
        totalRequest: uploadHistoryStats.totalRequest,
        totalPending: uploadHistoryStats.totalPending,
        totalVerified: uploadHistoryStats.totalVerified,
        monthlyTasks: uploadHistoryStats.monthlyTasks, // For graph
      },
    });
  } catch (err) {
    console.error("Dashboard stats error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

function parseApprovedReportsPagination(query) {
  const skipParam = parseInt(query.skip, 10);
  const skip = Number.isFinite(skipParam) && skipParam >= 0 ? skipParam : 0;
  const limitParam = query.limit;

  if (
    limitParam === undefined ||
    limitParam === null ||
    String(limitParam).trim() === ""
  ) {
    return { skip, limit: 25, fetchAll: false };
  }

  const normalizedLimit = String(limitParam).trim().toLowerCase();
  if (normalizedLimit === "all" || normalizedLimit === "-1") {
    return { skip: 0, limit: null, fetchAll: true };
  }

  const limit = parseInt(limitParam, 10);
  if (![25, 50, 100].includes(limit)) {
    return {
      error: 'Invalid limit. Use 25, 50, 100, or "all".',
    };
  }

  return { skip, limit, fetchAll: false };
}

const getApprovedReports = async (req, res) => {
  try {
    const clientId = req.user.id;
    const { fileName, taskUploadId, startDate, endDate, dateFilter } = req.query;
    const normalizedTaskUploadId = String(taskUploadId ?? "").trim();
    const pagination = parseApprovedReportsPagination(req.query);

    if (pagination.error) {
      return res.status(400).json({
        success: false,
        message: pagination.error,
      });
    }

    const { skip, limit, fetchAll } = pagination;

    const filter = {
      clientId,
      reportIsApproved: true,
      "feedback.reportUrl": { $ne: null },
    };

    const emptyUploadResponse = async () => {
      const uploadFiles = await TaskUpload.find({ clientId })
        .select("fileName uploadedAt")
        .sort({ uploadedAt: -1 });

      return res.status(200).json({
        success: true,
        message: "No approved reports found for the selected upload file.",
        total: 0,
        skip: 0,
        limit: fetchAll ? null : limit,
        data: {
          uploads: uploadFiles,
          reports: [],
        },
      });
    };

    if (normalizedTaskUploadId === "none") {
      applyDirectSubmissionFilter(filter);
    } else if (normalizedTaskUploadId) {
      if (!mongoose.Types.ObjectId.isValid(normalizedTaskUploadId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid taskUploadId.",
        });
      }

      const upload = await TaskUpload.findOne({
        _id: normalizedTaskUploadId,
        clientId,
      });

      if (!upload) {
        return emptyUploadResponse();
      }

      const applied = await applyTaskUploadFilter(filter, [upload]);
      if (!applied) {
        return emptyUploadResponse();
      }
    } else if (fileName && String(fileName).trim()) {
      const uploads = await TaskUpload.find({
        clientId,
        fileName: { $regex: String(fileName).trim(), $options: "i" },
      });

      if (uploads.length === 0) {
        return emptyUploadResponse();
      }

      const applied = await applyTaskUploadFilter(filter, uploads);
      if (!applied) {
        return emptyUploadResponse();
      }
    }

    const dateFieldResult = resolveApprovedReportsDateField(dateFilter);
    if (dateFieldResult.error) {
      return res.status(400).json({
        success: false,
        message: dateFieldResult.error,
      });
    }

    const dateFilterError = applyDateRangeFilter(
      filter,
      startDate,
      endDate,
      dateFieldResult.field
    );
    if (dateFilterError?.error) {
      return res.status(400).json({
        success: false,
        message: dateFilterError.error,
      });
    }

    const reportsQuery = Task.find(filter)
      .populate({ path: "taskUploadId", select: "fileName uploadedAt" })
      .sort({ createdAt: -1 })
      .select(APPROVED_REPORT_TASK_SELECT);

    if (!fetchAll) {
      reportsQuery.skip(skip).limit(limit);
    }

    const [reports, total, uploads] = await Promise.all([
      reportsQuery.exec(),
      Task.countDocuments(filter),
      TaskUpload.find({ clientId })
        .select("fileName uploadedAt")
        .sort({ uploadedAt: -1 }),
    ]);

    res.status(200).json({
      success: true,
      message: "Approved reports retrieved",
      total,
      skip: fetchAll ? 0 : skip,
      limit: fetchAll ? null : limit,
      data: {
        uploads,
        reports: reports.map(formatApprovedReportTask),
      },
    });
  } catch (err) {
    console.error("Approved reports error:", err);
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
    const uploadHistoryStats = await getClientUploadHistoryStats(clientId);

    res.status(200).json({
      success: true,
      data: {
        totalRequest: uploadHistoryStats.totalRequest,
        totalPending: uploadHistoryStats.totalPending,
        totalVerified: uploadHistoryStats.totalVerified,
        monthlyTasks: uploadHistoryStats.monthlyTasks,
      },
    });
  } catch (err) {
    console.error("Analytics error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};



const submitAddressVerification = async (req, res) => {
  try {
    const { error, value } = addressVerificationRequestSchema.validate(req.body, { abortEarly: false });
    if (error) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: error.details.map((d) => d.message)
      });
    }
    const { addressVerificationResponses } = value;

    const tasks = [];
    const duplicates = [];

    for (const item of addressVerificationResponses) {
      const exists = await Task.findOne({ activityId: item.activityId });

      if (exists) {
        duplicates.push(item.activityId);
        continue;
      }

      const address = item.address || {};
      const verificationAddress =
        [
          address.street,
          address.area,
          address.city,
          address.landmark,
          address.postalCode,
          address.state,
          address.country,
          
        ]
          .filter(Boolean)
          .join(", ");

      tasks.push({
        clientId: req.user.id,
        activityId: item.activityId,
        customerName: item.customerName,
        address: {
          street: address.street,
          area: address.area,
          city: address.city,
          state: address.state,
          country: address.country || "Nigeria",
          landmark: address.landmark,
          postalCode: address.postalCode,
          fullAddress: address.fullAddress,
          additionalInformation: address.additionalInformation
        },
        verificationAddress,
        status: "pending"
      });
    }

    if (tasks.length) {
      await Task.insertMany(tasks, { ordered: false });
    }

    return res.status(200).json({
      success: true,
      message: "AVR request submitted successfully",
      data: {
        created: tasks.map((t) => t.activityId),
        duplicates: duplicates.length ? duplicates : undefined
      }
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
  getApprovedReports,
  getAllUploads,
  getAnalytics,

  submitAddressVerification
};
