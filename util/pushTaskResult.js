const axios = require("axios");
const {buildAddressMedia} = require("../util/buildAddressMedia")

function mapVerificationStatus(task) {
  if (!task.reportIsApproved) return 1;        // Pending
  if (task.status === "completed") return 2;   // Success
  if (task.status === "incomplete") return 3;  // Failed
  return 4;                                    // Returned
}

async function pushTaskResultToClient(task, client) {

  if (!client?.integration?.integrationEnabled) return;

  const payload = {
    vendorId: client.integration.vendorExternalId,
    addressVerificationResponses: [
      {
        activityId: task.activityId,
        customerName: task.customerName,
        address: task.verificationAddress,
        visitDate: task.visitDate,
        addressExists: task.feedback.addressExistence === "Yes",
        isResidentialAddress: task.feedback.addressResidential === "Yes",
        isCustomerResidence: task.feedback.customerResident === "Yes",
        isCustomerKnown: task.feedback.customerKnown === "Yes",
        relationshipWithPersonMet: task.feedback.relatioshipWithCustomer,
        nameOfPersonMet: task.feedback.nameOfPersonMet,
        easeOfLocation: task.feedback.easeOfLocation,
        comments: task.feedback.comments,
        additionalComments: task.feedback.additionalComments,
        receivedDate: task.feedback.receivedDate,
        metOthers: task.feedback.personMetOthers === "Yes",
        verificationStatus: mapVerificationStatus(task),
        addressMedia: await buildAddressMedia(task),
        reportUrl: task.feedback.reportUrl
      }
    ]
  };

  await axios.post(
    client.integration.avsEndpoint,
    payload,
    {
      headers: {
        "Content-Type": "application/json",
        "x-vendor-id": client.integration.vendorExternalId,
        "Ocp-Apim-Subscription-Key": client.integration.subscriptionKey
      },
      timeout: 15000
    }
  );
}

module.exports = {pushTaskResultToClient}