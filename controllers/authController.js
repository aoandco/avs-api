const bcrypt = require("bcrypt");
const mongoose = require("mongoose")
const jwt = require("jsonwebtoken");
const generateToken = require("../util/generateToken");
const Client = require("../model/Client");
const Agent = require("../model/Agent");
const Admin = require("../model/Admin");
const {sendEmailOTP, sendVerificationLink} = require("../util/sendEmail");
const {
  agentSignupSchema,
  clientSignupSchema,
  adminSignupSchema,
  forgotPasswordSchema,
} = require("../util/validationSchemas");

const getModelByRole = (role) => {
  switch (role) {
    case "agent":
      return Agent;
    case "client":
      return Client;
    case "admin":
      return Admin;
    default:
      throw new Error("Invalid role");
  }
};

const getUserDisplayName = (role, user) => {
  if (role === "client") return user.uploaderName;
  if (role === "agent") return user.fullName;
  return "Admin";
};

const signupAgent = async (req, res) => {
  try {
    const { platformType } = req.params;
    const { error, value } = agentSignupSchema.validate(req.body);

    if (error) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: error.details,
      });
    }

    const { fullName, email, password, teamName} = value;

    const existing = await Agent.findOne({ email });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: "Email already registered.",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    let newAgent = new Agent({
      fullName,
      email,
      teamName:teamName?teamName:null,
      password: hashedPassword,
      isVerified: false,
    });

    let responseMessage = "";

    if (platformType === "app") {
      const { otp, otpExpiry } = await sendEmailOTP(email, fullName);
      newAgent.emailOTP = otp;
      newAgent.otpExpiresAt = otpExpiry;
      responseMessage = "Agent registered. OTP sent to email.";
    } else if (platformType === "web") {
      const verificationToken = jwt.sign(
        { id: newAgent._id, email: newAgent.email, role: "agent" },
        process.env.JWT_SECRET,
        { expiresIn: "10m" }
      );
      const verificationLink = `${process.env.BASE_URL}/verify-email?token=${verificationToken}`;
      const {linkExpiry} = await sendVerificationLink(email, fullName, verificationLink);
      newAgent.linkExpiresAt = linkExpiry
      responseMessage = "Agent registered. Verification link sent to email.";
    } else {
      return res.status(400).json({
        success: false,
        message: "Invalid platform type. Use 'app' or 'web'."
      });
    }

    await newAgent.save();

    res.status(201).json({
      success: true,
      message: responseMessage,
      data: {
        id: newAgent._id
      }
    });
  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};


const signupClient = async (req, res) => {
  try {
    const { platformType } = req.params;
    const { error, value } = clientSignupSchema.validate(req.body);

    if (error) {
      return res.status(400).json({ success: false, message: "Validation failed", errors: error.details });
    }

    const { email, password, companyName, uploaderName, uploaderPhone } = value;

    const existing = await Client.findOne({ email });
    if (existing) {
      return res.status(409).json({ success: false, message: "Email already registered." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newClient = new Client({
      email,
      password: hashedPassword,
      companyName,
      uploaderName,
      uploaderPhone,
      isVerified: false
    });

    let responseMessage = "";

    if (platformType === "app") {
      const { otp, otpExpiry } = await sendEmailOTP(email, uploaderName);
      newClient.emailOTP = otp;
      newClient.otpExpiresAt = otpExpiry;
      responseMessage = "Client registered. OTP sent to email.";
    } else if (platformType === "web") {
      const verificationToken = jwt.sign(
        { id: newClient._id, email: newClient.email, role: "client" },
        process.env.JWT_SECRET,
        { expiresIn: "10m" }
      );

      const verificationLink = `${process.env.BASE_URL}/verify-email?token=${verificationToken}`;
      const {linkExpiry} = await sendVerificationLink(email, uploaderName, verificationLink);
      newClient.linkExpiresAt = linkExpiry
      responseMessage = "Client registered. Verification link sent to email.";
    } else {
      return res.status(400).json({ success: false, message: "Invalid platform type. Use 'app' or 'web'." });
    }

    await newClient.save();

    res.status(201).json({
      success: true,
      message: responseMessage,
      data: {
        id: newClient._id
      }
    });
  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};


const signupAdmin = async (req, res) => {
  try {
    const { error, value } = adminSignupSchema.validate(req.body);

    if (error) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: error.details
      });
    }

    const { email, password,fullName, phoneNumber, securityQuestion } = value;

    const existing = await Admin.findOne({ email });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: "User already registered."
      });
    }

    if (securityQuestion.trim().toLowerCase() !== process.env.SECURITY_QUESTION.toLowerCase()){
      return res.status(403).json({
              success: false,
              message: "Unauthorized."
        });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newAdmin = new Admin({
      fullName,
      email,
      phoneNumber,
      password: hashedPassword,
      isVerified: false
    });

    const verificationToken = jwt.sign(
      { id: newAdmin._id, email: newAdmin.email, role: "admin" },
      process.env.JWT_SECRET,
      { expiresIn: "10m" }
    );

    const verificationLink = `${process.env.BASE_URL}/admin/verify-email?token=${verificationToken}`;
    const {linkExpiry} = await sendVerificationLink(email, "Admin", verificationLink);
    newAdmin.linkExpiresAt = linkExpiry
    await newAdmin.save();

    res.status(201).json({
      success: true,
      message: "Admin registered. Verification link sent to email.",
      data: {
        id: newAdmin._id
      }
    });
  } catch (err) {
    console.error("Admin signup error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};


const verifyEmail = async (req, res) => {
  try {
    const { role} = req.params;
    const id = new mongoose.Types.ObjectId(req.params.id)


    const { otp } = req.body;
    const Model = getModelByRole(role);
    const user = await Model.findById(id);

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: `${role} not found` });
    }

    if (user.isVerified) {
      return res
        .status(400)
        .json({ success: false, message: "Email already verified." });
    }

    if (
      user.emailOTP !== otp ||
      !user.otpExpiresAt ||
      user.otpExpiresAt < new Date()
    ) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid or expired OTP." });
    }

    user.isVerified = true;
    user.emailOTP = null;
    user.otpExpiresAt = null;

    await user.save();

    const token = generateToken({ id: user._id, role });

    res.status(200).json({ 
        success: true, 
        message: "Email verified successfully.",
        data:{
          user,
          token
        }
       });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
};

const verifyEmailFromLink = async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({ success: false, message: "Missing verification token." });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(400).json({ success: false, message: "Invalid or expired token." });
    }

    const { id, email, role } = decoded;

    const Model = getModelByRole(role);
    const user = await Model.findById(id);

    if (!user || user.email !== email) {
      return res.status(404).json({ success: false, message: `${role} not found` });
    }

    if (user.isVerified) {
      return res.status(400).json({ success: false, message: "Email already verified." });
    }

    if (!user.linkExpiresAt || user.linkExpiresAt < new Date()) {
      return res.status(400).json({ success: false, message: "Verification link has expired." });
    }

    user.isVerified = true;
    user.linkExpiresAt = null;
    await user.save();

    const loginToken = generateToken({ id: user._id, role });

    res.status(200).json({
      success: true,
      message: "Email verified successfully.",
      data: {
        user,
        token: loginToken
      }
    });
  } catch (err) {
    console.error("Link verification error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

const resendOTP = async (req, res) => {
  try {
   const { role} = req.params;
    const id = new mongoose.Types.ObjectId(req.params.id)
    
    const Model = getModelByRole(role);
    const user = await Model.findById(id);
   
    // const agent = await Agent.findOne({ email });
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: `${role} not found.` });
    }

    if (user.isVerified) {
      return res
        .status(400)
        .json({ success: false, message: "Email already verified." });
    }

    const name = getUserDisplayName(role, user);
    const { otp, otpExpiry } = await sendEmailOTP(user.email, name);

    user.emailOTP = otp;
    user.otpExpiresAt = otpExpiry;

    await user.save();

    res.status(200).json({ success: false, message: "New OTP sent to email." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
};

const forgotPassword = async (req, res) => {
  try {
    const { role, platformType } = req.params;
    const { error, value } = forgotPasswordSchema.validate(req.body);

    if (error) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: error.details,
      });
    }

    const { email } = value;
    const Model = getModelByRole(role);
    const user = await Model.findOne({ email });

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: `${role} not found` });
    }

    const name = getUserDisplayName(role, user);

    if (platformType === "app") {
      const { otp, otpExpiry } = await sendEmailOTP(email, name);
      user.emailOTP = otp;
      user.otpExpiresAt = otpExpiry;
      user.linkExpiresAt = undefined; // Clear any previous link expiration
      await user.save();

      return res.status(200).json({
        success: true,
        message: "Reset OTP sent to email.",
        data: { id: user._id }
      });

    } else if (platformType === "web") {
      const token = jwt.sign(
        { id: user._id, email: user.email, role },
        process.env.JWT_SECRET,
        { expiresIn: "10m" }
      );
      const verificationLink = role == "admin" ?`${process.env.BASE_URL}/admin/reset-password?token=${token}`: `${process.env.BASE_URL}/reset-password?token=${token}`;
      const { linkExpiry } = await sendVerificationLink(email, name, verificationLink);
      user.linkExpiresAt = linkExpiry;
      user.emailOTP = undefined;
      user.otpExpiresAt = undefined;
      await user.save();

      return res.status(200).json({
        success: true,
        message: "Reset link sent to email.",
        data: { id: user._id }
      });

    } else {
      return res.status(400).json({
        success: false,
        message: "Invalid platform type. Use 'app' or 'web'."
      });
    }
  } catch (err) {
    console.error("Forgot Password error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};


const verifyResetOTP = async (req, res) => {
  try {
    const { role} = req.params;
    const id = new mongoose.Types.ObjectId(req.params.id)


    const { otp } = req.body;
    const Model = getModelByRole(role);
    const user = await Model.findById(id);

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: `${role} not found` });
    }

    if (
      user.emailOTP !== otp ||
      !user.otpExpiresAt ||
      user.otpExpiresAt < new Date()
    ) {
      return res
        .status(400)
        .json({ 
          success: false,
          message: "Invalid or expired OTP.",
          data:{
            id:user._id
          }
        });
    }

    res.status(200).json({
      success: true,
      message: "OTP verified. Proceed to reset password.",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message:err.message });
  }
};


const verifyResetLink = async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({ success: false, message: "Missing reset token." });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(400).json({ success: false, message: "Invalid or expired reset token." });
    }

    const { id, email, role } = decoded;

    const Model = getModelByRole(role);
    const user = await Model.findById(id);

    if (!user || user.email !== email) {
      return res.status(404).json({ success: false, message: `${role} not found` });
    }

    if (!user.linkExpiresAt || user.linkExpiresAt < new Date()) {
      return res.status(400).json({
        success: false,
        message: "Reset link has expired.",
        data: { id: user._id }
      });
    }

    res.status(200).json({
      success: true,
      message: "Reset link verified. Proceed to reset password.",
      data: { id: user._id, role }
    });
  } catch (err) {
    console.error("Reset link verification error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};



const resetPassword = async (req, res) => {
  try {
    const { role } = req.params;
    const id = new mongoose.Types.ObjectId(req.params.id)

    const { newPassword } = req.body;
    const Model = getModelByRole(role);

    const user = await Model.findById(id);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: `${role} not found` });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    user.emailOTP = null;
    user.otpExpiresAt = null;
    await user.save();

    res
      .status(200)
      .json({ success: true, message: "Password reset successful." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
};

const login = async (req, res) => {
  try {
    const { role } = req.params;

    const { email, password } = req.body;
    const Model = getModelByRole(role);
    const user = await Model.findOne({ email });

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: `${role} not found` });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid credentials" });
    }

    if (!user.isVerified) {
      return res
        .status(403)
        .json({ success: false, message: "Email not verified" });
    }

    const token = generateToken({ id: user._id, role });

    res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      data: {
        id: user._id,
        email: user.email,
        role,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = {
  signupAgent,
  signupClient,
  signupAdmin,

  verifyEmail,
  verifyEmailFromLink,
  resendOTP,
  forgotPassword,
  verifyResetOTP,
  verifyResetLink,
  resetPassword,
  login,
};
