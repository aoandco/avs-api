const express = require("express");
const router = express.Router();
const {authenticate} = require("../authentication/auth");
const {upload, uploadTaskMedia} = require("../util/multer");
// const rateLimiter = require("../service/rateLimiter")
const { 
    updateAgentProfile,
    getTasks,
    startTask,
    submitTask,
    rejectTask,
    deleteAccount,
    searchTasks,
    getAgentDashboard,
    submitComplaint,
    fetchComplaints,
    getAllNotifications,
    getTaskHistory,
    getMonthlyTaskStats,
 } = require("../controllers/agentController");
 

router.post("/update-profile", authenticate, upload.single("profileImage"), updateAgentProfile);
router.get("/my-tasks", authenticate, getTasks);
router.post("/start-task/:taskId", authenticate, startTask);
router.post("/submit-task/:taskId", authenticate, uploadTaskMedia, submitTask);
router.post("/reject-task/:taskId", authenticate, uploadTaskMedia, rejectTask);
router.post("/deleteAccount", deleteAccount);
router.post("/start-task/:taskId", authenticate, startTask);
router.get("/search-tasks", authenticate, searchTasks);
router.get("/get-agent-dashboard", authenticate, getAgentDashboard);
router.post("/submit-complaint", authenticate, submitComplaint);
router.get("/complaints", authenticate, fetchComplaints);
router.get("/notifications", authenticate, getAllNotifications);
router.get("/tasks-history", authenticate, getTaskHistory);
router.get("/monthly-tasks-stats", authenticate, getMonthlyTaskStats);

module.exports = router;
