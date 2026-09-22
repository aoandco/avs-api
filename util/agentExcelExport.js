function formatCellDate(value) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString();
}

function buildAgentTaskExportRows(tasks) {
  return tasks.map((task, index) => ({
    "S/N": index + 1,
    "Task ID": String(task._id),
    "Activity ID": task.activityId || "",
    CIF: task.cif || "",
    "Customer Name": task.customerName || "",
    "Company Name": task.clientId?.companyName || "N/A",
    "Verification Address":
      task.address?.fullAddress || task.verificationAddress || "",
    Street: task.address?.street || "",
    Area: task.address?.area || "",
    City: task.address?.city || task.city || "",
    State: task.address?.state || task.state || "",
    Country: task.address?.country || "",
    Status: task.status || "",
    "Report Approved": task.reportIsApproved ? "Yes" : "No",
    "Date Created": formatCellDate(task.createdAt),
    "Visit Date": formatCellDate(task.visitDate),
    "Date Verified": formatCellDate(
      task.taskSubmissionDate || task.visitDate || task.feedback?.receivedDate
    ),
    "Received Date": formatCellDate(task.feedback?.receivedDate),
    "Report URL": task.feedback?.reportUrl || "",
  }));
}

function buildAgentReportExportRows(tasks) {
  return tasks.map((task, index) => {
    const formatted = typeof task.toObject === "function" ? task.toObject() : task;
    const feedback = formatted.feedback || {};
    return {
      "S/N": index + 1,
      "Task ID": String(formatted._id),
      "Activity ID": formatted.activityId || "",
      CIF: formatted.cif || "",
      "Customer Name": formatted.customerName || "",
      "Company Name": formatted.clientId?.companyName || "N/A",
      "Verification Address":
        formatted.address?.fullAddress || formatted.verificationAddress || "",
      Status: formatted.status || "",
      "Report Approved": formatted.reportIsApproved ? "Yes" : "No",
      "Date Created": formatCellDate(formatted.createdAt),
      "Visit Date": formatCellDate(formatted.visitDate),
      "Date Verified": formatCellDate(
        formatted.taskSubmissionDate ||
          formatted.visitDate ||
          feedback.receivedDate
      ),
      "Received Date": formatCellDate(feedback.receivedDate),
      "Address Existence": feedback.addressExistence || "",
      "Address Residential": feedback.addressResidential || "",
      "Customer Resident": feedback.customerResident || "",
      "Customer Known": feedback.customerKnown || "",
      "Met With": feedback.metWith || "",
      "Name of Person Met": feedback.nameOfPersonMet || "",
      Comments: feedback.comments || "",
      "Report URL": feedback.reportUrl || "",
    };
  });
}

module.exports = {
  buildAgentTaskExportRows,
  buildAgentReportExportRows,
  formatCellDate,
};
