# Reassigning completed tasks

Admins can use the existing Reassign action on a completed task to send it
back to its submitting agent or select another agent, for example when images
or video are missing. Bulk assignment supports completed tasks too.

API: `POST /v1/admin/assign-task/:agentId` with an admin bearer token and body:

```json
{ "taskIds": ["<task ID>"] }
```

The selected agent ID may be the current agent or another existing agent.
Reassignment changes the task status to `assigned`, refreshes `assignedDate`,
and sets a new 48-hour submission deadline in `taskSubmissionDate`.
Existing feedback, visit details, and media remain available for reference.
Report approval is reset and the old PDF link is removed. The agent can then
submit the task again through the existing submission flow, which replaces
the feedback and media with the new submission and generates a fresh report.

The response retains the existing `assigned`, `reassigned`, `skipped`, and
corresponding task arrays. Check `skippedTasks` for invalid IDs, missing tasks,
or assignments that changed concurrently. A completed task that changes owner
or leaves completed status before the update is skipped.
