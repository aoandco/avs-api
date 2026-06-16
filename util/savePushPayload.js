const fs = require("fs/promises");
const path = require("path");

const PAYLOAD_DIR = path.join(__dirname, "..", "payload-logs");

async function getNextPayloadFilePath() {
  await fs.mkdir(PAYLOAD_DIR, { recursive: true });

  const files = await fs.readdir(PAYLOAD_DIR);
  const numbers = files
    .map((fileName) => /^payload(\d+)\.txt$/i.exec(fileName))
    .filter(Boolean)
    .map((match) => Number(match[1]));

  const nextNumber = numbers.length > 0 ? Math.max(...numbers) + 1 : 1;
  return path.join(PAYLOAD_DIR, `payload${nextNumber}.txt`);
}

async function savePushPayloadToFile(payload) {
  const filePath = await getNextPayloadFilePath();
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");
  return filePath;
}

module.exports = { savePushPayloadToFile, PAYLOAD_DIR };
