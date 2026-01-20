const express = require("express");
const router = express.Router();
const rateLimiter = require("../service/rateLimiter")
const { 
    signupAgent, 
    signupClient,
    signupAdmin,
    verifyEmail,
    verifyEmailFromLink,
    resendOTP,
    forgotPassword,
    resetPassword,
    verifyResetOTP,
    verifyResetLink,
    login,
 } = require("../controllers/authController");

router.post("/signup/agent/:platformType", signupAgent);
router.post("/signup/client/:platformType", signupClient);
router.post("/signup/admin", signupAdmin);

router.post("/verify-email/:id/:role",rateLimiter, verifyEmail);
router.post("/verify-email-from-link",rateLimiter, verifyEmailFromLink);
router.post("/resend-otp/:id/:role",rateLimiter, resendOTP);
router.post("/forgot-password/:role/:platformType", forgotPassword); 
router.post("/verify-reset-otp/:id/:role",rateLimiter, verifyResetOTP);
router.post("/verify-reset-link", rateLimiter, verifyResetLink);
router.post("/reset-password/:id/:role", resetPassword);
router.post("/login/:role", rateLimiter, login);


module.exports = router;
