# Routing Engine — Deep Dive

`src/services/routingEngine.service.ts`

The routing engine is the decision-making core of the Intelligent Vendor
Routing Platform. Given a pool of eligible vendors and an optional set of
client requirements, it answers one question: **which vendor should handle
this request, and why?** It is a pure, stateless module — it performs no
database queries, no network calls, and holds no internal state. Everything it
needs arrives as function arguments, and everything it decides is returned as
a plain result object. This purity is deliberate: it makes the engine trivially
unit-testable and keeps strategy logic completely separated from I/O concerns.

---

## Position in the Request Flow

The engine never runs on the full vendor list. Before it is invoked, the
vendor service pre-filters the pool down to *eligible* vendors — those that
support the requested capability, are `enabled`, and are not `OFFLINE`:

```
POST /api/v1/route
      │
      ▼
vendorService.getEligibleVendors(capability)
      │   filters: capabilities includes X, enabled: true, healthStatus ≠ OFFLINE
      ▼
routingEngineService.selectVendor(vendors, requirements)   ← THIS MODULE
      │
      ▼
mockVendorService.simulateCall(...)
      │
      ├── success → record metrics, log decision, respond
      │
      └── failure → routingEngineService.nextFailoverVendor(...)   ← THIS MODULE
                    (repeat until success or pool exhausted)
```

So by the time the engine sees a vendor, that vendor is already known to be
capable, enabled, and at least partially healthy (`HEALTHY` or `WARNING`).
The engine's job is purely *ranking and selection*, not eligibility.

---

## Public API

The engine exposes exactly two functions.

### `selectVendor(vendors, requirements?) → VendorSelectionResult`

The primary entry point. Takes the eligible vendor pool and optional
requirements from the client's request body, decides which strategy applies,
runs it, and returns the selection. Throws an `Error` (`"No eligible vendors
available to route this request."`) if the pool is empty — the controller
catches this upstream by checking pool length first, so in practice the throw
is a defensive guard.

### `nextFailoverVendor(vendors, attemptedVendorIds) → VendorSelectionResult | null`

The failover selector. Given the same pool plus the IDs of vendors already
attempted in this request, it returns the next-best untried vendor, or `null`
when every vendor has been exhausted. The controller loops on this: each time
a vendor call fails, it asks the engine for the next candidate until one
succeeds or `null` signals total failure (which becomes a `502` response).

### The `VendorSelectionResult` shape

Every strategy returns the same structure, which flows all the way into the
routing log and the API response:

```typescript
{
  vendorId: string;        // Mongo ObjectId of the chosen vendor, stringified
  vendorName: string;      // e.g. "Vendor A"
  strategyUsed: string;    // "PRIORITY" | "WEIGHTED" | "LOWEST_COST" | "LOWEST_LATENCY" | "FAILOVER"
  reason: string;          // human-readable explanation of the decision
}
```

The `reason` field is a first-class output, not an afterthought. It is
persisted with every routing log, displayed on the dashboard, and later fed to
Gemini by `POST /ai/explain-route` to produce stakeholder-friendly
explanations. Every strategy is responsible for writing its own reason string
containing the concrete numbers that drove the decision (priority value, cost,
latency, weight ratio).

---

## Strategy Selection: The Decision Cascade

`selectVendor` resolves which strategy to run using a strict precedence order.
An explicit strategy always wins; requirement *flags* are only consulted when
no explicit strategy was named; and `PRIORITY` is the final default.

```
requirements.strategy === "WEIGHTED"        → weightedRouting
requirements.strategy === "LOWEST_COST"     → lowestCostRouting
requirements.strategy === "LOWEST_LATENCY"  → lowestLatencyRouting (with maxLatency)
requirements.strategy === "PRIORITY"        → priorityRouting
        │
        ▼  (no explicit strategy)
requirements.preferLowCost === true         → lowestCostRouting
requirements.preferLowLatency === true      → lowestLatencyRouting
requirements.maxLatency is set              → lowestLatencyRouting (with maxLatency)
        │
        ▼  (nothing specified at all)
DEFAULT                                     → priorityRouting
```

Two consequences of this ordering are worth noting. First, `preferLowCost` is
checked *before* the latency flags, so a request carrying both
`preferLowCost: true` and `preferLowLatency: true` resolves to lowest-cost —
cost preference outranks latency preference in the auto-decide path. Second,
supplying `maxLatency` *alone* (without any strategy or flag) is enough to
trigger latency-based routing, because a latency ceiling only makes sense in
that context.

Note that `"FAILOVER"` is intentionally absent from this cascade. Failover is
not a client-selectable strategy — it is a *behavior* that activates
automatically when a chosen vendor's call fails, regardless of which strategy
made the original selection.

---

## The Five Strategies in Detail

### 1. PRIORITY (default)

**Rule:** pick the vendor with the *lowest* `priority` number. Priority is
rank-style: `priority: 1` beats `priority: 2`.

**Algorithm:** copy the pool (`[...vendors]` — the spread prevents mutating
the caller's array, since `Array.sort` sorts in place), sort ascending by
`priority`, take the first element. Complexity is O(n log n).

**Tie-breaking:** two vendors with equal priority keep their relative order
from the input array (`Array.prototype.sort` is stable in modern JS engines),
so the tie effectively falls to whichever vendor the database returned first.

**When to use:** the sensible default when the operator has hand-ranked
vendors by overall preference — typically reliability-first. In the seeded
data, Vendor A (fast, expensive, reliable) holds priority 1.

**Example reason produced:**
`Selected Vendor A because it has the highest priority (priority=1) among eligible vendors.`

### 2. WEIGHTED

**Rule:** pick a vendor at random, where each vendor's probability of
selection is proportional to its `weight` relative to the pool's total weight.
With weights A=70, B=20, C=10, Vendor A wins roughly 70% of requests.

**Algorithm:** this is the classic *roulette-wheel selection*:

```
totalWeight = Σ weights            (|| 1 guards against a zero total)
roll        = random() × totalWeight
walk the vendors in order, subtracting each weight from roll;
the vendor whose subtraction drives roll ≤ 0 is selected
```

Conceptually, the vendors are laid out on a number line as adjacent segments
sized by weight — A owns [0, 70), B owns [70, 90), C owns [90, 100) — and the
roll is a dart thrown at the line. Complexity is O(n) per selection.

**The floating-point fallback:** in theory the loop always terminates inside
a vendor's segment, but floating-point subtraction can leave a vanishingly
small positive residue after the last vendor. If the loop somehow completes
without selecting, the engine returns the last vendor in the list with a
distinct fallback reason. This branch is effectively unreachable in practice
but guarantees the function is total.

**Edge cases:** a vendor with `weight: 0` occupies a zero-width segment and
is (almost) never selected — useful for keeping a vendor configured but
draining its traffic. If *every* weight is 0, the `|| 1` guard sets
totalWeight to 1; the roll lands in [0, 1), no subtraction can drive it below
zero until... every vendor subtracts 0, so the fallback branch fires and the
last vendor is chosen deterministically.

**When to use:** gradual traffic splitting — canary rollouts of a new vendor,
cost/quality blending, or honoring contractual volume commitments. This is
also the strategy the AI config generator (`/ai/generate-config`) targets when
a policy like "send 70% to A and 30% to B" is expressed in plain English.

**Example reason produced:**
`Selected Vendor B via weighted random distribution (weight=20/100).`

### 3. LOWEST_COST

**Rule:** pick the vendor with the smallest `cost` value (cost per request,
in whatever unit the operator uses — the engine only compares magnitudes).

**Algorithm:** copy, sort ascending by `cost`, take the head. Ties fall to
input order, same as PRIORITY.

**When to use:** high-volume, non-urgent workloads where per-request spend
dominates — bulk verification jobs, batch OCR, and similar. Note the
trade-off baked into the seeded data: Vendor C is the cheapest *and* the
slowest and least reliable, so lowest-cost routing leans on the failover
mechanism more than the other strategies do.

**Example reason produced:**
`Selected Vendor C because it has the lowest cost (cost=1) among eligible vendors.`

### 4. LOWEST_LATENCY

**Rule:** pick the vendor with the smallest `avgLatencyMs`. Optionally, a
`maxLatency` requirement first restricts the pool to vendors whose average
latency fits under the ceiling.

**Algorithm:**

```
pool     = maxLatency ? vendors where avgLatencyMs ≤ maxLatency : vendors
eligible = pool is non-empty ? pool : vendors      ← soft-constraint fallback
sort eligible ascending by avgLatencyMs, take the head
```

**The soft-constraint fallback matters:** if the client demands
`maxLatency: 100` but the fastest vendor averages 120ms, a hard constraint
would fail the request outright. The engine instead treats `maxLatency` as a
*preference*: when the filter empties the pool, it silently falls back to the
full pool and still picks the fastest available vendor. The request succeeds
with the best latency achievable rather than failing on an unattainable
requirement. (The trade-off: the reason string still mentions the requirement,
so a log reader can spot that e.g. an 800ms vendor was chosen "within the
100ms requirement" — a known cosmetic quirk of the fallback path.)

Note the comparison uses the vendor's *configured/rolling average* latency,
not a live measurement — the engine predicts, the metrics service later
records what actually happened.

**When to use:** user-facing, latency-sensitive flows — a customer waiting on
a KYC check during signup, an OTP that must arrive now.

**Example reason produced:**
`Selected Vendor A because it has the lowest average latency (120ms) within the 500ms requirement.`

### 5. FAILOVER

**Rule:** when a selected vendor's call fails, pick the highest-priority
vendor that has *not yet been attempted* in this request. Repeat until a call
succeeds or no vendors remain.

**Algorithm (`nextFailoverVendor`):**

```
remaining = vendors minus those whose id is in attemptedVendorIds
if remaining is empty → return null        (signals "all vendors exhausted")
sort remaining ascending by priority, take the head
```

**Failover is orthogonal to the initial strategy.** A request may *start* with
LOWEST_COST (picking Vendor C), but once C fails, subsequent attempts are
ranked by priority, not by cost. The reasoning: after a failure, the goal
shifts from optimizing the client's preference to maximizing the chance of
*any* success, and priority is the operator's reliability ranking. Each
failover hop rewrites `strategyUsed` to `"FAILOVER"`, so the persisted log for
a rescued request reflects that failover — not the original strategy — made
the final call.

**Termination is guaranteed:** every attempt adds a vendor to
`attemptedVendorIds`, the pool is finite, and the function returns `null` once
the exclusion covers the whole pool. The controller translates `null` into a
`502` response with a log entry whose `status` is `FAILED` and whose
`attemptedVendors` lists every vendor tried.

**Worked example** (all three seeded vendors, default strategy):

```
Attempt 1: PRIORITY selects Vendor A (priority 1)  → call fails
Attempt 2: FAILOVER — attempted={A}, remaining={B, C},
           picks Vendor B (priority 2)              → call fails
Attempt 3: FAILOVER — attempted={A, B}, remaining={C},
           picks Vendor C (priority 3)              → call succeeds
Result: 200 OK, strategyUsed="FAILOVER", vendorSelected="Vendor C",
        attemptedVendors=["Vendor A", "Vendor B", "Vendor C"]
```

**Example reason produced:**
`Failover triggered. Selected next available vendor Vendor B (priority=2).`

---

## Vendor Fields the Engine Reads

The engine touches only five fields of a vendor document; everything else
(capabilities, health, rate limits, enabled flag) has already been handled by
the eligibility filter upstream.

| Field | Type | Used by | Semantics |
|---|---|---|---|
| `_id` | ObjectId | all | identity, stringified into results and failover exclusion |
| `name` | string | all | human-readable identity in results and reasons |
| `priority` | number | PRIORITY, FAILOVER | rank — lower number wins |
| `weight` | number | WEIGHTED | relative traffic share, 0 = drained |
| `cost` | number | LOWEST_COST | per-request cost — lower wins |
| `avgLatencyMs` | number | LOWEST_LATENCY | expected latency — lower wins |

## Requirements the Engine Accepts

All fields of `RouteRequirements` are optional; an absent or empty
`requirements` object simply lands on the PRIORITY default.

| Field | Type | Effect |
|---|---|---|
| `strategy` | `"PRIORITY" \| "WEIGHTED" \| "LOWEST_COST" \| "LOWEST_LATENCY"` | forces a specific strategy (highest precedence) |
| `preferLowCost` | boolean | auto-selects LOWEST_COST when no strategy given |
| `preferLowLatency` | boolean | auto-selects LOWEST_LATENCY when no strategy given |
| `maxLatency` | number (ms) | soft latency ceiling; alone, it also triggers LOWEST_LATENCY |

### Request examples

```jsonc
// Default — priority routing
{ "capability": "PAN_VERIFICATION", "payload": { "pan": "ABCDE1234F" } }

// Explicit strategy
{ "capability": "PAN_VERIFICATION", "payload": { ... },
  "requirements": { "strategy": "WEIGHTED" } }

// Flag-driven auto-decide
{ "capability": "OCR", "payload": { ... },
  "requirements": { "preferLowCost": true } }

// Latency ceiling (soft) — triggers LOWEST_LATENCY by itself
{ "capability": "KYC", "payload": { ... },
  "requirements": { "maxLatency": 500 } }
```

---

## Design Properties & Guarantees

**Stateless and pure(ish).** No I/O, no shared mutable state, no memory
between calls. The single source of non-determinism is `Math.random()` inside
WEIGHTED — which tests tame by mocking `Math.random`, making even the random
strategy fully deterministic under test.

**Non-mutating.** Every sorting strategy spreads the input array before
calling `sort`, so the caller's vendor list is never reordered as a side
effect. (The failover path sorts the output of `filter`, which is already a
fresh array.)

**Total.** Every code path returns a result or throws the one documented
error: empty pool in `selectVendor`. `nextFailoverVendor` prefers a `null`
return over throwing, because pool exhaustion is an expected outcome the
controller must handle, not an exceptional condition.

**Explainable by construction.** No selection leaves the engine without a
concrete, numbers-included reason string, which is what makes the routing log
and the AI explanation endpoint meaningful.

**Extensible.** Adding a strategy is mechanical: write a
`fooRouting(vendors, ...): VendorSelectionResult` function, add its literal to
the `RoutingStrategy` union in `types/routing.types.ts`, and insert one branch
into the cascade in `selectVendor`. Nothing else in the codebase needs to
change — controllers, logging, and metrics all operate on the uniform
`VendorSelectionResult`.

**Known simplifications** (intentional, per project scope): tie-breaking
relies on stable sort order rather than an explicit rule; `rateLimitPerMin` is
stored on vendors but not yet enforced by the engine; latency decisions use
configured averages rather than live percentiles; and the WEIGHTED strategy
draws from `Math.random()` rather than a seeded or cryptographic source —
all reasonable trade-offs for a basic-to-intermediate system, and all natural
future-improvement hooks.

---

## Testing the Engine

Because the engine is pure, its unit suite
(`tests/unit/routing-engine.service.test.ts`) needs no database: plain fixture
objects cast to `VendorDocument` are sufficient. Coverage includes every
strategy's happy path, the full decision cascade (explicit strategy beats
flags beats default), `maxLatency` filtering and its empty-pool fallback, the
empty-vendor-pool throw, input immutability, and WEIGHTED behavior verified
two ways — deterministically with a mocked `Math.random`, and statistically
over thousands of rolls with generous tolerances so the assertion never
flakes. Failover is exercised through progressive exclusion down to the `null`
exhaustion case, and again end-to-end in the `/route` integration tests where
vendor call outcomes are scripted to force real failover chains.