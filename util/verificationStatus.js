function isReturnedVerificationTask(task) {
  return (
    task.status === "incomplete" &&
    task.feedback?.addressExistence === "No" &&
    task.feedback?.customerResident === "No"
  );
}

function mapVerificationStatus(task) {
  if (task.status === "completed") return 2; // Success
  if (
    task.status === "incomplete" &&
     task.feedback?.addressExistence === "Yes" &&
    task.feedback?.customerResident === "No"
   
  ) {
    return 3; // Failed
  }
  if (isReturnedVerificationTask(task)) {
    return 4; // Returned
  }
  return 4;
}

const VERIFICATION_RETURNED_QUERY = {
  status: "incomplete",
  "feedback.customerResident": "No",
  "feedback.addressExistence": "No",
};

const VERIFICATION_FAILED_QUERY = {
  status: "incomplete",
 "feedback.customerResident": "No",
 "feedback.addressExistence": "Yes",
};

const VERIFICATION_SUCCESS_QUERY = {
  status: "completed",
};

const VERIFICATION_FILTER_MAP = {
  success: VERIFICATION_SUCCESS_QUERY,
  2: VERIFICATION_SUCCESS_QUERY,
  failed: VERIFICATION_FAILED_QUERY,
  3: VERIFICATION_FAILED_QUERY,
  returned: VERIFICATION_RETURNED_QUERY,
  4: VERIFICATION_RETURNED_QUERY,
};

function getVerificationStatusFilter(verificationFilter) {
  const normalized = String(verificationFilter || "")
    .trim()
    .toLowerCase();

  if (!normalized || normalized === "all") {
    return null;
  }

  return VERIFICATION_FILTER_MAP[normalized] || null;
}

function getApprovalFilter(approvalFilter) {
  const normalized = String(approvalFilter || "")
    .trim()
    .toLowerCase();

  if (!normalized || normalized === "all") {
    return null;
  }

  if (normalized === "approved") {
    return { reportIsApproved: true };
  }

  if (normalized === "unapproved") {
    return { reportIsApproved: { $ne: true } };
  }

  if (normalized === "approval-success") {
    return buildApprovedVerificationFilter("success");
  }

  if (normalized === "approval-failed") {
    return buildApprovedVerificationFilter("failed");
  }

  if (normalized === "approval-returned") {
    return buildApprovedVerificationFilter("returned");
  }

  return null;
}

function buildApprovedVerificationFilter(verificationFilter, baseFilter = {}) {
  const verificationQuery = getVerificationStatusFilter(verificationFilter);
  if (!verificationQuery) {
    return null;
  }

  return {
    ...baseFilter,
    reportIsApproved: true,
    ...verificationQuery,
  };
}

module.exports = {
  mapVerificationStatus,
  isReturnedVerificationTask,
  getVerificationStatusFilter,
  getApprovalFilter,
  buildApprovedVerificationFilter,
  VERIFICATION_SUCCESS_QUERY,
  VERIFICATION_FAILED_QUERY,
  VERIFICATION_RETURNED_QUERY,
};
