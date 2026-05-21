const axios = require("axios");

const IMAGE_FETCH_TIMEOUT_MS = 30000;
// ~500KB base64 keeps payload under typical gateway limits; full images go via reportUrl
const MAX_BASE64_LENGTH = Number(process.env.PUSH_MEDIA_MAX_BASE64_LENGTH) || 500000;

async function urlToBase64(url) {
  const res = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: IMAGE_FETCH_TIMEOUT_MS,
    maxContentLength: 10 * 1024 * 1024,
  });
  return Buffer.from(res.data).toString("base64");
}

async function buildAddressMedia(task) {
  const media = [];

  for (const img of task.feedback?.geotaggedImages || []) {
    if (!img || typeof img !== "string") continue;

    try {
      const contentBase64 = await urlToBase64(img);
      if (contentBase64.length > MAX_BASE64_LENGTH) {
        console.warn(
          "[buildAddressMedia] Skipping oversized image (base64 too large)",
          { length: contentBase64.length, max: MAX_BASE64_LENGTH }
        );
        continue;
      }

      media.push({
        fileName: "image.jpg",
        contentType: "image/jpeg",
        contentBase64,
        mediaType: 1,
      });
    } catch (err) {
      console.warn("[buildAddressMedia] Failed to fetch image:", img, err.message);
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
