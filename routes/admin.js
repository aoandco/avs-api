const express = require("express");
const router = express.Router();
const { authenticate, authorizeAdmin } = require("../authentication/auth");
const {
     getAdminDashboard,
     listTasks, 
     assignTask,
     getAgentsWithCompletedTasks,
     getClientsWithTaskUploads,
     getDashboardStats,
     fetchComplaints,
     viewComplaint,
     sendNotification,
     updateFileStatus,
     deleteFileUpload,
     getAnalytics,
     deleteTask,
     rejectTask,
     approveTaskReport,
     getTaskSummaryByMonth,
     getClientMonthlySummary,
     verifyTaskAddress,
     updateClientIntegration
    } = require("../controllers/adminController");

router.get("/tasks", authenticate, authorizeAdmin, listTasks);
router.post("/assign-task/:agentId", authenticate, authorizeAdmin, assignTask);
router.get("/agents-with-completed-tasks", authenticate, authorizeAdmin, getAgentsWithCompletedTasks);
router.get("/clients-task-uploads", authenticate, authorizeAdmin, getClientsWithTaskUploads);
router.get("/clients-monthly-summary", authenticate, authorizeAdmin, getClientMonthlySummary);
router.get("/dashboard-stats",authenticate, authorizeAdmin, getDashboardStats);
router.get("/monthly-summary-stats",authenticate, authorizeAdmin, getTaskSummaryByMonth);
router.get("/complaints", authenticate, authorizeAdmin, fetchComplaints);
router.post("/view-complaint/:complaintId", authenticate,authorizeAdmin, viewComplaint);
router.post("/send-notifications", authenticate,authorizeAdmin, sendNotification);
router.post("/update-file-status/:fileId", authenticate,authorizeAdmin, updateFileStatus);
router.post("/delete-file/:fileId", authenticate,authorizeAdmin, deleteFileUpload);
router.post("/delete-task/:taskId", authenticate,authorizeAdmin, deleteTask);
router.post("/approve-report", authenticate,authorizeAdmin, approveTaskReport);
router.post("/reject-task/:taskId", authenticate,authorizeAdmin, rejectTask);
router.get("/task-analytics", authenticate,authorizeAdmin, getAnalytics);
router.post("/verify-task-address/:taskId", authenticate,authorizeAdmin, verifyTaskAddress);

router.post("/client/integration/:clientId",authenticate,updateClientIntegration);


module.exports = router;
