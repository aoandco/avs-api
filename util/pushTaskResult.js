const axios = require("axios");
const { buildAddressMedia } = require("../util/buildAddressMedia");
const { savePushPayloadToFile } = require("../util/savePushPayload");

const PUSH_TIMEOUT_MS = Number(process.env.CLIENT_PUSH_TIMEOUT_MS) || 90000;

function mapVerificationStatus(task) {
  if (task.status === "completed") return 1; // Success
  if (task.status === "incomplete") return 2; // Failed
  return 3; // Returned
}

function asString(value, fallback = "N/A") {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text === "" ? fallback : text;
}

function normalizePostalCode(postalCode) {
  if (!postalCode) return undefined;
  const cleaned = String(postalCode).trim().replace(/-+$/, "");
  return cleaned === "" || cleaned === "-" ? undefined : cleaned;
}

// Wema receive-verification-response expects address as a string, not a structured object.
function buildAddressString(task) {
  const fullAddress = task.address?.fullAddress?.trim();
  if (fullAddress) return fullAddress;

  const verificationAddress = task.verificationAddress?.trim();
  if (verificationAddress) return verificationAddress;

  if (task.address) {
    const parts = [
      task.address.street,
      task.address.area,
      task.address.city,
      task.address.landmark,
      normalizePostalCode(task.address.postalCode),
      task.address.state,
      task.address.country || "Nigeria",
    ].filter(Boolean);

    if (parts.length) return parts.join(", ");
  }

  return "";
}

function toIsoDate(value) {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

function omitUndefined(obj) {
  return Object.fromEntries(
    Object.entries(obj).filter(([, value]) => value !== undefined && value !== null)
  );
}

function formatPushError(err) {
  if (err.response) {
    const { status, statusText, data } = err.response;
    let message = err.message;

    if (status === 403) {
      message =
        "Wema API rejected the call (403 Forbidden). Check subscription key, vendor ID, and that your vendor is allowed to call receive-verification-response.";
    } else if (status === 400 && data?.errors) {
      message = `Wema API validation failed: ${JSON.stringify(data.errors)}`;
    }

    return {
      message,
      status,
      statusText,
      data,
      traceId: data?.traceId,
      validationErrors: data?.errors,
    };
  }

  return {
    message: err.message,
    code: err.code,
  };
}

async function pushTaskResultToClient(task, client, options = {}) {
  if (!client?.integration?.integrationEnabled) {
    return { pushed: false, reason: "integration_disabled" };
  }

  const addressMedia = await buildAddressMedia(task);
  const address = buildAddressString(task);

  if (!address) {
    throw Object.assign(new Error("Task address is missing"), {
      pushError: { message: "Task address is missing", code: "MISSING_ADDRESS" },
    });
  }

  // Wema API binds:
  // - "request" (vendor metadata) at root
  // - "addressVerificationResponses" at root (see $.addressVerificationResponses[0].address in errors)
  const responseItem = omitUndefined({
    activityId: task.activityId,
    customerName: asString(task.customerName, ""),
    address,
    visitDate: toIsoDate(task.visitDate),
    addressExists: task.feedback?.addressExistence === "Yes",
    isResidentialAddress: task.feedback?.addressResidential === "Yes",
    isCustomerResidence: task.feedback?.customerResident === "Yes",
    isCustomerKnown: task.feedback?.customerKnown === "Yes",
    relationshipWithPersonMet: asString(
      task.feedback?.relatioshipWithCustomer,
      "N/A"
    ),
    nameOfPersonMet: asString(task.feedback?.nameOfPersonMet, "N/A"),
    easeOfLocation: asString(task.feedback?.easeOfLocation, "N/A"),
    comments: asString(task.feedback?.comments, ""),
    additionalComments: asString(task.feedback?.additionalComments, "N/A"),
    receivedDate: toIsoDate(task.feedback?.receivedDate),
    metOthers: task.feedback?.personMetOthers === "Yes",
    verificationStatus: mapVerificationStatus(task),
    addressMedia:
      addressMedia.length > 0
        ? addressMedia.map((item) => ({
            fileName: item.fileName,
            contentType: item.contentType,
            contentBase64: item.contentBase64,
            mediaType: item.mediaType,
          }))
        : undefined,
    reportUrl: task.feedback?.reportUrl || undefined,
  });

  const payload = {
    vendorId: client.integration.vendorExternalId,
    addressVerificationResponses: [responseItem],
  };

  if (options.writePayloadFile) {
    const payloadFilePath = await savePushPayloadToFile(payload);
    console.log("[pushTaskResultToClient] Payload saved to file", payloadFilePath);
  }

  // console.log("[pushTaskResultToClient] Payload shape", {
  //   activityId: task.activityId,
  //   hasRequest: Boolean(payload.request),
  //   hasRootResponses: Array.isArray(payload.addressVerificationResponses),
  //   responseCount: payload.addressVerificationResponses?.length,
  //   addressType: typeof payload.addressVerificationResponses?.[0]?.address,
  //   mediaCount: addressMedia.length,
  // });

  try {
    const response = await axios.post(client.integration.avsEndpoint, payload, {
      headers: {
        "Content-Type": "application/json",
        "x-vendor-id": client.integration.vendorExternalId,
        "Ocp-Apim-Subscription-Key": client.integration.subscriptionKey,
      },
      timeout: PUSH_TIMEOUT_MS,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });

    const result = {
      statuscode:response.data.statusCode || "null",
      status: response.status,
      statusText: response.statusText,
      message: response.data.message || "null",
      data: response.data,
    };

    // console.log(
    //   "[pushTaskResultToClient] Outbound payload",
    //   JSON.stringify(payload, null, 2)
    // );

    // console.log(
    //   "[pushTaskResultToClient] Client push succeeded",
    //   JSON.stringify(
    //     {
    //       activityId: task.activityId,
    //       status: result.status,
    //       statusText: result.statusText,
    //       data: result.data,
    //     },
    //     null,
    //     2
    //   )
    // );

    return result;
  } catch (err) {
    const formatted = formatPushError(err);
    const subscriptionKey = client.integration.subscriptionKey || "";
    console.error("[pushTaskResultToClient] Client push failed", {
      activityId: task.activityId,
      endpoint: client.integration.avsEndpoint,
      vendorId: client.integration.vendorExternalId,
      subscriptionKeyHint: subscriptionKey
        ? `***${subscriptionKey.slice(-4)}`
        : "missing",
      payloadBytes: Buffer.byteLength(JSON.stringify(payload)),
      mediaCount: addressMedia.length,
      ...formatted,
    });
    throw Object.assign(new Error(formatted.message), { pushError: formatted });
  }
}

module.exports = { pushTaskResultToClient };
