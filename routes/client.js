const express = require("express");
const router = express.Router();
const {authenticate} = require("../authentication/auth");
const {upload, uploadExcel} = require("../util/multer");
const { 
     updateClientProfile,
     uploadTasksFromExcel, 
     submitComplaint,
     fetchComplaints,
     getAllNotifications,
     getDashboardStats,
     getAllUploads,
     getAnalytics
    } = require("../controllers/clientController");

router.post("/update-profile", authenticate, upload.single("profileImage"), updateClientProfile);
router.post("/upload-tasks", authenticate, uploadExcel, uploadTasksFromExcel);
router.post("/submit-complaint", authenticate, submitComplaint);
router.get("/complaints", authenticate,fetchComplaints);
router.get("/notifications", authenticate, getAllNotifications);
router.get("/dashboard-stats", authenticate, getDashboardStats);
router.get("/task-uploads", authenticate, getAllUploads);
router.get("/task-analytics", authenticate, getAnalytics);

module.exports = router;
