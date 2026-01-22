const express = require("express");
const router = express.Router();
const {authenticate} = require("../authentication/auth");
const verifyApiKey = require("../authentication/verifyApiKey");
const {upload, uploadExcel} = require("../util/multer");
const { 
     updateClientProfile,
     uploadTasksFromExcel, 
     submitComplaint,
     fetchComplaints,
     getAllNotifications,
     getDashboardStats,
     getAllUploads,
     getAnalytics,
     generateClientApiKey,
     submitAddressVerification
    } = require("../controllers/clientController");


router.post("/api-key", authenticate, generateClientApiKey);
router.post("/update-profile", verifyApiKey, upload.single("profileImage"), updateClientProfile);
router.post("/upload-tasks", verifyApiKey, uploadExcel, uploadTasksFromExcel);
router.post("/submit-complaint", verifyApiKey, submitComplaint);
router.get("/complaints", verifyApiKey,fetchComplaints);
router.get("/notifications", verifyApiKey, getAllNotifications);
router.get("/dashboard-stats", verifyApiKey, getDashboardStats);
router.get("/task-uploads", verifyApiKey, getAllUploads);
router.get("/task-analytics", verifyApiKey, getAnalytics);

router.post("/address-verification/submit",
  verifyApiKey,
  submitAddressVerification
);


module.exports = router;
