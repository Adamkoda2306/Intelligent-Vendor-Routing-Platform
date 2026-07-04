# Intelligent Vendor Routing Platform

A middleware platform that sits between your application and multiple third-party
vendors (PAN verification, OCR, SMS, KYC, document verification, etc.) and
automatically decides which vendor should handle each request — based on cost,
latency, priority, health, and configurable routing strategies.

Instead of your application juggling multiple vendor SDKs, retry logic, and
failover rules, it calls **one API** — `POST /route` — and the platform handles
the rest.

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Features](#features)
3. [Tech Stack](#tech-stack)
4. [Folder Structure](#folder-structure)
5. [Installation](#installation)
6. [Environment Variables](#environment-variables)
7. [MongoDB Setup](#mongodb-setup)
8. [Running the Backend](#running-the-backend)
9. [Running the Frontend](#running-the-frontend)
10. [API Documentation](#api-documentation)
11. [Sample Data](#sample-data)
12. [Future Improvements](#future-improvements)

---

## Project Overview

Modern applications often rely on more than one vendor for the same capability.
Each vendor differs in cost, latency, reliability, and rate limits. This project
implements a **routing engine** that:

- Accepts a single incoming request describing the capability needed (e.g.
  `PAN_VERIFICATION`) and an optional set of requirements (e.g. "prefer low cost").
- Filters vendors that support that capability and are currently healthy.
- Applies one of five routing strategies to pick the best vendor.
- Calls a **simulated** vendor (mock vendor service) with randomized latency and
  randomized failure to mimic real-world third-party behavior.
- Automatically **fails over** to the next-best vendor if the chosen one fails.
- Logs every decision and updates rolling metrics and health status per vendor.
- Uses **Gemini 2.5 Flash** to (a) turn a plain-English routing policy into a
  structured JSON config, and (b) explain, in plain English, why a given vendor
  was selected for a specific request.

This is a university final-year project: intentionally scoped to be
**basic-to-intermediate**, readable, and demonstrable — not an enterprise system.

---

## Features

| # | Feature | Description |
|---|---|---|
| 1 | Vendor Management | Full CRUD for vendors (`name`, `priority`, `weight`, `cost`, `avgLatencyMs`, `rateLimitPerMin`, `capabilities`, `healthStatus`, `enabled`) |
| 2 | Mock Vendors | Three seeded vendors (A: fast/expensive/reliable, B: medium, C: cheap/slow/unreliable) with randomized latency and failure simulation |
| 3 | Routing Engine | Five strategies: Priority, Weighted, Lowest Cost, Lowest Latency, Failover |
| 4 | Route API | `POST /route` — single entry point for all vendor calls |
| 5 | Metrics | Total/successful/failed requests, average latency, error rate, availability — tracked per vendor |
| 6 | Health Monitoring | Vendors automatically move between `HEALTHY` → `WARNING` → `OFFLINE` based on live error rate |
| 7 | Logs | Every routing decision is persisted with timestamp, vendor, reason, latency, and status |
| 8 | Vendor Metrics API | `GET /vendor-metrics` — aggregated and per-vendor stats |
| 9 | Health API | `GET /health` — current health status of all vendors |
| 10 | AI Module | Gemini-powered `POST /ai/generate-config` and `POST /ai/explain-route` |

---

## Tech Stack

**Frontend:** HTML, CSS, Vanilla JavaScript, Chart.js
**Backend:** Node.js, TypeScript, Express.js
**Database:** MongoDB, Mongoose
**AI:** Gemini 2.5 Flash (`@google/generative-ai`)

No authentication, no microservices, no Docker, no Redis/Kafka — kept
intentionally simple per project scope.

---

## Folder Structure

```
project-root/
├── backend/
│   ├── src/
│   │   ├── config/          # env + MongoDB connection
│   │   ├── types/           # shared TypeScript types
│   │   ├── models/          # Mongoose schemas (Vendor, RoutingLog, Metrics)
│   │   ├── services/        # business logic (routing engine, mock vendor, gemini, etc.)
│   │   ├── controllers/     # request handlers
│   │   ├── routes/          # Express route definitions
│   │   ├── middlewares/     # error handling, validation, logging
│   │   ├── utils/           # response helpers, async wrapper, seed script
│   │   └── server.ts        # app entry point
│   ├── .env.example
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── index.html            # Dashboard
│   ├── vendors.html          # Vendor management + route tester
│   ├── metrics.html          # Charts + metrics table
│   ├── logs.html             # Routing logs + AI explain
│   ├── ai-config.html        # AI config generator
│   ├── css/styles.css
│   └── js/                   # api.js + one file per page
├── docs/
│   └── API.md                 # full API reference with examples
├── sample-data/
│   ├── vendors.json           # sample vendors collection
│   ├── routinglogs.json       # sample routing logs collection
│   └── metrics.json           # sample metrics collection
├── .env.example
└── README.md
```

---

## Installation

**Prerequisites:** Node.js ≥ 18, MongoDB running locally or a MongoDB Atlas URI, a Gemini API key.

```bash
# 1. Clone / unzip the project
cd project-root/backend

# 2. Install backend dependencies
npm install

# 3. Copy environment variables
cp .env.example .env
# then edit .env with your MongoDB URI and Gemini API key
```

The frontend has no build step or dependencies — it's static HTML/CSS/JS.

---

## Environment Variables

Defined in `backend/.env.example`:

```env
# Server
PORT=5000
NODE_ENV=development

# MongoDB
MONGO_URI=mongodb://127.0.0.1:27017/vendor-routing-platform

# Gemini AI
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash

# CORS
CLIENT_ORIGIN=http://127.0.0.1:5500
```

| Variable | Description |
|---|---|
| `PORT` | Port the Express server listens on |
| `NODE_ENV` | `development` or `production` |
| `MONGO_URI` | MongoDB connection string |
| `GEMINI_API_KEY` | API key for Gemini 2.5 Flash (required for `/ai/*` routes) |
| `GEMINI_MODEL` | Gemini model name, defaults to `gemini-2.5-flash` |
| `CLIENT_ORIGIN` | Allowed CORS origin for the frontend (e.g. Live Server URL) |

---

## MongoDB Setup

**Option A — Local MongoDB**

```bash
# macOS (Homebrew)
brew services start mongodb-community

# Ubuntu/Debian
sudo systemctl start mongod
```

Then use `MONGO_URI=mongodb://127.0.0.1:27017/vendor-routing-platform`.

**Option B — MongoDB Atlas**

Create a free cluster at [mongodb.com/atlas](https://www.mongodb.com/atlas), whitelist
your IP, and use the provided connection string as `MONGO_URI`.

**Seeding mock vendors**

The project ships with a seed script that inserts Vendor A, B, and C exactly as
described in the spec:

```bash
cd backend
npm run seed
```

**Importing sample data (optional)**

To load the sample logs and metrics provided in `sample-data/` for demo purposes:

```bash
mongoimport --uri="mongodb://127.0.0.1:27017/vendor-routing-platform" \
  --collection=vendors --file=sample-data/vendors.json --jsonArray

mongoimport --uri="mongodb://127.0.0.1:27017/vendor-routing-platform" \
  --collection=routinglogs --file=sample-data/routinglogs.json --jsonArray

mongoimport --uri="mongodb://127.0.0.1:27017/vendor-routing-platform" \
  --collection=metrics --file=sample-data/metrics.json --jsonArray
```

---

## Running the Backend

```bash
cd backend
npm run dev      # development mode with auto-reload (nodemon + ts-node)
```

Or for a production-style run:

```bash
npm run build     # compiles TypeScript to dist/
npm start          # runs the compiled JS
```

The API will be available at `http://localhost:5000` (or whatever `PORT` you set).
Visiting `http://localhost:5000/` returns a simple JSON health check confirming
the server is running.

---

## Running the Frontend

The frontend is fully static. Two easy options:

**Option A — VS Code Live Server**
Right-click `frontend/index.html` → "Open with Live Server".

**Option B — Any static file server**
```bash
cd frontend
npx serve .
```

Then make sure `CLIENT_ORIGIN` in the backend `.env` matches the URL the frontend
is served from (e.g. `http://127.0.0.1:5500`), and that `API_BASE_URL` in
`frontend/js/api.js` points at your backend (defaults to `http://localhost:5000`).

---

## API Documentation

Full endpoint reference, request/response examples, and error formats live in
[`docs/API.md`](./docs/API.md).

Quick reference:

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/vendors` | Create a vendor |
| GET | `/vendors` | List all vendors |
| PUT | `/vendors/:id` | Update a vendor |
| DELETE | `/vendors/:id` | Delete a vendor |
| POST | `/route` | Route a request to the best available vendor |
| GET | `/vendor-metrics` | Get aggregated + per-vendor metrics |
| GET | `/routing-logs` | Get recent routing logs |
| GET | `/health` | Get health status of all vendors |
| POST | `/ai/generate-config` | Generate routing config JSON from plain English |
| POST | `/ai/explain-route` | Get a plain-English explanation of a routing decision |

---

## Sample Data

The `sample-data/` folder contains ready-to-import JSON fixtures matching the
Mongoose schemas exactly, useful for demoing the dashboard without manually
generating traffic:

- `vendors.json` — the three mock vendors with realistic field values
- `routinglogs.json` — a handful of routing decisions covering all 5 strategies, including one failover case
- `metrics.json` — corresponding aggregated metrics per vendor

See [Importing sample data](#mongodb-setup) above for how to load them.

---

## Future Improvements

- Add authentication and role-based access for the admin dashboard
- Persist routing strategy configuration (from `/ai/generate-config`) directly
  into vendor weights instead of just returning JSON
- Add per-capability rate limiting enforcement using `rateLimitPerMin`
- Add a real-time view (WebSocket/SSE) instead of polling for the dashboard ticker
- Support real vendor integrations behind the same `/route` interface
- Add automated tests (intentionally omitted here to keep scope basic-to-intermediate)