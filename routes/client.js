const express = require("express");
const router = express.Router();
const {authenticate} = require("../authentication/auth");
const authenticateOrVerifyApiKey = require("../authentication/authenticateOrVerifyApiKey");
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
router.post("/update-profile", authenticateOrVerifyApiKey, upload.single("profileImage"), updateClientProfile);
router.post("/upload-tasks", authenticateOrVerifyApiKey, uploadExcel, uploadTasksFromExcel);
router.post("/submit-complaint", authenticateOrVerifyApiKey, submitComplaint);
router.get("/complaints", authenticateOrVerifyApiKey, fetchComplaints);
router.get("/notifications", authenticateOrVerifyApiKey, getAllNotifications);
router.get("/dashboard-stats", authenticateOrVerifyApiKey, getDashboardStats);
router.get("/task-uploads", authenticateOrVerifyApiKey, getAllUploads);
router.get("/task-analytics", authenticateOrVerifyApiKey, getAnalytics);

router.post("/address-verification/submit",
  authenticateOrVerifyApiKey,
  submitAddressVerification
);


module.exports = router;
