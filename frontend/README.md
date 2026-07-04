# Frontend — Intelligent Vendor Routing Platform

A fully static admin dashboard for the vendor routing platform, built with
**plain HTML, CSS, and vanilla JavaScript** — no framework, no bundler, no
build step. It talks to the backend REST API and provides live visibility into
routing decisions, vendor health, and per-vendor performance, plus full vendor
management and a built-in route tester.

**Charts:** Chart.js (loaded from CDN). **Fonts:** Space Grotesk, Inter, and
JetBrains Mono via Google Fonts. Everything else is hand-written.

---

## Folder Structure

```
frontend/
├── index.html          # Dashboard — stats, health snapshot, live routing ticker
├── vendors.html        # Vendor management (CRUD) + route tester
├── metrics.html        # Charts + per-vendor metrics table
├── logs.html           # Routing logs + per-row AI "Explain" action
├── ai-config.html      # AI config generator — ⚠ NOT integrated yet (see below)
├── css/
│   └── styles.css      # Single stylesheet: layout, cards, tables, pills, modal, ticker, toasts
└── js/
    ├── api.js          # Central API client + shared helpers (used by every page)
    ├── dashboard.js    # index.html logic
    ├── vendors.js      # vendors.html logic
    ├── metrics.js      # metrics.html logic
    ├── logs.js         # logs.html logic
    └── ai-config.js    # ai-config.html logic — ⚠ NOT integrated yet (see below)
```

Every page shares the same shell: a fixed sidebar with brand + navigation, a
topbar with the page title, and a content area of cards. Each page loads
`js/api.js` first and then its own page script.

---

## Pages

### Dashboard (`index.html` + `js/dashboard.js`)

The landing page, giving a live overview of the whole platform:

- **Stat cards** — total, successful, and failed requests plus average
  latency, pulled from `GET /vendor-metrics`.
- **Live routing ticker** — the signature element: a continuously scrolling
  marquee of the 15 most recent routing decisions (vendor dot, capability,
  latency, status), fed by `GET /routing-logs?limit=15`. The item list is
  duplicated in the DOM so the CSS `-50%` translate loops seamlessly. Failed
  decisions are visually flagged.
- **Vendor health snapshot** — every vendor with its priority and a colored
  HEALTHY / WARNING / OFFLINE pill, from `GET /health`.
- **"How Routing Works"** — a short explainer card with the vendor color
  legend.

The page polls automatically — ticker every 8 s, health and stats every
10 s — so it behaves like a live dashboard without any page reloads or
WebSockets.

### Vendor Management (`vendors.html` + `js/vendors.js`)

Full CRUD over vendors plus a live test panel:

- **Vendor table** — name (with color dot), priority, weight, cost, average
  latency, capabilities, health pill, enabled state, and Edit/Delete actions.
- **Add/Edit modal** — one form for both create and update, with sensible
  defaults for new vendors (priority 5, weight 50, failure rate 0.05, …).
  Capabilities are entered comma-separated and normalized to uppercase before
  submit. Delete asks for confirmation first.
- **Test the Router** — sends a real `POST /route` request from the browser.
  The capability dropdown is built dynamically from the capabilities of the
  vendors that actually exist, and the strategy dropdown offers Auto /
  Priority / Weighted / Lowest Cost / Lowest Latency. The raw JSON response —
  including strategy used, reason, attempted vendors, and latency — is
  pretty-printed below the form, and the vendor table refreshes afterwards so
  any health change caused by the test is immediately visible.

### Metrics (`metrics.html` + `js/metrics.js`)

Per-vendor performance visualization, refreshed every 10 s:

- **Stat cards** — totals plus platform-wide error rate.
- **Average Latency by Vendor** — Chart.js bar chart, one bar per vendor in
  its brand color.
- **Success vs Failure by Vendor** — stacked bar chart (green successes, red
  failures).
- **Detail table** — requests, successes, failures, average latency, error
  rate, and availability per vendor. Chart instances are destroyed and rebuilt
  on each refresh to avoid Chart.js canvas leaks.

### Routing Logs (`logs.html` + `js/logs.js`)

The audit trail of every routing decision:

- **Logs table** — timestamp, capability, selected vendor, strategy pill,
  latency, and SUCCESS/FAILED status for the 100 most recent decisions, newest
  first, with a manual Refresh button.
- **Explain (AI)** — each row has an Explain button that expands an inline
  panel showing the engine's own `reason` string immediately, then calls
  `POST /ai/explain-route` with the log's ID and streams in Gemini's
  plain-English explanation. Clicking again collapses the panel; the button is
  disabled while the request is in flight.

### AI Config (`ai-config.html` + `js/ai-config.js`) — ⚠ not integrated

**Status: the files exist but this page is not finished and not integrated
into the app yet.** The intended feature is a plain-English → routing-config
generator: the user types a policy like *"Use Vendor A for 70% traffic and
Vendor B for 30%"*, the page calls `POST /ai/generate-config`, and the
resulting JSON (strategy, vendor weights, latency threshold, notes) is
displayed — and eventually applied to the vendors.

The backend endpoint is live and the API client already exposes
`api.generateAiConfig(instruction)`, but the page itself is incomplete, so it
should not be considered part of the working product. That's also why
`index.html`'s sidebar intentionally omits the AI Config link, while the other
pages still show it — expect inconsistent navigation to that page until the
integration is finished. Finishing this page is a planned improvement.

---

## The API Client (`js/api.js`)

All backend communication goes through a single shared client, so the base URL
lives in exactly one place:

```javascript
const API_BASE_URL = "https://intelligent-vendor-routing-platform.onrender.com/api/v1";
```

`apiRequest()` wraps `fetch`, sets the JSON content type, parses the response
envelope, and converts any `success: false` or non-2xx response into a thrown
`Error` with the server's message — so every page can use simple
`try/catch` blocks. The exposed methods map one-to-one onto the backend API:
`getVendors`, `createVendor`, `updateVendor`, `deleteVendor`, `getHealth`,
`getVendorMetrics`, `getRoutingLogs`, `routeRequest`, `generateAiConfig`, and
`explainRoute`.

`api.js` also provides the shared UI helpers used across pages: `showToast()`
(stacked, auto-dismissing notifications), `vendorColor()` (the consistent
per-vendor color coding — Vendor A teal, Vendor B purple, Vendor C amber),
`healthPillHtml()`, and the `formatLatency` / `formatPercent` /
`formatTimestamp` formatters.

---

## Configuration

The only configuration is `API_BASE_URL` at the top of `js/api.js`:

| Target backend | Value |
|---|---|
| Deployed (Render) | `https://intelligent-vendor-routing-platform.onrender.com/api/v1` |
| Local backend | `http://localhost:3000/api/v1` |

Point it at whichever backend you're using. Two things must line up:

1. The backend's `CLIENT_ORIGIN` env var must match the URL the frontend is
   served from (e.g. `http://127.0.0.1:5500` for Live Server, or the Vercel
   URL in production) — otherwise the browser blocks requests with CORS
   errors.
2. If you use the deployed Render backend on the free tier, the first request
   after idle can take 30–60 s while the service wakes up; the pages will show
   their loading states until it responds.

---

## Running Locally

There is no build step and no `npm install` — just serve the folder as static
files. Opening the HTML files via `file://` won't work reliably (CORS/fetch
restrictions), so use any static server:

**Option A — VS Code Live Server:** right-click `index.html` → *Open with
Live Server* (defaults to `http://127.0.0.1:5500`).

**Option B — any static file server:**

```bash
cd frontend
npx serve .
```

Then make sure the backend's `CLIENT_ORIGIN` matches that URL and
`API_BASE_URL` in `js/api.js` points at your backend.

---

## Deployment

The frontend deploys to **Vercel** as a static site (project root directory
set to `frontend/`). A GitHub Actions workflow
(`.github/workflows/frontend-ci-cd.yml`) triggers a Vercel deploy hook on
every push to `main` that touches `frontend/**` — see the CI/CD documentation
for details. Since `API_BASE_URL` is hardcoded to the Render backend, the
deployed frontend works out of the box; remember to add the Vercel URL to the
backend's `CLIENT_ORIGIN`.

---

## Design Notes

Dark-themed admin UI driven by CSS custom properties in `styles.css` (colors,
borders, radii), with three typefaces playing distinct roles: Space Grotesk
for headings and brand, Inter for body text, JetBrains Mono for numbers, IDs,
and raw JSON. Recurring components — cards, stat tiles, status pills with
colored dots, the modal overlay, toast stack, and the marquee ticker — are all
plain CSS, no component library. Vendor identity is reinforced everywhere
through the fixed color mapping, so Vendor A/B/C are recognizable at a glance
across the ticker, tables, charts, and health panels.

---

## Known Limitations / Future Improvements

The AI Config page is unfinished and not integrated (see above) — completing
it is the main pending item, along with adding its sidebar link consistently
across all pages. Live updates are polling-based (8–10 s intervals) rather
than WebSocket/SSE push. There is no authentication — anyone with the URL can
manage vendors — which is intentional for the project scope. And the vendor
color mapping only covers the three seeded vendors; additional vendors fall
back to a neutral gray dot.