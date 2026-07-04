# Testing Guide — Intelligent Vendor Routing Platform

Unit + integration tests using **Jest**, **ts-jest**, **Supertest**, and
**mongodb-memory-server** (no real MongoDB or Gemini API key needed).

## 1. Install dev dependencies

```bash
cd backend
npm install --save-dev jest ts-jest @types/jest supertest @types/supertest mongodb-memory-server
```

## 2. One required refactor: extract `app.ts`

Supertest needs to import the Express app **without** starting the HTTP server
or connecting to the real database. Copy the provided `src/app.ts` into your
project, then slim `server.ts` down to:

```typescript
import http from "http";
import { Server } from "socket.io";
import enableLogging, { attachDashboard, dashboardRouter } from "logsave-hub";
import { app } from "./app";
import { env } from "./config/env";
import { connectDB } from "./config/db";

const server = http.createServer(app);
const io = new Server(server);

attachDashboard(io);
app.use("/logsave-hub", dashboardRouter as any); // see earlier type-mismatch fix

enableLogging({ override: true, outDir: "./logs", retention: false });

async function startServer() {
  await connectDB();
  server.listen(env.PORT, () => {
    console.log(`[SERVER] Running on http://localhost:${env.PORT}`);
    console.log(`[SERVER] Environment: ${env.NODE_ENV}`);
  });
}

startServer();
```

Keeping logsave-hub / socket.io in `server.ts` (not `app.ts`) means the tests
never touch them.

## 3. Copy the test files

```
backend/
├── jest.config.js
├── src/
│   └── app.ts                          ← new
└── tests/
    ├── setupEnv.ts                     ← env vars for tests
    ├── setupTestDb.ts                  ← in-memory MongoDB helpers
    ├── fixtures/
    │   └── mockData.ts                 ← Vendor A/B/C + logs + metrics fixtures
    ├── unit/
    │   ├── routingEngine.service.test.ts
    │   ├── mockVendor.service.test.ts
    │   ├── metrics.service.test.ts
    │   ├── health.service.test.ts
    │   └── gemini.service.test.ts
    └── integration/
        ├── vendor.routes.test.ts
        ├── route.routes.test.ts
        └── misc.routes.test.ts
```

## 4. Add scripts to backend/package.json

```json
"scripts": {
  "test": "jest",
  "test:unit": "jest tests/unit",
  "test:integration": "jest tests/integration --runInBand",
  "test:coverage": "jest --coverage"
}
```

`--runInBand` keeps integration suites from racing each other over the shared
mongoose connection.

## 5. Run
```bash
npm test                # everything
npm run test:unit       # fast, no DB
npm run test:integration
npm run test:coverage
```

## What's covered

**Unit tests (no DB, no network — everything mocked)**
- `routingEngine.service` — all 5 strategies, auto-strategy from requirement
  flags, maxLatency filtering + fallback, weighted distribution (deterministic
  via mocked `Math.random` plus a statistical check), failover selection,
  empty-pool error, input immutability
- `mockVendor.service` — success/failure paths via mocked `Math.random`,
  latency jitter bounds, failureRate 0 and 1 edge cases
- `metrics.service` — first-request upsert, counter math, error rate /
  availability / avg latency calculations, empty summary
- `health.service` — HEALTHY/WARNING/OFFLINE thresholds including exact
  boundary values (0.2 and 0.5), the <5 requests guard
- `gemini.service` — SDK fully mocked: JSON parsing, code-fence stripping,
  prompt contents, non-JSON error handling, explanation trimming

**Integration tests (supertest + in-memory MongoDB)**
- `/vendors` CRUD — create, list (sorted by priority), update, delete, 404s
- `/route` — default PRIORITY routing, explicit LOWEST_COST, preferLowLatency,
  automatic failover (A fails → B succeeds), all-vendors-fail → 502 + FAILED
  log, disabled/OFFLINE vendors excluded, unknown capability → 404, plus
  verification that routing logs and metrics are actually persisted
- `/health`, `/vendor-metrics`, `/routing-logs` (ordering + limit)
- `/ai/generate-config` and `/ai/explain-route` with the Gemini service
  spied/mocked (200, 400, 404, 502 paths)
- Root health check and the global 404 handler

## Notes

- Vendor calls in `/route` integration tests are made deterministic by spying
  on `mockVendorService.simulateCall`, so tests never flake on the randomized
  failure simulation.
- If your Vendor schema field names differ slightly (e.g. no `failureRate`),
  adjust `tests/fixtures/mockData.ts` — it is the single source of truth for
  all fixtures.
- If `sendError` puts the message under a different key than `message`,
  tweak the couple of assertions that read `res.body.message`.
- First run of `mongodb-memory-server` downloads a MongoDB binary (~1 min);
  subsequent runs are fast.