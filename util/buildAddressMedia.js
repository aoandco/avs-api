const axios = require("axios");
const fs = require("fs/promises");
const path = require("path");
const { isReturnedVerificationTask } = require("./verificationStatus");

const IMAGE_FETCH_TIMEOUT_MS = 30000;
// ~500KB base64 keeps payload under typical gateway limits; full images go via reportUrl
const MAX_BASE64_LENGTH = Number(process.env.PUSH_MEDIA_MAX_BASE64_LENGTH) || 500000;
const COMPANY_LOGO_PATH = path.join(__dirname, "../assets/aoco_logo.jpeg");

async function urlToBase64(url) {
  const res = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: IMAGE_FETCH_TIMEOUT_MS,
    maxContentLength: 10 * 1024 * 1024,
  });
  return Buffer.from(res.data).toString("base64");
}

async function readLocalImageBase64(filePath) {
  const data = await fs.readFile(filePath);
  return data.toString("base64");
}

async function pushImageMedia(media, contentBase64, fileName, contentType) {
  if (contentBase64.length > MAX_BASE64_LENGTH) {
    console.warn(
      "[buildAddressMedia] Skipping oversized image (base64 too large)",
      { length: contentBase64.length, max: MAX_BASE64_LENGTH }
    );
    return;
  }

  media.push({
    fileName,
    contentType,
    contentBase64,
    mediaType: 1,
  });
}

async function buildAddressMedia(task) {
  const media = [];
  const geotaggedImages = (task.feedback?.geotaggedImages || []).filter(
    (img) => img && typeof img === "string"
  );
  const useCompanyLogo =
    isReturnedVerificationTask(task) && geotaggedImages.length === 0;

  if (useCompanyLogo) {
    try {
      const contentBase64 = await readLocalImageBase64(COMPANY_LOGO_PATH);
      await pushImageMedia(media, contentBase64, "aoco_logo.jpeg", "image/jpeg");
    } catch (err) {
      console.warn(
        "[buildAddressMedia] Failed to load company logo for returned task:",
        err.message
      );
    }
  } else {
    for (const img of geotaggedImages) {
      try {
        const contentBase64 = await urlToBase64(img);
        await pushImageMedia(media, contentBase64, "image.jpg", "image/jpeg");
      } catch (err) {
        console.warn("[buildAddressMedia] Failed to fetch image:", img, err.message);
      }
    }
  }
  if (task.feedback?.recordedVideo) {
    try {
      const contentBase64 = await urlToBase64(task.feedback.recordedVideo);
      if (contentBase64.length <= MAX_BASE64_LENGTH) {
        media.push({
          fileName: "video.mp4",
          contentType: "video/mp4",
          contentBase64,
          mediaType: 2,
        });
      } else {
        console.warn("[buildAddressMedia] Skipping oversized video (base64 too large)");
      }
    } catch (err) {
      console.warn(
        "[buildAddressMedia] Failed to fetch video:",
        task.feedback.recordedVideo,
        err.message
      );
    }
  }

  return media;
}

module.exports = { buildAddressMedia };
