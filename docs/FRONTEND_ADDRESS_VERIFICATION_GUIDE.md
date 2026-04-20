# Frontend Guide: Address Verification – New Fields (fullAddress & additionalInformation)

This document describes the updated **Address Verification** request and response shapes so the frontend can stay in sync with the backend.

---

## 1. Submit Address Verification – Request Body

**Endpoint:** `POST /v1/client/address-verification/submit`  
**Auth:** Bearer token **or** `x-api-key` header (see client auth docs).

### Request body shape

Send an object with a single key `addressVerificationResponses`, which is an **array** of address verification items:

```json
{
  "addressVerificationResponses": [
    {
      "activityId": "AVS-2024-000001",
      "customerName": "John Doe",
      "address": {
        "street": "12 Adeola Odeku Street",
        "area": "Victoria Island",
        "city": "Lagos",
        "state": "Lagos",
        "country": "Nigeria",
        "landmark": "Near Mega Plaza",
        "postalCode": "101241",
        "fullAddress": "45 , FCT 900288, Nigeria...",
        "additionalInformation": "House with Green Color"
      }
    }
  ]
}
```

### Address object fields

| Field | Type | Required | Description |
|------|------|----------|-------------|
| `street` | string | **Yes** | Street address |
| `area` | string | No | Area / locality |
| `city` | string | **Yes** | City |
| `state` | string | **Yes** | State / region |
| `country` | string | No | Default: `"Nigeria"` |
| `landmark` | string | No | Landmark description |
| `postalCode` | string | No | Postal / ZIP code |
| **`fullAddress`** | string | No | **New.** Single-line or full formatted address (used when provided instead of building from parts) |
| **`additionalInformation`** | string | No | **New.** Extra notes (e.g. building color, directions) |

- **`fullAddress`**: If provided, the backend uses it as the main verification address string. Otherwise it builds one from `street`, `area`, `city`, `state`, `country`.
- **`additionalInformation`**: Stored and returned wherever address verification data is exposed (APIs, webhooks, PDFs). Use for any extra context (e.g. “House with Green Color”).

### Validation

- `addressVerificationResponses` must be a non-empty array.
- Each item must have `activityId`, `customerName`, and `address` (with required address fields).
- Duplicate `activityId` values (already submitted) are skipped and listed in the response as `duplicates`.

### Example success response

```json
{
  "success": true,
  "message": "AVR request submitted successfully",
  "data": {
    "created": ["AVS-2024-000001", "AVS-2024-000002"],
    "duplicates": ["AVS-2024-000003"]
  }
}
```

- `created`: activity IDs that were accepted.
- `duplicates`: activity IDs that were skipped because they already exist (optional key, only present if there are duplicates).

---

## 2. List Tasks (Admin) and Get Tasks (Agent) – Process fullAddress & additionalInformation

The frontend **must** process the two new fields when rendering task lists from these APIs. Each task in the response includes an `address` object that may contain **`fullAddress`** and **`additionalInformation`**.

### Admin – List tasks

| | |
|--|--|
| **API** | List tasks (Admin) |
| **Method** | `GET` |
| **Endpoint** | `/v1/admin/tasks` |
| **Auth** | Bearer token (Admin) |

**Query params (optional):** `statusFilter`, `state`, `startDate`, `endDate`, `search`

**Response:** `{ success, message, totalTasks, data: tasks[] }`  
Each item in `data` is a task object. For each task:

- Read **`task.address.fullAddress`** when present and use it for “full address” display (e.g. in tables or detail views).
- Read **`task.address.additionalInformation`** when present and show it as extra notes (e.g. “House with Green Color”).

If `task.address.fullAddress` is missing, fall back to **`task.verificationAddress`** for the main address string.

---

### Agent – Get my tasks

| | |
|--|--|
| **API** | Get tasks (Agent) |
| **Method** | `GET` |
| **Endpoint** | `/v1/agent/my-tasks` |
| **Auth** | Bearer token (Agent) |

**Query params (optional):** `statusFilter`, `page`, `limit`

**Response:** `{ success, message, currentPage, totalPages, totalTasks, data: tasks[] }`  
Each item in `data` is a task object. For each task:

- Read **`task.address.fullAddress`** when present and use it for “full address” display.
- Read **`task.address.additionalInformation`** when present and show it as extra notes.

If `task.address.fullAddress` is missing, fall back to **`task.verificationAddress`** for the main address string.

---

### Task shape (both APIs)

Each task in `data` can look like:

```json
{
  "_id": "...",
  "activityId": "AVS-2024-000001",
  "customerName": "John Doe",
  "verificationAddress": "12 Adeola Odeku Street, Victoria Island, Lagos, Lagos, Nigeria",
  "address": {
    "street": "12 Adeola Odeku Street",
    "area": "Victoria Island",
    "city": "Lagos",
    "state": "Lagos",
    "country": "Nigeria",
    "landmark": "Near Mega Plaza",
    "postalCode": "101241",
    "fullAddress": "45 , FCT 900288, Nigeria...",
    "additionalInformation": "House with Green Color"
  },
  "state": "Lagos",
  "city": "Lagos",
  "status": "pending",
  "clientId": { ... },
  "agentId": { ... },
  ...
}
```

**Frontend action:** When rendering the list (table, cards, or detail view), display `task.address.fullAddress` when available, otherwise `task.verificationAddress`; and display `task.address.additionalInformation` when available.

---

## 3. Where fullAddress & additionalInformation Appear (Responses)

The backend now stores and returns `fullAddress` and `additionalInformation` in these places so the frontend can display them consistently.

### Client dashboard / reports (e.g. dashboard-stats, analytics)

When the API returns task or report data that includes address verification info, each relevant item can include:

- `verificationAddress` – Main address string (either `fullAddress` or built from address parts).
- **`fullAddress`** – Present when it was submitted; use for display or “full address” copy.
- **`additionalInformation`** – Present when it was submitted; use for extra notes (e.g. “House with Green Color”).

Example shape for a task/report item:

```json
{
  "activityId": "AVS-2024-000001",
  "customerName": "John Doe",
  "verificationAddress": "12 Adeola Odeku Street, Victoria Island, Lagos, Lagos, Nigeria",
  "fullAddress": "45 , FCT 900288, Nigeria...",
  "additionalInformation": "House with Green Color",
  "state": "Lagos",
  ...
}
```

- Prefer `fullAddress` for “full address” display when the user provided it; otherwise use `verificationAddress`.

### Webhooks / client callback (pushTaskResultToClient)

When the backend pushes verification results to the client’s endpoint (e.g. after report approval), the payload includes an `address` object. That object now includes:

- All existing address fields (`street`, `area`, `city`, `state`, `country`, `landmark`, `postalCode`).
- **`fullAddress`**
- **`additionalInformation`**

If your frontend or client system consumes this webhook, update it to read and display `fullAddress` and `additionalInformation` when present.

### PDF reports

Generated PDF reports now include, when available:

- **Full Address:** value of `fullAddress`
- **Additional Information:** value of `additionalInformation`

No frontend change is required for PDF generation; this is for consistency when users download or view reports.

---

## 4. Frontend checklist for syncing with backend

1. **Submit form / payload**
   - Add optional fields **`fullAddress`** and **`additionalInformation`** to the address object in `addressVerificationResponses`.
   - Keep sending existing required fields: `activityId`, `customerName`, `address.street`, `address.city`, `address.state`.

2. **Display**
   - Where you show “verification address”, prefer **`fullAddress`** when present, else **`verificationAddress`**.
   - Where you show extra notes, use **`additionalInformation`**.
   - **Admin list tasks** (`GET /v1/admin/tasks`) and **Agent get tasks** (`GET /v1/agent/my-tasks`): for each task in `data`, read `task.address.fullAddress` and `task.address.additionalInformation` and render them in the task list/detail UI.

3. **Client webhook consumer**
   - If you have a consumer for the client result webhook, extend it to handle **`address.fullAddress`** and **`address.additionalInformation`**.

4. **Validation**
   - Ensure `activityId` is unique per submission; the backend returns duplicates in `data.duplicates` so you can show which items were skipped.

---

## 5. Summary

| Context | fullAddress | additionalInformation |
|--------|-------------|------------------------|
| **Submit request** (`address`) | Optional | Optional |
| **Admin list tasks** `GET /v1/admin/tasks` | `task.address.fullAddress` | `task.address.additionalInformation` |
| **Agent get tasks** `GET /v1/agent/my-tasks` | `task.address.fullAddress` | `task.address.additionalInformation` |
| **Dashboard / report APIs** | Returned when stored | Returned when stored |
| **Webhook payload** (`address`) | Included when stored | Included when stored |
| **PDF report** | Printed when present | Printed when present |

For any endpoint that returns address verification data, the backend now includes **fullAddress** and **additionalInformation** where applicable so the frontend can sync with the backend efficiently.
