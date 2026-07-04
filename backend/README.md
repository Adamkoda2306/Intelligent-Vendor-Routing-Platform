# Backend — Intelligent Vendor Routing Platform

The backend is a REST API built with **Node.js, Express, and TypeScript** that
sits between a client application and multiple third-party vendors (PAN
verification, OCR, SMS, KYC, etc.). It exposes a single routing endpoint —
`POST /api/v1/route` — and internally decides which vendor should handle each
request based on cost, latency, priority, health, and configurable routing
strategies, with automatic failover when a vendor call fails.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js (≥ 18) |
| Language | TypeScript |
| Framework | Express.js 4 |
| Database | MongoDB with Mongoose |
| AI | Gemini 2.5 Flash (`@google/generative-ai`) |
| Logging | logsave-hub (file logging + Socket.IO log dashboard) |
| Testing | Jest, ts-jest, Supertest, mongodb-memory-server |
| Dev tooling | nodemon, ts-node |

---

## Folder Structure

```
backend/
├── src/
│   ├── app.ts                    # Express app (routes + middlewares), no server start
│   ├── server.ts                 # Entry point: HTTP server, Socket.IO, DB connect
│   ├── config/
│   │   ├── env.ts                # Typed environment variable loader
│   │   └── db.ts                 # MongoDB connection
│   ├── models/                   # Mongoose schemas: Vendor, RoutingLog, Metrics
│   ├── services/                 # Business logic
│   │   ├── routingEngine.service.ts   # 5 routing strategies + failover selection
│   │   ├── mockVendor.service.ts      # Simulated vendor calls (latency + failures)
│   │   ├── vendor.service.ts          # Vendor CRUD + eligibility filtering
│   │   ├── metrics.service.ts         # Rolling per-vendor metrics
│   │   ├── health.service.ts          # HEALTHY / WARNING / OFFLINE evaluation
│   │   ├── log.service.ts             # Routing decision logs
│   │   └── gemini.service.ts          # AI config generation + route explanations
│   ├── controllers/              # Request handlers (one per resource)
│   ├── routes/                   # Express routers, mounted under /api/v1
│   ├── middlewares/              # Error handler, request logger, validation
│   ├── types/                    # Shared TypeScript types
│   └── utils/                    # Response helpers, async wrapper, seed script
├── tests/
│   ├── fixtures/mock-data.ts     # Shared mock vendors, logs, metrics
│   ├── setup.db.ts               # In-memory MongoDB helpers
│   ├── unit/                     # Service-level tests (no DB, mocked deps)
│   └── integration/              # Endpoint tests (Supertest + in-memory Mongo)
├── jest.config.js
├── package.json
└── tsconfig.json
```

### Request Flow

```
Client → routes → controller → services → MongoDB
                      │
                      ├── routingEngine.service  (pick the best vendor)
                      ├── mockVendor.service     (simulate the vendor call)
                      ├── metrics.service        (record result)
                      ├── health.service         (re-evaluate vendor health)
                      └── log.service            (persist the decision)
```

Controllers never touch Mongoose models directly — all database access goes
through the service layer.

---

## Setup

**Prerequisites:** Node.js ≥ 18, MongoDB (local or Atlas), a Gemini API key.

```bash
cd backend

# 1. Install dependencies
npm install

# 3. Seed the three mock vendors (A, B, C)
npm run seed
```

### Environment Variables

| Variable | Description | Example |
|---|---|---|
| `PORT` | Port the server listens on | `3000` |
| `NODE_ENV` | `development` / `production` / `test` | `development` |
| `MONGO_URI` | MongoDB connection string | `mongodb://127.0.0.1:27017/vendor-routing-platform` |
| `GEMINI_API_KEY` | API key for the `/ai/*` endpoints | — |
| `GEMINI_MODEL` | Gemini model name | `gemini-2.5-flash` |
| `CLIENT_ORIGIN` | Allowed CORS origin for the frontend | `http://127.0.0.1:5500` |

---

## Running

```bash
npm run dev       # development with auto-reload (nodemon + ts-node)

npm run build     # compile TypeScript to dist/
npm start         # run the compiled build (production)
```

The API is served at `http://localhost:3000`. A `GET /` returns a JSON health
check confirming the server is up. The logsave-hub log dashboard is available
at `/logsave-hub`.

---

## Testing

Tests are split into fast unit tests (services in isolation, all external
dependencies mocked — no database, no network, no Gemini key required) and
integration tests (real HTTP requests via Supertest against an in-memory
MongoDB spun up by `mongodb-memory-server`).

```bash
npm test                  # run everything
npm run test:unit         # unit tests only
npm run test:integration  # integration tests only (runs serially)
npm run test:coverage     # full run with coverage report in coverage/
```

Vendor calls in integration tests are made deterministic by spying on the
mock vendor service, so the randomized failure simulation never causes flaky
runs. Shared fixtures live in `tests/fixtures/mock-data.ts`.

---

## CI/CD

A GitHub Actions workflow (`.github/workflows/backend-ci-cd.yml` at the repo
root) runs on every push/PR that touches `backend/`. It executes unit tests,
integration tests, and coverage as three parallel jobs; only when all three
pass on a push to `main` does it trigger a deploy to Render via a deploy hook
(`RENDER_DEPLOY_HOOK_URL` repository secret).

---

## Core Concepts

**Routing strategies** — the engine supports five: `PRIORITY` (default),
`WEIGHTED` (probabilistic by vendor weight), `LOWEST_COST`, `LOWEST_LATENCY`
(with optional `maxLatency` filter), and `FAILOVER` (automatic, priority-ordered
retry when a vendor call fails). If no explicit strategy is given, one is
derived from requirement flags like `preferLowCost` or `preferLowLatency`.

**Health monitoring** — after every routed request, the vendor's rolling error
rate is re-evaluated: ≥ 20% moves it to `WARNING`, ≥ 50% to `OFFLINE`. Vendors
need at least 5 recorded requests before health is judged, and `OFFLINE` or
disabled vendors are excluded from routing.

**Mock vendors** — third-party calls are simulated with ±40% latency jitter
around each vendor's average latency and randomized failures based on its
configured failure rate, mimicking real-world vendor behavior.

**AI module** — Gemini converts plain-English routing policies into structured
JSON config, and generates plain-English explanations for any persisted
routing decision.

---

## API Overview

All endpoints are mounted under the `/api/v1` prefix. Full request/response
examples and error formats are documented separately in
[`docs/API.md`](../docs/API.md).

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/v1/vendors` | Create a vendor |
| GET | `/api/v1/vendors` | List all vendors |
| PUT | `/api/v1/vendors/:id` | Update a vendor |
| DELETE | `/api/v1/vendors/:id` | Delete a vendor |
| POST | `/api/v1/route` | Route a request to the best available vendor |
| GET | `/api/v1/vendor-metrics` | Aggregated + per-vendor metrics |
| GET | `/api/v1/routing-logs` | Recent routing decisions (`?limit=` supported) |
| GET | `/api/v1/health` | Health status of all vendors |
| POST | `/api/v1/ai/generate-config` | Plain English → routing config JSON |
| POST | `/api/v1/ai/explain-route` | Plain-English explanation of a routing decision |

All responses follow a consistent envelope:

```json
{ "success": true, "message": "…", "data": { } }
```

Errors return `success: false` with an appropriate HTTP status
(`400`, `404`, `500`, or `502` when a vendor/AI upstream fails).
