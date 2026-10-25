const { test } = require("node:test");
const assert = require("node:assert/strict");
const axios = require("axios");

test("Wema approval includes camera photos and blocks requests without usable media", async (t) => {
  // Use the default limit regardless of the developer's environment.
  const previousLimit = process.env.PUSH_MEDIA_MAX_BASE64_LENGTH;
  delete process.env.PUSH_MEDIA_MAX_BASE64_LENGTH;
  delete require.cache[require.resolve("./buildAddressMedia")];
  delete require.cache[require.resolve("./pushTaskResult")];
  const { pushTaskResultToClient } = require("./pushTaskResult");
  const originalGet = axios.get;
  const originalPost = axios.post;
  t.after(() => {
    axios.get = originalGet;
    axios.post = originalPost;
    if (previousLimit === undefined) delete process.env.PUSH_MEDIA_MAX_BASE64_LENGTH;
    else process.env.PUSH_MEDIA_MAX_BASE64_LENGTH = previousLimit;
  });

  const photo = Buffer.alloc(800000, 1);
  axios.get = async () => ({ data: photo });
  let requests = 0;
  axios.post = async (_url, payload) => {
    requests++;
    const media = payload.addressVerificationResponses[0].addressMedia;
    assert.equal(media.length, 2);
    assert.equal(media[0].contentBase64, photo.toString("base64"));
    assert.equal(media[0].contentType, "image/jpeg");
    assert.equal(media[0].mediaType, 1);
    return { status: 200, data: { status: true, statusCode: 200 } };
  };
  const client = { integration: { integrationEnabled: true, avsEndpoint: "https://example.test" } };
  const task = {
    status: "completed",
    verificationAddress: "1 Test Street",
    feedback: { geotaggedImages: ["https://example.test/1.jpg", "https://example.test/2.jpg"] },
  };
  await pushTaskResultToClient(task, client);
  assert.equal(requests, 1);

  task.feedback.geotaggedImages = [];
  await assert.rejects(pushTaskResultToClient(task, client), (err) => {
    assert.equal(err.pushError.code, "MISSING_ADDRESS_MEDIA");
    assert.equal(err.pushError.status, 400);
    return true;
  });
  task.feedback.geotaggedImages = ["https://example.test/unavailable.jpg"];
  axios.get = async () => { throw new Error("Image unavailable"); };
  await assert.rejects(pushTaskResultToClient(task, client), (err) => {
    assert.equal(err.pushError.code, "MISSING_ADDRESS_MEDIA");
    return true;
  });
  assert.equal(requests, 1, "missing media must not be sent to Wema");

  task.status = "incomplete";
  task.feedback = { addressExistence: "No", customerResident: "No" };
  axios.post = async (_url, payload) => {
    assert.equal(payload.addressVerificationResponses[0].addressMedia[0].fileName, "aoco_logo.jpeg");
    return { status: 200, data: { status: true } };
  };
  await pushTaskResultToClient(task, client);
});
