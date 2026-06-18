function applyDateRangeFilter(filter, startDate, endDate, field) {
  if (!startDate && !endDate) {
    return null;
  }

  const range = {};

  if (startDate) {
    const start = new Date(startDate);
    if (Number.isNaN(start.getTime())) {
      return { error: "Invalid startDate." };
    }
    start.setUTCHours(0, 0, 0, 0);
    range.$gte = start;
  }

  if (endDate) {
    const end = new Date(endDate);
    if (Number.isNaN(end.getTime())) {
      return { error: "Invalid endDate." };
    }
    end.setUTCHours(23, 59, 59, 999);
    range.$lte = end;
  }

  if (range.$gte && range.$lte && range.$gte.getTime() > range.$lte.getTime()) {
    return { error: "startDate cannot be after endDate." };
  }

  filter[field] = range;
  return null;
}

function resolveTaskDateFilterField(dateFilter) {
  const normalized = String(dateFilter || "taskCreated").trim().toLowerCase();

  if (
    normalized === "taskcreated" ||
    normalized === "task_created" ||
    normalized === "createdat"
  ) {
    return { field: "createdAt" };
  }

  if (
    normalized === "reportcreated" ||
    normalized === "report_created" ||
    normalized === "receiveddate"
  ) {
    return { field: "feedback.receivedDate" };
  }

  return {
    error: 'Invalid dateFilter. Use "taskCreated" or "reportCreated".',
  };
}

module.exports = {
  applyDateRangeFilter,
  resolveTaskDateFilterField,
};
