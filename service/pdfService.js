const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const cloudinary = require("../config/cloudinary");

const ensureUploadsDirExists = async () => {
  const uploadsDir = path.join(__dirname, "../uploads");
  try {
    await fs.promises.access(uploadsDir); // Use fs.promises here
  } catch (err) {
    await fs.promises.mkdir(uploadsDir, { recursive: true });
  }
};

const generateTaskPDF = async (task) => {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 30 });
      const buffers = [];

      doc.on("data", buffers.push.bind(buffers));
      doc.on("end", () => resolve(Buffer.concat(buffers)));

      const feedback = task.feedback || {};
      const agent = task.agentId || {};
      const logoURL = "https://res.cloudinary.com/dgeafv96s/image/upload/v1763104830/aoco_logo_h32ucb.jpg";
      const localLogoPath = path.join(__dirname, "../assets/logo.png");

      // === Load and place logo (cloud or local)
      const placeLogo = async () => {
        try {
          const response = await axios.get(logoURL, { responseType: "arraybuffer" });
          const logoBuffer = Buffer.from(response.data, "base64");
          doc.image(logoBuffer, doc.page.width / 2 - 50, 20, { width: 100 });
        } catch {
          if (fs.existsSync(localLogoPath)) {
            doc.image(localLogoPath, doc.page.width / 2 - 50, 20, { width: 100 });
          }
        }
      };
      await placeLogo();
      doc.moveDown(5);

      // === Report Header
      doc.fontSize(18).text("Address Verification Report", { align: "center" });
      doc.moveDown(1.5);

      // === Task Summary
      doc.fontSize(14).text("Task Summary", { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(12)
        .text(`Activity ID: ${task.activityId}`)
        .text(`Client: ${task.clientId?.companyName || "N/A"}`)
        .text(`Client Email: ${task.clientId?.email || "N/A"}`)
        .text(`Customer Name: ${task.customerName}`)
        .text(`Verification Address: ${task.verificationAddress}`)
        .text(`Visit Date: ${new Date(task.visitDate).toLocaleString()}`);
      doc.moveDown(1);

      //========Client Info
      doc.fontSize(14).text("Client Information", { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(12)
        .text(`Client: ${task.clientId?.companyName || "N/A"}`)
        .text(`Client Email: ${task.clientId?.email || "N/A"}`)
        .text(`Uploader Name: ${task.clientId?.uploaderName || "N/A"}`)
        .text(`Uploader Mobile: ${task.clientId?.uploaderPhone || "N/A"}`)
        doc.moveDown(1);


      // === Verification Feedback
      doc.fontSize(14).text("Verification Feedback", { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(12);

      Object.entries(feedback).forEach(([key, value]) => {
        const formattedKey = key
          .replace(/([A-Z])/g, " $1")
          .replace(/^./, (str) => str.toUpperCase());

        let formattedValue = "N/A";

        if (Array.isArray(value)) {
          if (key.toLowerCase().includes("geotaggedimages")) {
            doc.text(`${formattedKey}:`);
            value.forEach((url) => {
              doc.text(`• ${url}`);
            });
            return;
          } else {
            formattedValue = value.length ? value.join(", ") : "N/A";
          }
        } else if (typeof value === "object" && value !== null) {
          if (key.toLowerCase().includes("geo") && "lat" in value && "lng" in value) {
            formattedValue = `Latitude: ${value.lat}, Longitude: ${value.lng}`;
          } else {
            formattedValue = JSON.stringify(value, null, 2);
          }
        } else {
          formattedValue = value || "N/A";
        }

        doc.text(`${formattedKey}: ${formattedValue}`);
      });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};


// === Upload PDF buffer to Cloudinary using temp file
const uploadPDFToCloudinary = async (pdfBuffer, filename = "report") => {
  await ensureUploadsDirExists();

  const uniqueName = `${filename}-${Date.now()}-${crypto.randomUUID()}.pdf`;
  const tempPath = path.join(__dirname, `../uploads/${uniqueName}`);

  try {
    // Write PDF to disk
    await fs.promises.writeFile(tempPath, pdfBuffer);

    // Upload to Cloudinary
    const result = await cloudinary.uploader.upload(tempPath, {
      resource_type: "raw",
      folder: "tasks/reports",
      public_id: filename,
      format: "pdf"
    });

    // Delete local file after upload
    await fs.promises.unlink(tempPath);
    return result.secure_url;
  } catch (err) {
    // Always try to clean up
    try {
      await fs.promises.unlink(tempPath);
    } catch (_) {}
    throw err;
  }
};

module.exports = {
  generateTaskPDF,
  uploadPDFToCloudinary
};
