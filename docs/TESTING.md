# Testing Guide — Backend

The backend is tested at two levels — **unit tests** and **integration
tests** — with a **coverage report** measuring how much of the source both
levels exercise together. The stack is **Jest** (test runner) + **ts-jest**
(TypeScript support) + **Supertest** (HTTP assertions) +
**mongodb-memory-server** (throwaway in-memory MongoDB).

No real MongoDB instance, no Gemini API key, and no network access are needed
to run any test — everything external is either mocked or run in memory.

---

## Requirements

| Requirement | Why it's needed |
|---|---|
| Node.js ≥ 18 | runtime for Jest and ts-node |
| Dev dependencies installed (`npm install`) | jest, ts-jest, @types/jest, supertest, @types/supertest, mongodb-memory-server |
| `src/app.ts` | exports the Express app without `listen()` or a DB connection, so Supertest can drive it in-process |
| `jest.config.js` | ts-jest preset, 30s timeout, loads `src/config/env.ts` before anything else |
| `tests/setup.db.ts` | helpers to start/clear/stop the in-memory MongoDB |
| `tests/fixtures/mock-data.ts` | single source of truth for all mock data |
| Internet on the very first run only | `mongodb-memory-server` downloads a MongoDB binary (~70 MB) once, then caches it |

---

## Test Structure

```
tests/
├── fixtures/mock-data.ts      # shared mock data
├── setup.db.ts                # in-memory MongoDB lifecycle helpers
├── unit/                      # service-level tests, fully isolated
│   ├── routing-engine.service.test.ts
│   ├── mock-vendor.service.test.ts
│   ├── metrics.service.test.ts
│   ├── health.service.test.ts
│   └── gemini.service.test.ts
└── integration/               # real HTTP tests against the API
    ├── vendor.routes.test.ts
    ├── route.routes.test.ts
    └── misc.routes.test.ts
```

---

## Commands

| Command | What it runs | Speed | Needs DB? |
|---|---|---|---|
| `npm test` | every test file (unit + integration) | moderate | in-memory |
| `npm run test:unit` | only `tests/unit/` | very fast (seconds) | no |
| `npm run test:integration` | only `tests/integration/`, serially (`--runInBand`) | slower | in-memory |
| `npm run test:coverage` | full suite + coverage report in `coverage/` | slowest | in-memory |

Useful extras during development:

```bash
npx jest --watch                          # re-run affected tests on file save
npx jest tests/unit/metrics.service.test.ts   # run a single file
npx jest -t "fails over"                  # run tests whose name matches a pattern
```

---

## 1. Unit Testing

**What it is:** each service is tested in complete isolation. Every external
dependency — Mongoose models, the Gemini SDK, even `Math.random` — is replaced
with a Jest mock, so the tests verify pure business logic and nothing else.
Because there is no I/O at all, the whole unit suite finishes in seconds and
is deterministic: the same code always produces the same result.

**How to run:**

```bash
npm run test:unit
```

**What each suite verifies:**

| Suite | Coverage |
|---|---|
| `routing-engine.service` | all 5 strategies, strategy auto-selection from requirement flags, `maxLatency` filtering and its empty-pool fallback, weighted distribution (deterministic via mocked `Math.random` plus a 5,000-roll statistical check), failover selection and exhaustion (`null`), empty-pool error, input array immutability |
| `mock-vendor.service` | success vs failure paths (controlled `Math.random`), latency stays within the ±40% jitter bounds, `failureRate` 0 and 1 edge cases |
| `metrics.service` | first-request upsert, counter increments, avg latency / error rate / availability math, empty summary returns zeros |
| `health.service` | HEALTHY → WARNING → OFFLINE transitions at the exact 0.2 and 0.5 boundaries, the "<5 requests = not enough data" guard |
| `gemini.service` | SDK fully mocked: JSON parsing, markdown code-fence stripping, the instruction/log actually appearing in the prompt, friendly error on non-JSON output, explanation trimming |

**Mocking techniques used:** `jest.mock()` on module boundaries (Mongoose
models, `@google/generative-ai`, `config/env`), `jest.spyOn(Math, "random")`
for controlled randomness, and plain fixture objects cast to
`VendorDocument` — the routing engine only reads fields, so no real documents
are needed.

---

## 2. Integration Testing

**What it is:** the full HTTP stack is tested end-to-end — real Express
routing, middlewares, controllers, services, and Mongoose queries against a
real (but in-memory, disposable) MongoDB. Supertest sends actual HTTP requests
to the app in-process; no port is opened and no server is started.

**Lifecycle per suite:** `beforeAll` boots a fresh in-memory MongoDB and
connects mongoose → each test seeds exactly the data it needs from the
fixtures → `afterEach` wipes every collection so tests never leak state into
each other → `afterAll` drops the database and stops the server.

**How to run:**

```bash
npm run test:integration
```

The script passes `--runInBand` so files execute one at a time — integration
suites share the mongoose connection and would race each other in parallel.

**What each suite verifies:**

| Suite | Coverage |
|---|---|
| `vendor.routes` | POST creates and persists (201), GET lists sorted by priority, PUT updates and preserves untouched fields, DELETE removes, 404 for unknown ids |
| `route.routes` | default PRIORITY routing, explicit `LOWEST_COST`, `preferLowLatency` flag, automatic failover (A fails → B succeeds) with metrics recorded for **both** vendors, all-vendors-fail → 502 + a `FAILED` log listing every attempt, disabled/OFFLINE vendors never selected, unknown capability → 404, and that routing logs + metrics are genuinely persisted to the DB |
| `misc.routes` | `/health` (sorted, field-selected), `/vendor-metrics` (aggregation math, empty state), `/routing-logs` (newest-first ordering, `?limit=`), `/ai/generate-config` and `/ai/explain-route` with the Gemini service spied (200 / 400 / 404 / 502 paths), root health check, global 404 handler |

**Determinism:** the `/route` endpoint normally calls the mock vendor
simulator, which fails *randomly*. Tests spy on
`mockVendorService.simulateCall` and script each call's outcome
(success/failure per attempt), so failover scenarios are exact and the suite
never flakes.

---

## 3. Coverage Testing

**What it is:** the entire suite runs with instrumentation that records which
statements, branches, functions, and lines of `src/` were executed. The result
shows exactly which code paths no test touches.

**How to run:**

```bash
npm run test:coverage
```

**Reading the output:** a summary table prints in the terminal with four
metrics per file — **% Stmts** (statements executed), **% Branch** (both sides
of each if/else taken), **% Funcs** (functions called), **% Lines** — plus an
`Uncovered Line #s` column pointing at exactly what's untested. A detailed
HTML report is written to `coverage/`:

```bash
open coverage/lcov-report/index.html    # macOS
```

The HTML view highlights covered lines green and uncovered lines red,
file by file — the fastest way to find gaps.

**What's measured:** everything under `src/**/*.ts` *except* `server.ts` (the
process entry point — starting a real server isn't meaningfully unit-testable)
and the seed script, both excluded in `jest.config.js` via
`collectCoverageFrom`.

**In CI:** the coverage job uploads the whole `coverage/` folder as a GitHub
Actions artifact (kept 14 days), downloadable from the workflow run page.

---

## Adding New Tests

Name the file `<thing>.test.ts` and place it in `tests/unit/` if it tests a
service in isolation (mock every dependency) or `tests/integration/` if it
sends HTTP requests (import the DB helpers and follow the
`beforeAll`/`afterEach`/`afterAll` lifecycle above). Add any new mock objects
to `tests/fixtures/mock-data.ts` rather than inlining them — fixtures are the
single source of truth, so a schema change means editing one file, not eight.
Jest picks up new files automatically; no config changes needed.

## Troubleshooting

If the first-ever run seems stuck, it's downloading the MongoDB binary — give
it a minute; later runs are fast. If a test fails with a Mongoose validation
error, the fixture in `tests/fixtures/mock-data.ts` has drifted from the
schema — fix the fixture. If integration tests fail with connection errors
when run through plain `npx jest`, make sure you're using the npm script:
parallel execution without `--runInBand` causes the suites to fight over the
connection.