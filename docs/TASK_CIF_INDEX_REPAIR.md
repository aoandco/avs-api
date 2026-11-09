# Repair task submissions rejected with `cif_1 dup key: { cif: null }`

The database still has the legacy `cif_1` index. A unique single-field index
allows only one missing/null CIF. The current Task schema's partial unique
index only covers string CIFs, but a schema change does not drop old indexes.

Run this once in the API environment with `MONGO_URI` pointing at the affected
database (`aoandco-avs` in the reported error):

```sh
npm run db:repair-task-cif-index
```

The command creates `cif_unique_strings` before removing `cif_1`. It does not
delete or update tasks, or change any other indexes. It is safe to rerun. If
replacement creation fails, the legacy index stays in place and the command
exits with an error; resolve that error before retrying. The database account
needs permission to list, create, and drop indexes.

Verify the `tasks` collection indexes: `cif_unique_strings` should have
`unique: true` and `partialFilterExpression: { cif: { $type: "string" } }`,
and `cif_1` should be absent. Submit two tasks with distinct activity IDs and
no CIF through the normal authenticated API and confirm both are saved.

After verification, arrange for Wema to resend submissions rejected since the
incident began. Rejected inserts are not restored by repairing the index.
Reconcile activity IDs against saved tasks before replaying batches, since
some tasks may already have been accepted.
