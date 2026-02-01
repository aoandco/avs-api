const nodemailer = require("nodemailer");
const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);

// Gmail PRIMARY transporter
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASS,
  },
});

// Prevent a provider from hanging the request
const withTimeout = (promise, ms = 8000) =>
  Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Provider timeout")), ms)
    ),
  ]);

const sendWithFallback = async ({
  to,
  subject,
  html,
  text,
  attachments = [],
}) => {
  const result = {
    success: false,
    provider: null,
    id: null,
  };

  // ---------- 1️⃣ TRY GMAIL FIRST ----------
  try {
    console.log("📨 Attempting Gmail delivery...");

    const gmailInfo = await withTimeout(
      transporter.sendMail({
        from: `"Aoco" <${process.env.GMAIL_USER}>`,
        to,
        subject,
        html,
        text,
        attachments,
      })
    );

    result.success = true;
    result.provider = "gmail";
    result.id = gmailInfo.messageId;

    console.log("✅ Gmail success:", result.id);
    return result;

  } catch (gmailError) {
    console.error("⚠️ Gmail failed:", gmailError.message);
  }

  // ---------- 2️⃣ FALL BACK TO RESEND ----------
  try {
    console.log("📨 Attempting Resend fallback...");

    const resendResponse = await withTimeout(
      resend.emails.send({
        from: `Aoco <${process.env.RESEND_ONBOARDING_EMAIL}>`,
        to,
        subject,
        html,
        text,
        attachments,
        reply_to: process.env.RESEND_ONBOARDING_EMAIL,
      })
    );

    result.success = true;
    result.provider = "resend";
    result.id = resendResponse.data?.id;

    console.log("✅ Resend success:", result.id);
    return result;

  } catch (resendError) {
    console.error("❌ Resend fallback failed:", resendError.message);
    throw new Error("All email providers failed");
  }
};

module.exports = { sendWithFallback };
























// const nodemailer = require("nodemailer");
// const { Resend } = require("resend");

// const resend = new Resend(process.env.RESEND_API_KEY);

// // Gmail fallback transporter
// const transporter = nodemailer.createTransport({
//   service: "gmail",
//   auth: {
//     user: process.env.GMAIL_USER,
//     pass: process.env.GMAIL_APP_PASS,
//   },
// });

// // Send mail with fallback (Resend → Gmail)
// const sendWithFallback = async (mailOptions) => {
//   try {
//     console.log("📨 Trying Resend first...");

//     const response = await resend.emails.send({
//       from: `Aoco <${process.env.RESEND_ONBOARDING_EMAIL}>`, 
//       // You can use your Gmail until you add a domain in Resend
//       to: mailOptions.to,
//       subject: mailOptions.subject,
//       html: mailOptions.html,
//       reply_to: process.env.RESEND_ONBOARDING_EMAIL,
//     });

//     console.log("✅ Resend sent:", response.data?.id);
//     return { provider: "resend", id: response.data?.id };

//   } catch (err) {
//     console.error("❌ Resend failed, falling back to Gmail:", err.message);

//     try {
//       const info = await transporter.sendMail({
//         ...mailOptions,
//         from: `"Aoco" <${process.env.GMAIL_USER}>`,
//       });

//       console.log("✅ Gmail sent:", info.messageId);
//       return { provider: "gmail", messageId: info.messageId };

//     } catch (err2) {
//       console.error("❌ Gmail also failed:", err2.message);
//       throw new Error("All email providers failed.");
//     }
//   }
// };

// module.exports = { sendWithFallback };












// const nodemailer = require("nodemailer");
// const sgMail = require("@sendgrid/mail");

// sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// const transporter = nodemailer.createTransport({
//   service: "gmail",
//   auth: {
//     user: process.env.GMAIL_USER,      // your Gmail address
//     pass: process.env.GMAIL_APP_PASS   // app password from Gmail
//   }
// });

// // Send mail with fallback
// const sendWithFallback = async (mailOptions) => {
//   // First try SendGrid
//   const msg = {
//     to: mailOptions.to,
//     from: {
//       email:process.env.GMAIL_USER, // must be verified in SendGrid
//       name: "aoco",
//     },
//     subject: mailOptions.subject,
//     html: mailOptions.html,
//     replyTo: process.env.GMAIL_USER,
//   };

//   try {
//     console.log("📨 Trying SendGrid first...");
//     const [response] = await sgMail.send(msg);
//     console.log("✅ SendGrid API sent:", response.statusCode);
//     return { provider: "sendgrid", statusCode: response.statusCode };
//   } catch (err) {
//     console.error("❌ SendGrid failed, falling back to Gmail:", err.response?.body || err.message);

//     try {
//       const info = await transporter.sendMail({
//         ...mailOptions,
//         from: `"aoco" <${process.env.GMAIL_USER}>`, // Gmail sender
//       });
//       console.log("✅ Gmail sent:", info.messageId);
//       return { provider: "gmail", ...info };
//     } catch (err2) {
//       console.error("❌ Gmail also failed:", err2.message);
//       throw new Error("All email providers failed.");
//     }
//   }
// };


// module.exports = { sendWithFallback };
