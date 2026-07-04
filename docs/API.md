# API Documentation — Intelligent Vendor Routing Platform

REST API reference for the backend. All endpoints accept and return JSON.

---

## Environments & Base URLs

| Environment | Base URL |
|---|---|
| Local development | `http://localhost:3000/api/v1` |
| Production (Render) | `https://intelligent-vendor-routing-platform.onrender.com/api/v1` |

> Replace the production URL with your actual Render service URL if it
> differs. All endpoint paths below are relative to the base URL — e.g.
> `POST /vendors` means `POST http://localhost:3000/api/v1/vendors` locally
> and `POST https://intelligent-vendor-routing-platform.onrender.com/api/v1/vendors`
> in production.

**Server liveness check** (outside the `/api/v1` prefix):

```
GET http://localhost:3000/
GET https://intelligent-vendor-routing-platform.onrender.com/
```

```json
{ "success": true, "message": "Intelligent Vendor Routing Platform API is running" }
```

> Render free-tier services sleep after inactivity — the first request after a
> long idle can take 30–60 seconds while the service wakes up.

## Conventions

**Headers:** every request with a body requires `Content-Type: application/json`.
There is no authentication (intentionally out of scope for this project).

**Response envelope** — every endpoint uses the same shape:

```json
// success
{ "success": true, "message": "...", "data": { } }

// error
{ "success": false, "error": "Human-readable message" }
```

**IDs** are MongoDB ObjectIds (24-hex-character strings).

---

## Table of Contents

- [Vendor Management](#vendor-management)
  - [POST /vendors](#post-vendors) 
  - [GET /vendors](#get-vendors) 
  - [PUT /vendors/:id](#put-vendorsid) 
  - [DELETE /vendors/:id](#delete-vendorsid)
- [Routing](#routing)
  - [POST /route](#post-route)
- [Observability](#observability)
  - [GET /vendor-metrics](#get-vendor-metrics) 
  - [GET /routing-logs](#get-routing-logs) 
  - [GET /health](#get-health)
- [AI Module](#ai-module)
  - [POST /ai/generate-config](#post-aigenerate-config) 
  - [POST /ai/explain-route](#post-aiexplain-route)
- [Error Reference](#error-reference)

---

## Vendor Management

### POST /vendors

Create a new vendor.

```
POST http://localhost:3000/api/v1/vendors
POST https://intelligent-vendor-routing-platform.onrender.com/api/v1/vendors
```

**Request body**

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `name` | string | Yes | — | Vendor display name, must be unique |
| `priority` | number | No | `10` | Rank for priority/failover routing; **lower = higher priority** |
| `weight` | number | No | `50` | Relative traffic share (0–100) for weighted routing; `0` drains traffic |
| `cost` | number | Yes | — | Cost per request (any consistent unit) |
| `avgLatencyMs` | number | Yes | — | Baseline latency; used by latency routing and the mock simulator |
| `rateLimitPerMin` | number | No | `60` | Stored for future enforcement (not yet enforced) |
| `capabilities` | string[] | Yes | — | Capabilities served, e.g. `["PAN_VERIFICATION", "OCR"]` |
| `enabled` | boolean | No | `true` | Disabled vendors are never routed to |
| `failureRate` | number | No | `0.05` | Probability (0–1) the mock vendor simulates a failure |

```json
{
  "name": "Vendor D",
  "priority": 4,
  "weight": 20,
  "cost": 4,
  "avgLatencyMs": 900,
  "rateLimitPerMin": 60,
  "capabilities": ["OCR", "SMS"],
  "enabled": true,
  "failureRate": 0.1
}
```

**cURL**

```bash
curl -X POST http://localhost:3000/api/v1/vendors \
  -H "Content-Type: application/json" \
  -d '{"name":"Vendor D","priority":4,"weight":20,"cost":4,"avgLatencyMs":900,"capabilities":["OCR","SMS"],"failureRate":0.1}'
```

**Response `201 Created`**

```json
{
  "success": true,
  "message": "Vendor created successfully",
  "data": {
    "_id": "665f1a2b3c4d5e6f7a8b9c1d",
    "name": "Vendor D",
    "priority": 4,
    "weight": 20,
    "cost": 4,
    "avgLatencyMs": 900,
    "rateLimitPerMin": 60,
    "capabilities": ["OCR", "SMS"],
    "healthStatus": "HEALTHY",
    "enabled": true,
    "failureRate": 0.1,
    "createdAt": "2026-07-04T10:12:00.000Z",
    "updatedAt": "2026-07-04T10:12:00.000Z"
  }
}
```

**Response `400 Bad Request`** — missing required field / duplicate name

```json
{ "success": false, "error": "Vendor validation failed: name: Path `name` is required." }
```

---

### GET /vendors

List all vendors, sorted by priority ascending (best-ranked first).

```
GET http://localhost:3000/api/v1/vendors
GET https://intelligent-vendor-routing-platform.onrender.com/api/v1/vendors
```

**cURL**

```bash
curl http://localhost:3000/api/v1/vendors
```

**Response `200 OK`**

```json
{
  "success": true,
  "message": "Vendors fetched successfully",
  "data": [
    {
      "_id": "665f1a2b3c4d5e6f7a8b9c1a",
      "name": "Vendor A",
      "priority": 1,
      "weight": 70,
      "cost": 10,
      "avgLatencyMs": 300,
      "rateLimitPerMin": 100,
      "capabilities": ["PAN_VERIFICATION", "OCR", "KYC"],
      "healthStatus": "HEALTHY",
      "enabled": true,
      "failureRate": 0.02
    },
    {
      "_id": "665f1a2b3c4d5e6f7a8b9c1b",
      "name": "Vendor B",
      "priority": 2,
      "weight": 20,
      "cost": 5,
      "avgLatencyMs": 700,
      "rateLimitPerMin": 60,
      "capabilities": ["PAN_VERIFICATION", "OCR"],
      "healthStatus": "HEALTHY",
      "enabled": true,
      "failureRate": 0.1
    }
  ]
}
```

An empty database returns `"data": []` with `200 OK`.

---

### PUT /vendors/:id

Partial update — send only the fields you want to change; everything else is
preserved. Updates run schema validation.

```
PUT http://localhost:3000/api/v1/vendors/665f1a2b3c4d5e6f7a8b9c1a
PUT https://intelligent-vendor-routing-platform.onrender.com/api/v1/vendors/665f1a2b3c4d5e6f7a8b9c1a
```

**Path parameters**

| Param | Description |
|---|---|
| `id` | MongoDB ObjectId of the vendor |

**Request body** (examples)

```json
{ "enabled": false }
```

```json
{ "weight": 40, "cost": 3.5, "priority": 2 }
```

**cURL**

```bash
curl -X PUT http://localhost:3000/api/v1/vendors/665f1a2b3c4d5e6f7a8b9c1a \
  -H "Content-Type: application/json" \
  -d '{"enabled": false}'
```

**Response `200 OK`** — returns the full updated document

```json
{
  "success": true,
  "message": "Vendor updated successfully",
  "data": {
    "_id": "665f1a2b3c4d5e6f7a8b9c1a",
    "name": "Vendor A",
    "priority": 1,
    "weight": 70,
    "cost": 10,
    "avgLatencyMs": 300,
    "capabilities": ["PAN_VERIFICATION", "OCR", "KYC"],
    "healthStatus": "HEALTHY",
    "enabled": false,
    "failureRate": 0.02,
    "updatedAt": "2026-07-04T11:02:31.552Z"
  }
}
```

**Response `404 Not Found`**

```json
{ "success": false, "error": "Vendor not found" }
```

---

### DELETE /vendors/:id

Permanently deletes a vendor. Its historical routing logs and metrics are kept.

```
DELETE http://localhost:3000/api/v1/vendors/665f1a2b3c4d5e6f7a8b9c1a
DELETE https://intelligent-vendor-routing-platform.onrender.com/api/v1/vendors/665f1a2b3c4d5e6f7a8b9c1a
```

**cURL**

```bash
curl -X DELETE http://localhost:3000/api/v1/vendors/665f1a2b3c4d5e6f7a8b9c1a
```

**Response `200 OK`** — returns the deleted document

```json
{
  "success": true,
  "message": "Vendor deleted successfully",
  "data": { "_id": "665f1a2b3c4d5e6f7a8b9c1a", "name": "Vendor A", "...": "..." }
}
```

**Response `404 Not Found`**

```json
{ "success": false, "error": "Vendor not found" }
```

---

## Routing

### POST /route

**The core endpoint.** Clients call this instead of any vendor directly. The
platform filters eligible vendors (supports the capability, `enabled`, not
`OFFLINE`), applies a routing strategy, calls the (mock) vendor, and
automatically fails over to the next-best vendor if the call fails.

```
POST http://localhost:3000/api/v1/route
POST https://intelligent-vendor-routing-platform.onrender.com/api/v1/route
```

**Request body**

| Field | Type | Required | Description |
|---|---|---|---|
| `capability` | string | Yes | Capability needed, e.g. `PAN_VERIFICATION`; must match at least one eligible vendor |
| `payload` | object | Yes | Arbitrary request data forwarded to the vendor and echoed back |
| `requirements` | object | No | Routing preferences (all sub-fields optional) |
| `requirements.strategy` | string | No | Force one of `PRIORITY`, `WEIGHTED`, `LOWEST_COST`, `LOWEST_LATENCY` |
| `requirements.preferLowCost` | boolean | No | Auto-selects Lowest Cost when no explicit strategy is given |
| `requirements.preferLowLatency` | boolean | No | Auto-selects Lowest Latency when no explicit strategy is given |
| `requirements.maxLatency` | number (ms) | No | Soft latency ceiling; alone, it also triggers Lowest Latency routing |

**Strategy resolution order:** explicit `strategy` → `preferLowCost` →
`preferLowLatency` / `maxLatency` → default `PRIORITY`. Failover is not a
selectable strategy — it activates automatically on any vendor failure,
retrying remaining vendors in priority order until one succeeds or all are
exhausted.

**Example requests**

```json
// 1. Default (priority routing)
{ "capability": "PAN_VERIFICATION", "payload": { "pan": "ABCDE1234F", "name": "Rahul Sharma" } }

// 2. Explicit strategy
{ "capability": "PAN_VERIFICATION", "payload": { "pan": "ABCDE1234F" },
  "requirements": { "strategy": "WEIGHTED" } }

// 3. Flag-driven
{ "capability": "OCR", "payload": { "documentUrl": "https://example.com/doc.jpg" },
  "requirements": { "preferLowCost": true } }

// 4. Latency ceiling
{ "capability": "KYC", "payload": { "customerId": "CUST-1001" },
  "requirements": { "maxLatency": 2000 } }
```

**cURL**

```bash
curl -X POST http://localhost:3000/api/v1/route \
  -H "Content-Type: application/json" \
  -d '{"capability":"PAN_VERIFICATION","payload":{"pan":"ABCDE1234F","name":"Rahul Sharma"},"requirements":{"preferLowCost":true}}'
```

**Response fields** (`data` object)

| Field | Type | Description |
|---|---|---|
| `strategyUsed` | string | Strategy that made the final selection (`FAILOVER` if a retry rescued the request) |
| `vendorSelected` | string | Name of the vendor that ultimately handled (or last attempted) the request |
| `vendorId` | string | ObjectId of that vendor |
| `attemptedVendors` | string[] | Every vendor tried, in order |
| `reason` | string | Human-readable explanation of the selection |
| `latencyMs` | number | Simulated latency of the final vendor call |
| `status` | string | `SUCCESS` or `FAILED` |
| `errorMessage` | string \| null | Populated when `status` is `FAILED` |
| `responsePayload` | object \| null | The (mock) vendor's response, echoing your payload |

**Response `200 OK`** — success on first attempt

```json
{
  "success": true,
  "message": "Request routed successfully",
  "data": {
    "strategyUsed": "LOWEST_COST",
    "vendorSelected": "Vendor C",
    "vendorId": "665f1a2b3c4d5e6f7a8b9c1c",
    "attemptedVendors": ["Vendor C"],
    "reason": "Selected Vendor C because it has the lowest cost (cost=2) among eligible vendors.",
    "latencyMs": 1423,
    "status": "SUCCESS",
    "errorMessage": null,
    "responsePayload": {
      "vendor": "Vendor C",
      "capability": "PAN_VERIFICATION",
      "verified": true,
      "echo": { "pan": "ABCDE1234F", "name": "Rahul Sharma" },
      "processedAt": "2026-07-04T10:15:03.201Z"
    }
  }
}
```

**Response `200 OK`** — success after automatic failover

```json
{
  "success": true,
  "message": "Request routed successfully",
  "data": {
    "strategyUsed": "FAILOVER",
    "vendorSelected": "Vendor B",
    "vendorId": "665f1a2b3c4d5e6f7a8b9c1b",
    "attemptedVendors": ["Vendor A", "Vendor B"],
    "reason": "Failover triggered. Selected next available vendor Vendor B (priority=2).",
    "latencyMs": 612,
    "status": "SUCCESS",
    "errorMessage": null,
    "responsePayload": {
      "vendor": "Vendor B",
      "capability": "PAN_VERIFICATION",
      "verified": true,
      "echo": { "pan": "ABCDE1234F", "name": "Rahul Sharma" },
      "processedAt": "2026-07-04T10:16:44.812Z"
    }
  }
}
```

**Response `502 Bad Gateway`** — every eligible vendor was attempted and failed

```json
{ "success": false, "error": "Vendor C failed to process PAN_VERIFICATION request (simulated failure)" }
```

**Response `404 Not Found`** — no eligible vendor for the capability
(unsupported capability, or all supporting vendors are disabled/OFFLINE)

```json
{ "success": false, "error": "No eligible vendors found for capability: FACE_MATCH" }
```

Every call to this endpoint — success or failure — creates a routing log entry
and updates the attempted vendors' metrics and health status.

---

## Observability

### GET /vendor-metrics

Aggregated platform-wide stats plus a per-vendor breakdown, maintained as a
running total updated after every routed request.

```
GET http://localhost:3000/api/v1/vendor-metrics
GET https://intelligent-vendor-routing-platform.onrender.com/api/v1/vendor-metrics
```

**cURL**

```bash
curl http://localhost:3000/api/v1/vendor-metrics
```

**Response fields**

| Field | Description |
|---|---|
| `totalRequests` / `successfulRequests` / `failedRequests` | Platform-wide counters |
| `avgLatencyMs` | Mean of the per-vendor average latencies |
| `errorRate` | `failedRequests / totalRequests`, 0–1 |
| `vendors[]` | Per-vendor metrics, incl. `availability` (percentage, `100 − errorRate × 100`) |

**Response `200 OK`**

```json
{
  "success": true,
  "message": "Vendor metrics fetched successfully",
  "data": {
    "totalRequests": 142,
    "successfulRequests": 129,
    "failedRequests": 13,
    "avgLatencyMs": 611,
    "errorRate": 0.0915,
    "vendors": [
      {
        "vendorId": "665f1a2b3c4d5e6f7a8b9c1a",
        "vendorName": "Vendor A",
        "totalRequests": 80,
        "successfulRequests": 78,
        "failedRequests": 2,
        "avgLatencyMs": 305,
        "errorRate": 0.025,
        "availability": 97.5
      },
      {
        "vendorId": "665f1a2b3c4d5e6f7a8b9c1c",
        "vendorName": "Vendor C",
        "totalRequests": 22,
        "successfulRequests": 14,
        "failedRequests": 8,
        "avgLatencyMs": 1489,
        "errorRate": 0.3636,
        "availability": 63.64
      }
    ]
  }
}
```

With no traffic yet, all counters are `0` and `vendors` is `[]`.

---

### GET /routing-logs

The most recent routing decisions, newest first. Backs the dashboard's log
view and feeds `POST /ai/explain-route`.

```
GET http://localhost:3000/api/v1/routing-logs
GET http://localhost:3000/api/v1/routing-logs?limit=20
GET https://intelligent-vendor-routing-platform.onrender.com/api/v1/routing-logs?limit=20
```

**Query parameters**

| Param | Type | Default | Description |
|---|---|---|---|
| `limit` | number | `100` | Maximum number of logs returned |

**cURL**

```bash
curl "http://localhost:3000/api/v1/routing-logs?limit=20"
```

**Response `200 OK`**

```json
{
  "success": true,
  "message": "Routing logs fetched successfully",
  "data": [
    {
      "_id": "665f2b3c4d5e6f7a8b9c1d01",
      "capability": "PAN_VERIFICATION",
      "strategyUsed": "WEIGHTED",
      "vendorSelected": "Vendor A",
      "vendorId": "665f1a2b3c4d5e6f7a8b9c1a",
      "attemptedVendors": ["Vendor A"],
      "reason": "Selected Vendor A via weighted random distribution (weight=70/100).",
      "latencyMs": 288,
      "status": "SUCCESS",
      "errorMessage": null,
      "requestPayload": { "pan": "ABCDE1234F", "name": "Rahul Sharma" },
      "responsePayload": { "vendor": "Vendor A", "verified": true },
      "createdAt": "2026-07-04T09:58:12.004Z"
    }
  ]
}
```

---

### GET /health

Current health classification of every vendor, sorted by name.

```
GET http://localhost:3000/api/v1/health
GET https://intelligent-vendor-routing-platform.onrender.com/api/v1/health
```

**cURL**

```bash
curl http://localhost:3000/api/v1/health
```

**Response `200 OK`**

```json
{
  "success": true,
  "message": "Vendor health fetched successfully",
  "data": [
    { "_id": "665f1a2b3c4d5e6f7a8b9c1a", "name": "Vendor A", "healthStatus": "HEALTHY", "enabled": true, "priority": 1 },
    { "_id": "665f1a2b3c4d5e6f7a8b9c1b", "name": "Vendor B", "healthStatus": "WARNING", "enabled": true, "priority": 2 },
    { "_id": "665f1a2b3c4d5e6f7a8b9c1c", "name": "Vendor C", "healthStatus": "OFFLINE", "enabled": true, "priority": 3 }
  ]
}
```

**Health classification rules** (re-evaluated after every routed request,
based on rolling error rate; a vendor needs ≥ 5 recorded requests before it's
judged):

| Status | Error rate | Routable? |
|---|---|---|
| `HEALTHY` | < 20% | Yes |
| `WARNING` | 20% – 50% | Yes (still eligible) |
| `OFFLINE` | ≥ 50% | No (excluded from routing) |

---

## AI Module

Both endpoints call Gemini 2.5 Flash server-side and require `GEMINI_API_KEY`
to be configured in the backend environment. Response time depends on the
Gemini API (typically 1–4 seconds).

### POST /ai/generate-config

Converts a plain-English routing policy into a structured JSON configuration.

```
POST http://localhost:3000/api/v1/ai/generate-config
POST https://intelligent-vendor-routing-platform.onrender.com/api/v1/ai/generate-config
```

**Request body**

| Field | Type | Required | Description |
|---|---|---|---|
| `instruction` | string | Yes | The routing policy in plain English |

```json
{
  "instruction": "Use Vendor A for 70% traffic. Vendor B for 30%. If latency exceeds 2 seconds use Vendor C."
}
```

**cURL**

```bash
curl -X POST http://localhost:3000/api/v1/ai/generate-config \
  -H "Content-Type: application/json" \
  -d '{"instruction":"Use Vendor A for 70% traffic. Vendor B for 30%. If latency exceeds 2 seconds use Vendor C."}'
```

**Response `200 OK`**

```json
{
  "success": true,
  "message": "Routing configuration generated successfully",
  "data": {
    "strategy": "WEIGHTED",
    "vendorWeights": { "Vendor A": 70, "Vendor B": 30 },
    "maxLatencyMs": 2000,
    "notes": "Traffic is split 70/30 between Vendor A and Vendor B under normal conditions. If latency exceeds 2000ms, requests should fall back to Vendor C."
  }
}
```

**Response `502 Bad Gateway`** — key missing, Gemini unreachable, or the model
returned unparseable output

```json
{ "success": false, "error": "GEMINI_API_KEY is not configured on the server." }
```

```json
{ "success": false, "error": "Gemini returned a response that could not be parsed as JSON." }
```

---

### POST /ai/explain-route

Generates a plain-English, non-technical explanation of why a vendor was
selected for a specific routing decision. Accepts **either** a `logId`
(the log is fetched from the database) **or** a raw `log` object.

```
POST http://localhost:3000/api/v1/ai/explain-route
POST https://intelligent-vendor-routing-platform.onrender.com/api/v1/ai/explain-route
```

**Request body — option 1 (by ID)**

```json
{ "logId": "665f2b3c4d5e6f7a8b9c1d01" }
```

**Request body — option 2 (raw log object)**

```json
{
  "log": {
    "capability": "PAN_VERIFICATION",
    "strategyUsed": "FAILOVER",
    "vendorSelected": "Vendor B",
    "attemptedVendors": ["Vendor A", "Vendor B"],
    "reason": "Failover triggered. Selected next available vendor Vendor B (priority=2).",
    "latencyMs": 612,
    "status": "SUCCESS"
  }
}
```

**cURL**

```bash
curl -X POST http://localhost:3000/api/v1/ai/explain-route \
  -H "Content-Type: application/json" \
  -d '{"logId":"665f2b3c4d5e6f7a8b9c1d01"}'
```

**Response `200 OK`**

```json
{
  "success": true,
  "message": "Routing decision explained successfully",
  "data": {
    "explanation": "Vendor A was tried first but failed to process the request, so the platform automatically moved to the next available vendor, Vendor B, which handled it successfully in 612ms. This failover behavior ensures the client still gets a response even when the top-priority vendor has an outage."
  }
}
```

**Response `404 Not Found`** — `logId` doesn't match any log

```json
{ "success": false, "error": "Routing log not found" }
```

**Response `400 Bad Request`** — neither `log` nor `logId` provided

```json
{ "success": false, "error": "Provide either 'log' object or 'logId' in the request body" }
```

---

## Error Reference

| Status | Meaning | Typical triggers |
|---|---|---|
| `400 Bad Request` | Invalid input | Missing required fields, schema validation failure, neither `log` nor `logId` given |
| `404 Not Found` | Resource missing | Unknown vendor/log ID, no eligible vendor for a capability, unknown route path |
| `500 Internal Server Error` | Unexpected server error | Unhandled exception, database connectivity issue |
| `502 Bad Gateway` | Upstream failure | All eligible vendors failed for `/route`; Gemini API failed or key not configured |

All errors share the same shape:

```json
{ "success": false, "error": "Human-readable message" }
```

Unknown routes (e.g. `GET /api/v1/nope`) return a `404` in this same envelope
via the global not-found handler.