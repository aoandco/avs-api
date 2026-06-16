const WEMA_CLIENT_ID = ObjectId("69788114a62a26e8f9d0ab9d");
const OLD_CLIENT_ID = ObjectId("69958c62c829abb836ee61dc");
const TASK_UPLOAD_ID = ObjectId("6a2557768b513906302a06bf");

print("=== Wema task migration ===");
print("Database:", db.getName());

print("\n--- Preview ---");
print("Tasks not yet on Wema client:", db.tasks.countDocuments({
  clientId: { $ne: WEMA_CLIENT_ID },
}));

print("TaskUpload before:", JSON.stringify(
  db.taskuploads.findOne(
    { _id: TASK_UPLOAD_ID, clientId: OLD_CLIENT_ID },
    { _id: 1, clientId: 1, fileName: 1 }
  )
));

print("\n--- Step 1: Update tasks ---");
const taskResult = db.tasks.updateMany(
  { clientId: { $ne: WEMA_CLIENT_ID } },
  {
    $set: {
      clientId: WEMA_CLIENT_ID,
      taskUploadId: TASK_UPLOAD_ID,
    },
  }
);
print("Tasks update:", JSON.stringify(taskResult));

print("\n--- Step 2: Update TaskUpload ---");
const uploadResult = db.taskuploads.updateOne(
  {
    _id: TASK_UPLOAD_ID,
    clientId: OLD_CLIENT_ID,
  },
  {
    $set: { clientId: WEMA_CLIENT_ID },
  }
);
print("TaskUpload update:", JSON.stringify(uploadResult));

print("\n--- Verify ---");
print("Tasks on Wema client:", db.tasks.countDocuments({ clientId: WEMA_CLIENT_ID }));
print("Tasks linked to upload:", db.tasks.countDocuments({ taskUploadId: TASK_UPLOAD_ID }));

print("TaskUpload after:", JSON.stringify(
  db.taskuploads.findOne(
    { _id: TASK_UPLOAD_ID },
    { _id: 1, clientId: 1, fileName: 1 }
  )
));

printjson(db.tasks.findOne(
  { taskUploadId: TASK_UPLOAD_ID },
  { _id: 1, clientId: 1, taskUploadId: 1, activityId: 1 }
));

print("\n=== Done ===");
