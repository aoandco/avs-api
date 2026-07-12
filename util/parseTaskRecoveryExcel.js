const mongoose = require("mongoose");

const DEFAULT_RECOVERY_CLIENT_ID = "69788114a62a26e8f9d0ab9d";
const DEFAULT_RECOVERY_AGENT_ID = "6995693dc829abb836ee60aa";

const AREA_PROFILE_VALUES = new Set(["low", "high", "medium", "major", "N/A"]);

function getCell(row, ...keys) {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return undefined;
}

function normalizeYesNo(value) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const normalized = String(value).trim().toLowerCase();
  if (["yes", "y", "true", "1"].includes(normalized)) {
    return "Yes";
  }
  if (["no", "n", "false", "0"].includes(normalized)) {
    return "No";
  }

  return String(value).trim();
}

function normalizeAreaProfile(value) {
  if (!value) {
    return undefined;
  }

  const normalized = String(value).trim().toLowerCase();
  if (AREA_PROFILE_VALUES.has(normalized)) {
    return normalized === "n/a" ? "N/A" : normalized;
  }

  return "N/A";
}

function parseExcelDate(value) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const utcDays = Math.floor(value - 25569);
    const utcValue = utcDays * 86400 * 1000;
    const parsed = new Date(utcValue);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function parseNumber(value) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function mapTaskStatus(row) {
  const verificationStatus = getCell(
    row,
    "Verification Status",
    "verificationStatus",
    "VerificationStatus"
  );
  const status = getCell(row, "Status", "status");

  const normalized = String(verificationStatus || status || "")
    .trim()
    .toLowerCase();

  if (
    ["successful", "success", "verified", "completed", "complete"].includes(
      normalized
    )
  ) {
    return "completed";
  }

  if (
    ["incomplete", "failed", "returned", "unsuccessful", "fail"].includes(
      normalized
    )
  ) {
    return "incomplete";
  }

  if (["assigned"].includes(normalized)) {
    return "assigned";
  }

  if (["over-due", "overdue"].includes(normalized)) {
    return "over-due";
  }

  if (["pending"].includes(normalized)) {
    return "pending";
  }

  const hasReport = Boolean(
    getCell(row, "Report URL", "reportUrl", "Report Url")
  );
  const hasFeedback = Boolean(
    getCell(
      row,
      "Address Existence",
      "addressExistence",
      "addressExist",
      "Address Exist"
    )
  );

  if (hasReport || hasFeedback) {
    return "completed";
  }

  return "pending";
}

function buildAdditionalComments(row) {
  const existing = getCell(
    row,
    "Additional Comments",
    "additionalComments",
    "Additional Information",
    "additionalInformation"
  );

  const buildingCompletion = getCell(
    row,
    "Building Completion",
    "buildingCompletion"
  );
  const buildingFinishing = getCell(
    row,
    "Building Finishing",
    "buildingFinishing"
  );
  const visitTime = getCell(row, "visitTime", "Visit Time", "VisitTime");

  const parts = [];
  if (existing) {
    parts.push(existing);
  }
  if (buildingCompletion) {
    parts.push(`Building Completion: ${buildingCompletion}`);
  }
  if (buildingFinishing) {
    parts.push(`Building Finishing: ${buildingFinishing}`);
  }
  if (visitTime) {
    parts.push(`Visit Time: ${visitTime}`);
  }

  return parts.length ? parts.join("; ") : undefined;
}

function buildGeotaggedImages(row) {
  const images = [
    getCell(row, "First Geotagged Image", "firstGeotaggedImage"),
    getCell(row, "Second Geotagged Image", "secondGeotaggedImage"),
  ].filter(Boolean);

  return [...new Set(images)];
}

function mapRecoveryRowToTask(row, options = {}) {
  const clientId = options.clientId || DEFAULT_RECOVERY_CLIENT_ID;
  const agentId = options.agentId || DEFAULT_RECOVERY_AGENT_ID;

  const customerName = getCell(
    row,
    "Customer Name",
    "CustomerName",
    "customerName"
  );
  const verificationAddress = getCell(
    row,
    "Verification Address",
    "VerificationAddress",
    "verificationAddress",
    "Full Address",
    "FullAddress",
    "fullAddress"
  );

  if (!customerName || !verificationAddress) {
    return {
      error: "Missing customer name or verification address.",
      row,
    };
  }

  const activityId = getCell(
    row,
    "Activity ID",
    "Activity Id",
    "Activity id",
    "activity Id",
    "activity id",
    "ActivityID",
    "activityId"
  );

  if (!activityId) {
    return {
      error: "Missing activity ID.",
      row,
    };
  }

  const street =
    getCell(row, "Street", "street") || verificationAddress.slice(0, 120);
  const city = getCell(row, "City", "city") || "Unknown";
  const state = getCell(row, "State", "state") || "Unknown";
  const area = getCell(row, "Area", "Town", "area");
  const landmark = getCell(row, "Landmark", "landmark");
  const country = getCell(row, "Country", "country") || "Nigeria";
  const postalCode = getCell(row, "Postal Code", "postalCode");
  const additionalInformation = getCell(
    row,
    "Additional Information",
    "additionalInformation"
  );

  const visitDate = parseExcelDate(
    getCell(row, "visitDate", "Visit Date", "VisitDate")
  );
  const receivedDate = parseExcelDate(
    getCell(row, "Received Date", "receivedDate", "ReceivedDate")
  );
  const createdAt = parseExcelDate(
    getCell(row, "Date Created", "createdAt", "Created At")
  );

  const latitude = parseNumber(getCell(row, "Latitude", "latitude"));
  const longitude = parseNumber(getCell(row, "Longitude", "longitude"));

  const reportUrl = getCell(row, "Report URL", "reportUrl", "Report Url");
  const geotaggedImages = buildGeotaggedImages(row);
  const status = mapTaskStatus(row);

  const reportApprovedRaw = getCell(
    row,
    "Report Approved",
    "reportIsApproved",
    "ReportApproved"
  );
  const reportIsApproved =
    reportApprovedRaw !== undefined
      ? ["yes", "true", "1"].includes(reportApprovedRaw.toLowerCase())
      : Boolean(reportUrl) || status === "completed";

  const taskIdRaw = getCell(row, "Task ID", "_id", "taskId");
  const taskDoc = {
    clientId: new mongoose.Types.ObjectId(clientId),
    agentId: new mongoose.Types.ObjectId(agentId),
    activityId,
    customerName,
    verificationAddress,
    city,
    state,
    status,
    visitDate,
    assignedDate: visitDate || createdAt || undefined,
    taskSubmissionDate: receivedDate || visitDate || undefined,
    reportIsApproved,
    address: {
      street,
      area,
      city,
      state,
      country,
      landmark,
      postalCode,
      fullAddress: verificationAddress,
      additionalInformation,
    },
    feedback: {
      addressExistence: normalizeYesNo(
        getCell(
          row,
          "Address Existence",
          "addressExistence",
          "addressExist",
          "Address Exist",
          "address Exist"
        )
      ),
      addressResidential: normalizeYesNo(
        getCell(
          row,
          "Address Residential",
          "addressResidential",
          "addressResidential"
        )
      ),
      customerResident: normalizeYesNo(
        getCell(row, "Customer Resident", "customerResident")
      ),
      customerKnown: normalizeYesNo(
        getCell(row, "Customer Known", "customerKnown")
      ),
      metWith: getCell(row, "Met With", "metWith"),
      nameOfPersonMet: getCell(
        row,
        "Name of Person Met",
        "nameOfPersonMet"
      ),
      easeOfLocation: getCell(
        row,
        "Ease of Location",
        "easeOfLocation"
      ),
      comments: getCell(row, "Comments", "comments"),
      additionalComments: buildAdditionalComments(row),
      relatioshipWithCustomer: getCell(
        row,
        "Relationship With Customer",
        "relatioshipWithCustomer",
        "Relationship with Customer"
      ),
      customerRelationshipWithAddress: getCell(
        row,
        "Customer Relationship with Address",
        "Customer Relationship With address",
        "customerRelationshipWithAddress"
      ),
      buildingColor: getCell(row, "Building Color", "Color", "buildingColor"),
      buildingType: getCell(row, "Building Type", "buildingType"),
      areaProfile: normalizeAreaProfile(
        getCell(row, "Area Profile", "areaProfile")
      ),
      landMark: getCell(row, "Landmark (Visit)", "landMark", "Landmark"),
      receivedDate,
      personMetOthers: getCell(
        row,
        "Person Met Others",
        "personMetOthers"
      ),
      visitFeedback: getCell(row, "Visit Feedback", "visitFeedback"),
      geoMapping: {
        lat: latitude,
        lng: longitude,
      },
      geotaggedImages,
      recordedAudio: getCell(row, "Recorded Audio", "recordedAudio"),
      recordedVideo: getCell(row, "Recorded Video", "recordedVideo"),
      reportUrl,
    },
  };

  const cif = getCell(row, "CIF", "Cif", "cif");
  if (cif) {
    taskDoc.cif = cif;
  }

  if (createdAt) {
    taskDoc.createdAt = createdAt;
  }

  if (taskIdRaw && mongoose.Types.ObjectId.isValid(taskIdRaw)) {
    taskDoc._id = new mongoose.Types.ObjectId(taskIdRaw);
  }

  return { taskDoc, activityId, cif };
}

function parseTaskRecoveryRows(rows, options = {}) {
  const parsed = [];
  const invalid = [];

  rows.forEach((row, index) => {
    const result = mapRecoveryRowToTask(row, options);
    if (result.error) {
      invalid.push({
        rowNumber: index + 2,
        reason: result.error,
        activityId: getCell(
          row,
          "Activity ID",
          "Activity Id",
          "Activity id",
          "activityId"
        ),
      });
      return;
    }

    parsed.push({
      rowNumber: index + 2,
      ...result,
    });
  });

  return { parsed, invalid };
}

module.exports = {
  DEFAULT_RECOVERY_CLIENT_ID,
  DEFAULT_RECOVERY_AGENT_ID,
  parseTaskRecoveryRows,
  mapRecoveryRowToTask,
};
