const {transporter, sendWithFallback} = require("../config/mailer");
const {bayogEmailWrapper} = require("./emailWrapper")

const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit
};

const sendEmailOTP = async (email, fullName = "User") => {
  const otp = generateOTP();
  const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // expires in 10 minutes

  const body = `
      <div style="font-family: Arial, sans-serif; padding: 16px;">
        <h2>Email Verification</h2>
        <p>Hi ${fullName},</p>
        <p>Your verification OTP is:</p>
        <h1>${otp}</h1>
        <p>This OTP is valid for 10 minutes.</p>
        <p>If you didn’t request this, you can ignore this email.</p>
        <br/>
        <p>Best Regards,<br/>Verification Team</p>
      </div>
    `

  const mailOptions = {
    to: email,
    subject: "Your Email Verification OTP",
    html:bayogEmailWrapper(body)
  };

  await sendWithFallback(mailOptions);
  return { otp, otpExpiry };
};

const sendVerificationLink = async (email, fullName, verificationLink)=>{
  const linkExpiry = new Date(Date.now() + 10 * 60 * 1000);
  
  const body = `
      <div style="font-family: Arial, sans-serif; padding: i6px;">
        <h2>Email Verification</h2>
        <p>Hi ${fullName},</p>
        <p>Thank you for registering on our platform.</p>
        <p>Please click the button below to verify your email:</p>
        <a href="${verificationLink}" style="display: inline-block; padding: 10px 20px; background-color: #0066ff; color: white; text-decoration: none; border-radius: 4px;">
          Verify Email
        </a>
        <p>This link will expire in 10 minutes.</p>
        <hr />
        <p style="font-size: 12px; color: #777;">If you didn’t create an account, you can ignore this email.</p>
      </div>
    `

  const mailOptions = {
    to: email,
    subject: "Your Email Verification Link",
    html: bayogEmailWrapper(body)
  }
  await sendWithFallback(mailOptions);
  console.log("I am done sending email")
  return {linkExpiry}
}

const sendAssignedTasks = async (email, fullName, taskCount , cloudinaryUrl)=>{
  
  const body =  `
      <p>Dear ${fullName},</p>
      <p>You have been assigned ${taskCount} new task(s). You are expected to execute them within <strong>48 hours</strong>.</p>
      <p>You can download the task summary using the link below:</p>
      <p><a href="${cloudinaryUrl}">Download Task Sheet</a></p>
    `

  const mailOptions = {
    to: email,
    subject:"New Tasks Assigned to You",
    html:bayogEmailWrapper(body)
  }
  await sendWithFallback(mailOptions);
}


const sendOverdueEmail = async (to, task) => {
  const body =  `
      <p>Hello,</p>
      <p>This is a reminder that the task assigned to you with Activity ID <b>${task.activityId}</b> is now <b>overdue</b>.</p>
      <p>Please submit it immediately to avoid penalties.</p>
    `
  const mailOptions = {
    to,
    subject: "⚠️ Overdue Task Notification",
    html:bayogEmailWrapper(body)
  };

  await sendWithFallback(mailOptions);
};

module.exports = {
  sendEmailOTP, 
  sendVerificationLink,
  sendAssignedTasks,
  sendOverdueEmail,
};
