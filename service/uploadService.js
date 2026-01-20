const cloudinary = require("../config/cloudinary");

const uploadToCloudinary = async (filePath, folder) => {
  return await cloudinary.uploader.upload(filePath, { folder });
};

module.exports = { uploadToCloudinary };
