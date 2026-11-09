const { test } = require("node:test");
const assert = require("node:assert/strict");
const { repairTaskCifIndex } = require("./repairTaskCifIndex");

function collection(indexes, buildError) {
  const calls = [];
  return {
    calls,
    listIndexes: () => ({ toArray: async () => indexes }),
    createIndex: async (...args) => {
      calls.push(["create", ...args]);
      if (buildError) throw buildError;
    },
    dropIndex: async (name) => calls.push(["drop", name]),
  };
}

test("builds the partial unique index before dropping the legacy index", async () => {
  const db = collection([{ name: "cif_1", key: { cif: 1 }, unique: true }]);
  await repairTaskCifIndex(db);
  assert.deepEqual(db.calls, [
    ["create", { cif: 1 }, { name: "cif_unique_strings", unique: true, partialFilterExpression: { cif: { $type: "string" } } }],
    ["drop", "cif_1"],
  ]);
});

test("preserves the old index if replacement creation fails", async () => {
  const db = collection([{ name: "cif_1", key: { cif: 1 } }], new Error("build failed"));
  await assert.rejects(repairTaskCifIndex(db), /build failed/);
  assert.equal(db.calls.length, 1);
});

test("can run again without the legacy index", async () => {
  const db = collection([{ name: "cif_unique_strings", key: { cif: 1 } }]);
  await repairTaskCifIndex(db);
  assert.equal(db.calls.length, 1);
});

test("refuses to remove an unexpected index definition", async () => {
  const db = collection([{ name: "cif_1", key: { cif: 1, clientId: 1 } }]);
  await assert.rejects(repairTaskCifIndex(db), /refusing/);
  assert.deepEqual(db.calls, []);
});
