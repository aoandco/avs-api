# Address Verification API – Frontend Integration Guide

This document describes the **Submit Address Verification** payload and where **fullAddress** and **additionalInformation** appear in requests and responses, so the frontend can stay in sync with the backend.

---

## 1. Submit Address Verification (Client → Backend)

**Endpoint:** `POST /v1/client/address-verification/submit`  
**Auth:** Bearer token **or** `x-api-key` header

### Request body

Send a single object with an array `addressVerificationResponses`. Each item has `activityId`, `customerName`, and an `address` object. The address supports two new optional fields: **fullAddress** and **additionalInformation**.

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

### Address field reference

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `street` | string | Yes | Street address |
| `area` | string | No | Area / locality |
| `city` | string | Yes | City |
| `state` | string | Yes | State / region |
| `country` | string | No | Default: `"Nigeria"` |
| `landmark` | string | No | Landmark description |
| `postalCode` | string | No | Postal / ZIP code |
| **`fullAddress`** | string | **No** | **Single-line or full formatted address.** If provided, the backend uses it as the primary display address (`verificationAddress`) for the task. |
| **`additionalInformation`** | string | **No** | **Extra notes (e.g. building color, gate code).** Stored and returned with the task. |

### Success response (200)

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

- `created`: activity IDs that were created.
- `duplicates`: activity IDs that were skipped because they already exist (optional; only present if there are duplicates).

### Validation errors (400)

If the body is invalid (e.g. missing required fields or wrong types), the API returns:

```json
{
  "success": false,
  "message": "Validation failed",
  "errors": ["\"activityId\" is required", "\"address\" is required"]
}
```

---

## 2. Where fullAddress and additionalInformation appear

### 2.1 Client dashboard / reports (task list and report cards)

When the client fetches **dashboard stats** or **task reports**, each task/report object can include:

- `verificationAddress` – string (built from address parts, or from `fullAddress` if it was submitted).
- **`fullAddress`** – string, optional. Present when the task was submitted with `address.fullAddress`.
- **`additionalInformation`** – string, optional. Present when the task was submitted with `address.additionalInformation`.

Use these in the UI for:

- Displaying the full address line (prefer `fullAddress` when present, else `verificationAddress`).
- Showing “Additional information” (e.g. “House with Green Color”) in task/report details.

### 2.2 Webhooks / callbacks (backend → client system)

When the backend pushes verification results to the client’s endpoint (e.g. after an agent completes a task), the payload includes an **address** object per response. That object now includes **fullAddress** and **additionalInformation** when available:

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
      },
      "visitDate": "...",
      "addressExists": true,
      ...
    }
  ]
}
```

Frontend or client systems that consume this webhook should:

- Read `address.fullAddress` for the full address string when present.
- Read `address.additionalInformation` for extra notes when present.

### 2.3 PDF reports

Generated PDF reports include:

- **Verification Address** (existing).
- **Full Address** – only if `fullAddress` was stored for the task.
- **Additional Information** – only if `additionalInformation` was stored.

No frontend change is required for PDFs; this is for consistency and for users who download reports.

---

## 3. Frontend checklist

- [ ] **Submit form:** Send `address.fullAddress` and `address.additionalInformation` in `POST /v1/client/address-verification/submit` when the user provides them.
- [ ] **Task/report display:** In client dashboard and report views, read and display `fullAddress` (fallback to `verificationAddress`) and `additionalInformation` from the task/report object.
- [ ] **Webhook consumer:** If you have a client-side or internal consumer for verification result webhooks, parse and display `address.fullAddress` and `address.additionalInformation` from each `addressVerificationResponses[].address`.
- [ ] **Types / interfaces:** Add `fullAddress?: string` and `additionalInformation?: string` to the address type used for submit payload and for task/report and webhook response types.

---

## 4. Summary

| Context | fullAddress | additionalInformation |
|--------|-------------|------------------------|
| **Submit request** (`POST .../address-verification/submit`) | Optional in `address` | Optional in `address` |
| **Dashboard / report API responses** | Optional on task/report | Optional on task/report |
| **Webhook payload (backend → client)** | In `address` when stored | In `address` when stored |
| **PDF report** | Printed when stored | Printed when stored |

Including **fullAddress** and **additionalInformation** in the submit request and using them in the UI and webhook handling will keep the frontend aligned with the backend and improve address display and notes for users.
