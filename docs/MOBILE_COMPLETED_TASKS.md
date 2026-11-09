# Mobile completed tasks

Open **Tasks → Browse completed tasks**, or tap the Completed dashboard card on the Tasks screen. Completed task cards open read-only details with a link to the saved report. Assigned tasks continue to open the submission flow.

The completed browser loads 25 records per page. Apply submits the filter form and returns to page 1; Reset clears all filters. Pull to refresh reloads the current page. Search matches customer name, activity ID, CIF, or verification address as literal text. Company and state support partial text. Approval is separate from task completion.

## API

`GET /agent/my-tasks` (under the configured agent base URL), authenticated with the existing bearer token:

| Parameter | Values |
|---|---|
| statusFilter | `completed` |
| page / limit | Positive page; mobile uses limit 25 |
| search | Customer, activity ID, CIF, address; max 200 characters |
| company | Partial company name; max 200 characters |
| state | Partial task or nested address state; max 200 characters |
| approval | `all`, `approved`, `unapproved` |
| dateField | `visitDate` or `createdAt` |
| startDate / endDate | `YYYY-MM-DD`; inclusive calendar dates in Nigeria time |
| sortBy | `createdAt`, `visitDate`, `customerName` |
| sortOrder | `asc` or `desc` |

Results and counts always use the authenticated agent ID. User-supplied agent IDs are ignored. Sorting includes a stable task-ID tie breaker. Invalid filters return HTTP 400. Existing `limit=all` behavior is preserved; numeric limits must be 1–100.

The browser deliberately excludes submission-time filters: historical `taskSubmissionDate` values can represent deadlines rather than actual submission times. Visit dates are not represented as completion timestamps.

## Rollout and checks

Deploy the API changes before distributing the updated Flutter app; an older API does not implement these filters. This change does not modify stored task statuses or dates.

Backend checks: `node --test util/agentTaskFilters.test.js controllers/agentController.tasks.test.js controllers/adminController.assignment.test.js`.

Mobile checks (from `ao-co-mobile`): `flutter test --no-pub test/completed_tasks_page_test.dart`.

No live API, physical device, report-provider availability, or production deployment was exercised by these local checks.
