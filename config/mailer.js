const nodemailer = require("nodemailer");
const sgMail = require("@sendgrid/mail");

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER,      // your Gmail address
    pass: process.env.GMAIL_APP_PASS   // app password from Gmail
  }
});

// Send mail with fallback
const sendWithFallback = async (mailOptions) => {
  // First try SendGrid
  const msg = {
    to: mailOptions.to,
    from: {
      email:process.env.GMAIL_USER, // must be verified in SendGrid
      name: "aoco",
    },
    subject: mailOptions.subject,
    html: mailOptions.html,
    replyTo: process.env.GMAIL_USER,
  };

  try {
    console.log("📨 Trying SendGrid first...");
    const [response] = await sgMail.send(msg);
    console.log("✅ SendGrid API sent:", response.statusCode);
    return { provider: "sendgrid", statusCode: response.statusCode };
  } catch (err) {
    console.error("❌ SendGrid failed, falling back to Gmail:", err.response?.body || err.message);

    try {
      const info = await transporter.sendMail({
        ...mailOptions,
        from: `"aoco" <${process.env.GMAIL_USER}>`, // Gmail sender
      });
      console.log("✅ Gmail sent:", info.messageId);
      return { provider: "gmail", ...info };
    } catch (err2) {
      console.error("❌ Gmail also failed:", err2.message);
      throw new Error("All email providers failed.");
    }
  }
};


module.exports = { sendWithFallback };
