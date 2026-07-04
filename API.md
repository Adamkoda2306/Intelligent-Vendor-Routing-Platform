# API Documentation

Base URL (local development): `http://localhost:5000/api/v1`

All responses follow a consistent envelope:

```json
{ "success": true, "data": {}, "message": "..." }
```

```json
{ "success": false, "error": "..." }
```

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

**Request Body**

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

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | Yes | Must be unique |
| `priority` | number | No | Default `10`. Lower number = higher priority |
| `weight` | number | No | Default `50`. Used by weighted routing (0–100) |
| `cost` | number | Yes | Cost per request |
| `avgLatencyMs` | number | Yes | Baseline latency used by the mock vendor simulator |
| `rateLimitPerMin` | number | No | Default `60` |
| `capabilities` | string[] | Yes | e.g. `["PAN_VERIFICATION", "OCR"]` |
| `enabled` | boolean | No | Default `true` |
| `failureRate` | number | No | Default `0.05`. Probability (0–1) the mock vendor simulates a failure |

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

---

### GET /vendors

List all vendors, sorted by priority ascending.

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
    }
  ]
}
```

---

### PUT /vendors/:id

Update any subset of a vendor's fields (partial update).

**Request Body** (example — disabling a vendor)

```json
{ "enabled": false }
```

**Response `200 OK`**

```json
{
  "success": true,
  "message": "Vendor updated successfully",
  "data": {
    "_id": "665f1a2b3c4d5e6f7a8b9c1a",
    "name": "Vendor A",
    "enabled": false,
    "...": "..."
  }
}
```

**Response `404 Not Found`** — if the vendor ID doesn't exist:

```json
{ "success": false, "error": "Vendor not found" }
```

---

### DELETE /vendors/:id

Deletes a vendor permanently.

**Response `200 OK`**

```json
{
  "success": true,
  "message": "Vendor deleted successfully",
  "data": { "_id": "665f1a2b3c4d5e6f7a8b9c1a", "name": "Vendor A" }
}
```

---

## Routing

### POST /route

The core endpoint. Clients call this instead of any vendor directly.

**Request Body**

```json
{
  "capability": "PAN_VERIFICATION",
  "payload": {
    "pan": "ABCDE1234F",
    "name": "Rahul Sharma"
  },
  "requirements": {
    "preferLowCost": true,
    "maxLatency": 2000
  }
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `capability` | string | Yes | Must match a `capabilities` entry on at least one enabled, healthy vendor |
| `payload` | object | Yes | Arbitrary request data forwarded to the (mock) vendor |
| `requirements.strategy` | string | No | Explicitly force one of: `PRIORITY`, `WEIGHTED`, `LOWEST_COST`, `LOWEST_LATENCY` |
| `requirements.preferLowCost` | boolean | No | If true (and no explicit strategy), uses Lowest Cost routing |
| `requirements.preferLowLatency` | boolean | No | If true (and no explicit strategy), uses Lowest Latency routing |
| `requirements.maxLatency` | number | No | Filters out vendors slower than this threshold before selecting |

If no strategy or requirement flags are given, **Priority routing** is used by default.
**Failover is always active** as a safety net — if the selected vendor's simulated
call fails, the platform automatically retries the next-best remaining vendor.

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

**Response `200 OK`** — success after failover

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

**Response `502 Bad Gateway`** — all eligible vendors failed

```json
{
  "success": false,
  "error": "Vendor C failed to process PAN_VERIFICATION request (simulated failure)"
}
```

**Response `404 Not Found`** — no vendor supports the requested capability

```json
{
  "success": false,
  "error": "No eligible vendors found for capability: FACE_MATCH"
}
```

---

## Observability

### GET /vendor-metrics

Returns aggregated platform-wide stats plus per-vendor breakdown.

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
        "vendorId": "665f1a2b3c4d5e6f7a8b9c1b",
        "vendorName": "Vendor B",
        "totalRequests": 40,
        "successfulRequests": 37,
        "failedRequests": 3,
        "avgLatencyMs": 702,
        "errorRate": 0.075,
        "availability": 92.5
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

---

### GET /routing-logs

Returns the most recent routing decisions, newest first.

**Query Parameters**

| Param | Type | Default | Notes |
|---|---|---|---|
| `limit` | number | 100 | Max number of logs to return |

Example: `GET /routing-logs?limit=20`

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

Returns the current health classification of every vendor.

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

Health is auto-classified using rolling error rate: `HEALTHY` below 20% errors,
`WARNING` between 20–50%, `OFFLINE` above 50% (minimum 5 requests before evaluation).

---

## AI Module

Both endpoints require `GEMINI_API_KEY` to be set in the backend `.env`.

### POST /ai/generate-config

Converts a plain-English routing policy into structured JSON.

**Request Body**

```json
{
  "instruction": "Use Vendor A for 70% traffic. Vendor B for 30%. If latency exceeds 2 seconds use Vendor C."
}
```

**Response `200 OK`**

```json
{
  "success": true,
  "message": "Routing configuration generated successfully",
  "data": {
    "strategy": "WEIGHTED",
    "vendorWeights": {
      "Vendor A": 70,
      "Vendor B": 30
    },
    "maxLatencyMs": 2000,
    "notes": "Traffic is split 70/30 between Vendor A and Vendor B under normal conditions. If latency exceeds 2000ms, requests should fall back to Vendor C."
  }
}
```

**Response `502 Bad Gateway`** — Gemini unavailable or key missing

```json
{ "success": false, "error": "GEMINI_API_KEY is not configured on the server." }
```

---

### POST /ai/explain-route

Explains, in plain English, why a vendor was selected for a specific routing log.
Accepts either a `logId` (fetched from the database) or a raw `log` object.

**Request Body (by ID)**

```json
{ "logId": "665f2b3c4d5e6f7a8b9c1d01" }
```

**Request Body (raw log object)**

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

---

## Error Reference

| Status Code | Meaning |
|---|---|
| `400 Bad Request` | Missing or invalid required field(s) in the request body |
| `404 Not Found` | Resource doesn't exist (vendor ID, capability with no eligible vendor, unknown route) |
| `502 Bad Gateway` | All eligible vendors failed for `/route`, or the Gemini API call failed |
| `500 Internal Server Error` | Unexpected server-side error |

All error responses share the same shape:

```json
{ "success": false, "error": "Human-readable message" }
```