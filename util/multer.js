const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Ensure 'uploads' directory exists
const uploadDir = path.join(__dirname, "..", "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Allowed extensions
const allowedExtensions = [
  ".jpg", ".jpeg", ".png", ".jfif",
  ".mp3", ".m4a", ".mp4", ".webm",
  ".xlsx"
];

// File filter function
const fileFilter = function (req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowedExtensions.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error("Unsupported file type: " + ext), false);
  }
};

// Main multer instance
const upload = multer({
  dest:"uploads/",
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// Used for optional task media uploads
const uploadTaskMedia = upload.fields([
  { name: "geotaggedImages", maxCount: 5 },
  { name: "recordedAudio", maxCount: 1 },
  { name: "recordedVideo", maxCount: 1 },
]);

// Upload single Excel file
const uploadExcel = upload.single("file");

module.exports = {
  upload,
  uploadTaskMedia,
  uploadExcel
};
