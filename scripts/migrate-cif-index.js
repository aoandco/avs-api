require("dotenv").config({ quiet: true });
const mongoose = require("mongoose");
const Task = require("../model/Task");

async function main() {
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is required");
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      autoIndex: false,
      autoCreate: false,
      serverSelectionTimeoutMS: 15000
    });
    console.log(`Database: ${mongoose.connection.name}`);
    const collection = Task.collection;
    const indexes = await collection.indexes();
    const legacy = indexes.find((index) => index.name === "cif_1");
    if (legacy && (Object.keys(legacy.key).length !== 1 || legacy.key.cif !== 1)) {
      throw new Error("Unexpected cif_1 index definition; migration stopped");
    }

    // Keep existing uniqueness protection until the replacement is built.
    await collection.createIndex(
      { cif: 1 },
      {
        name: "cif_unique_strings",
        unique: true,
        partialFilterExpression: { cif: { $type: "string" } }
      }
    );
    if (legacy) await collection.dropIndex("cif_1");

    const updated = await collection.indexes();
    const replacement = updated.find((index) => index.name === "cif_unique_strings");
    if (!replacement?.unique || replacement.partialFilterExpression?.cif?.$type !== "string" ||
        updated.some((index) => index.name === "cif_1")) {
      throw new Error("CIF index verification failed");
    }
    console.log("Verified: missing/null CIF allowed; string CIF values remain unique.");
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  // Avoid printing connection strings or credentials from driver errors.
  console.error(`CIF migration failed (${error.code || error.name}).`);
  process.exitCode = 1;
});
