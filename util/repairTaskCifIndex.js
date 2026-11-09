const CIF_INDEX_NAME = "cif_unique_strings";

async function repairTaskCifIndex(collection) {
  let indexes;
  try {
    indexes = await collection.listIndexes().toArray();
  } catch (error) {
    if (error.code !== 26) throw error; // NamespaceNotFound on a new database
    indexes = [];
  }

  const legacy = indexes.find((index) => index.name === "cif_1");
  if (legacy && (Object.keys(legacy.key).length !== 1 || legacy.key.cif !== 1)) {
    throw new Error("Unexpected cif_1 index definition; refusing to remove it");
  }

  // Keep string CIF uniqueness enforced throughout the migration. If the build
  // fails, the old index remains and the error is returned to the operator.
  await collection.createIndex(
    { cif: 1 },
    {
      name: CIF_INDEX_NAME,
      unique: true,
      partialFilterExpression: { cif: { $type: "string" } },
    }
  );

  if (legacy) {
    try {
      await collection.dropIndex("cif_1");
    } catch (error) {
      if (error.code !== 27) throw error; // Another invocation already removed it
    }
  }
}

module.exports = { repairTaskCifIndex };

if (require.main === module) {
  require("dotenv").config();
  const mongoose = require("mongoose");

  (async () => {
    try {
      if (!process.env.MONGO_URI) throw new Error("MONGO_URI is required");
      await mongoose.connect(process.env.MONGO_URI, {
        autoIndex: false,
        serverSelectionTimeoutMS: 15000,
      });
      await repairTaskCifIndex(mongoose.connection.collection("tasks"));
      console.log("Task CIF index repaired: null/missing CIFs are allowed; string CIFs remain unique.");
    } catch (error) {
      console.error("Task CIF index repair failed:", error.message);
      process.exitCode = 1;
    } finally {
      await mongoose.disconnect();
    }
  })();
}
