require("dotenv").config({ quiet: true });
// Apply the corrected image limit for this diagnostic, including environments
// that still explicitly configure the former 500 KB cutoff.
process.env.PUSH_MEDIA_MAX_BASE64_LENGTH = String(Math.ceil(10 * 1024 * 1024 / 3) * 4);
const fs = require("node:fs/promises");
const path = require("node:path");
const mongoose = require("mongoose");
const axios = require("axios");
const Task = require("../model/Task");
const Client = require("../model/Client");
const { isWemaClient } = require("../util/clientConstants");
const { pushTaskResultToClient } = require("../util/pushTaskResult");

async function main() {
  const taskId = process.argv[2];
  if (!mongoose.isValidObjectId(taskId)) throw new Error("Provide a valid task ID");
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 20000 });
  const task = await Task.findById(taskId);
  if (!task) throw new Error("Task not found");
  const client = await Client.findById(task.clientId);
  if (!isWemaClient(client) || !client?.integration?.integrationEnabled) {
    throw new Error("Task does not have an enabled Wema integration");
  }
  const outputDir = path.join(__dirname, "../payload-logs", `wema-${taskId}-${Date.now()}`);
  await fs.mkdir(outputDir, { recursive: true });
  const originalPost = axios.post;
  axios.post = async (url, payload, config) => {
    const response = await originalPost(url, payload, {
      ...config,
      responseType: "arraybuffer",
      transformResponse: [(data) => data],
      validateStatus: () => true,
    });
    const body = Buffer.from(response.data);
    await fs.writeFile(path.join(outputDir, "response-body.txt"), body);
    await fs.writeFile(path.join(outputDir, "response-metadata.json"), JSON.stringify({
      status: response.status,
      statusText: response.statusText,
      headers: response.headers.toJSON(),
    }, null, 2));
    console.log(`WEMA_HTTP_STATUS: ${response.status} ${response.statusText}`);
    console.log(`CAPTURE_DIRECTORY: ${outputDir}`);
    console.log("WEMA_BODY_BEGIN");
    console.log(body.toString("utf8"));
    console.log("WEMA_BODY_END");
    let data;
    try { data = JSON.parse(body.toString("utf8")); }
    catch { data = body.toString("utf8"); }
    const parsedResponse = { ...response, data };
    if (response.status < 200 || response.status >= 300) {
      const error = new Error(`Wema returned HTTP ${response.status}`);
      error.response = parsedResponse;
      throw error;
    }
    return parsedResponse;
  };
  try {
    const result = await pushTaskResultToClient(task, client);
    if (result.data?.status) {
      task.reportIsApproved = true;
      await task.save();
      console.log("APPROVAL_SAVED: true");
    }
  } finally {
    axios.post = originalPost;
  }
}

main().catch((error) => {
  console.error("APPROVAL_ERROR:", error.message);
  process.exitCode = 1;
}).finally(() => mongoose.disconnect());
