const axios = require("axios");

async function urlToBase64(url) {
  const res = await axios.get(url, { responseType: "arraybuffer" });
  return Buffer.from(res.data).toString("base64");
}

async function buildAddressMedia(task) {
  const media = [];

  for (const img of task.feedback.geotaggedImages || []) {
    media.push({
      fileName: "image.jpg",
      contentType: "image/jpeg",
      contentBase64: await urlToBase64(img),
      mediaType: 1
    });
  }

  if (task.feedback.recordedVideo) {
    media.push({
      fileName: "video.mp4",
      contentType: "video/mp4",
      contentBase64: await urlToBase64(task.feedback.recordedVideo),
      mediaType: 2
    });
  }

  return media;
}

module.exports = {buildAddressMedia}