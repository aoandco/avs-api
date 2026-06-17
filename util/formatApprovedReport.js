function formatApprovedReportTask(task) {
  const {
    _id,
    activityId,
    customerName,
    verificationAddress,
    address,
    state,
    city,
    status,
    createdAt,
    reportIsApproved,
    taskUploadId,
    feedback = {},
  } = task;

  const upload =
    taskUploadId && typeof taskUploadId === "object" ? taskUploadId : null;

  const {
    addressExistence,
    addressResidential,
    customerResident,
    customerKnown,
    metWith,
    nameOfPersonMet,
    easeOfLocation,
    comments,
    additionalComments,
    relatioshipWithCustomer,
    customerRelationshipWithAddress,
    buildingColor,
    buildingType,
    areaProfile,
    landMark,
    receivedDate,
    personMetOthers,
    visitFeedback,
    reportUrl,
    recordedAudio,
    recordedVideo,
    geoMapping = {},
    geotaggedImages = [],
  } = feedback;

  const { lat, lng } = geoMapping;
  const firstImage = geotaggedImages[0] || null;
  const secondImage = geotaggedImages[1] || null;

  return {
    _id,
    activityId,
    cif: task.cif,
    customerName,
    verificationAddress,
    fullAddress: address?.fullAddress,
    additionalInformation: address?.additionalInformation,
    street: address?.street,
    area: address?.area,
    city: address?.city || city,
    state: address?.state || state,
    country: address?.country,
    landmark: address?.landmark,
    postalCode: address?.postalCode,
    status,
    createdAt,
    reportIsApproved,
    taskUploadId: upload?._id || taskUploadId || null,
    uploadFileName: upload?.fileName || null,
    uploadDate: upload?.uploadedAt || null,
    addressExistence,
    addressResidential,
    customerResident,
    customerKnown,
    metWith,
    nameOfPersonMet,
    easeOfLocation,
    comments,
    additionalComments,
    relatioshipWithCustomer,
    customerRelationshipWithAddress,
    buildingColor,
    buildingType,
    areaProfile,
    landMark,
    receivedDate,
    personMetOthers,
    visitFeedback,
    recordedAudio,
    recordedVideo,
    latitude: lat,
    longitude: lng,
    firstGeotaggedImage: firstImage,
    secondGeotaggedImage: secondImage,
    reportUrl,
  };
}

const APPROVED_REPORT_TASK_SELECT = `
  activityId
  cif
  customerName
  verificationAddress
  address
  state
  city
  status
  createdAt
  reportIsApproved
  taskUploadId
  feedback.addressExistence
  feedback.addressResidential
  feedback.customerResident
  feedback.customerKnown
  feedback.metWith
  feedback.nameOfPersonMet
  feedback.easeOfLocation
  feedback.comments
  feedback.additionalComments
  feedback.relatioshipWithCustomer
  feedback.customerRelationshipWithAddress
  feedback.buildingColor
  feedback.buildingType
  feedback.areaProfile
  feedback.landMark
  feedback.receivedDate
  feedback.personMetOthers
  feedback.visitFeedback
  feedback.geoMapping
  feedback.geotaggedImages
  feedback.recordedAudio
  feedback.recordedVideo
  feedback.reportUrl
`;

module.exports = {
  formatApprovedReportTask,
  APPROVED_REPORT_TASK_SELECT,
};
