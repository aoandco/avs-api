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

## 2. Where fullAddress & additionalInformation Appear (Responses)

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

## 3. Frontend checklist for syncing with backend

1. **Submit form / payload**
   - Add optional fields **`fullAddress`** and **`additionalInformation`** to the address object in `addressVerificationResponses`.
   - Keep sending existing required fields: `activityId`, `customerName`, `address.street`, `address.city`, `address.state`.

2. **Display**
   - Where you show “verification address”, prefer **`fullAddress`** when present, else **`verificationAddress`**.
   - Where you show extra notes, use **`additionalInformation`**.

3. **Client webhook consumer**
   - If you have a consumer for the client result webhook, extend it to handle **`address.fullAddress`** and **`address.additionalInformation`**.

4. **Validation**
   - Ensure `activityId` is unique per submission; the backend returns duplicates in `data.duplicates` so you can show which items were skipped.

---

## 4. Summary

| Context | fullAddress | additionalInformation |
|--------|-------------|------------------------|
| **Submit request** (`address`) | Optional | Optional |
| **Dashboard / report APIs** | Returned when stored | Returned when stored |
| **Webhook payload** (`address`) | Included when stored | Included when stored |
| **PDF report** | Printed when present | Printed when present |

For any endpoint that returns address verification data, the backend now includes **fullAddress** and **additionalInformation** where applicable so the frontend can sync with the backend efficiently.
