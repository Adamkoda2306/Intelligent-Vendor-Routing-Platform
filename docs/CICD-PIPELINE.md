# CI/CD Pipeline — Intelligent Vendor Routing Platform

This project ships with two independent GitHub Actions pipelines — one for the
backend (test-gated deploy to **Render**) and one for the frontend (direct
deploy to **Vercel**). Each pipeline lives in its own file and triggers only
when its own part of the repository changes, so a frontend tweak never burns
CI minutes running backend tests, and vice versa.

```
.github/
└── workflows/
    ├── backend-ci-cd.yml    # test → deploy to Render
    └── frontend-ci-cd.yml   # deploy to Vercel
```

> The `.github/workflows/` folder must sit at the **repository root**, not
> inside `backend/` or `frontend/` — GitHub only discovers workflows there.

---

## Pipeline at a Glance

```
                         push / PR touching backend/**
                                      │
                    ┌─────────────────┼─────────────────┐
                    ▼                 ▼                 ▼
              Unit Tests     Integration Tests      Coverage
              (parallel)        (parallel)         (parallel)
                    │                 │                 │
                    └─────────────────┼─────────────────┘
                                      ▼
                          all three succeeded?
                        AND push (not PR) to main?
                                      │
                              yes ────┴──── no → stop (no deploy)
                                      ▼
                          Deploy to Render (webhook)


                         push / PR touching frontend/**
                                      │
                        push (not PR) to main?
                                      │
                              yes ────┴──── no → stop
                                      ▼
                          Deploy to Vercel (webhook)
```

The backend pipeline is a **quality gate**: broken code can be pushed, but it
can never reach production, because the deploy job hard-depends on every test
job. The frontend is static HTML/CSS/JS with no build step or test suite, so
its pipeline is a pure deploy trigger.

---

## Backend Pipeline (`backend-ci-cd.yml`)

### Triggers

```yaml
on:
  push:
    branches: [main]
    paths: ["backend/**"]
  pull_request:
    branches: [main]
    paths: ["backend/**"]
```

The workflow fires on pushes to `main` and on pull requests targeting `main`,
but **only** when at least one changed file lives under `backend/`. The
`paths` filter is what keeps the two pipelines independent: editing
`frontend/index.html` or `README.md` at the root does not start this workflow
at all.

Both events run the three test jobs, which means every pull request gets
tested *before* merge and its status checks appear on the PR page. The deploy
job, however, has an additional condition that excludes PRs entirely (see
[Deploy gating](#deploy-gating)).

### Concurrency control

```yaml
concurrency:
  group: backend-ci-${{ github.ref }}
  cancel-in-progress: true
```

If you push twice in quick succession, the run for the older commit is
cancelled as soon as the newer one starts. This saves runner minutes and
guarantees that the deploy — if it happens — always corresponds to the latest
commit on the branch, never a stale one that happened to finish later. The
group key includes the branch ref, so runs on different branches (e.g. two
open PRs) never cancel each other.

### Global environment variables

```yaml
env:
  NODE_ENV: test
  PORT: 3000
  MONGO_URI: ${{ secrets.MONGO_URI }}
  GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
  GEMINI_MODEL: ${{ secrets.GEMINI_MODEL }}
  CLIENT_ORIGIN: ${{ secrets.CLIENT_ORIGIN }}
```

A workflow-level `env` block is inherited by **every job and step**, so the
variables are defined once instead of being repeated per job. Sensitive values
are injected from GitHub Actions **repository secrets** — they are encrypted
at rest and automatically masked (`***`) in all logs, even if a test
accidentally prints them.

Precedence works inside-out: a step-level `env` overrides a job-level one,
which overrides this workflow-level block. The test bootstrap
(`tests/setupEnv.ts`) also uses `process.env.X || <default>`, so any value set
here wins over the local test defaults.

Two important scoping notes: these variables exist only inside CI runs. The
**deployed** application on Render reads its environment from Render's own
Environment tab — this file contributes nothing to production runtime config.
And since the integration tests spin up an in-memory MongoDB and fully mock
the Gemini SDK, the real `MONGO_URI` and `GEMINI_API_KEY` are not strictly
required for tests to pass; they are wired in so any future test that needs a
real service can use them without workflow changes.

### Working directory default

```yaml
defaults:
  run:
    working-directory: backend
```

Because this is a monorepo with the Node project inside `backend/`, every
`run:` step defaults to executing there — `npm ci` and `npm test` just work
without `cd backend` everywhere. The one exception is the deploy job, which
never checks out the repository (it only calls `curl`), so `backend/` does not
exist on its runner. Its single step therefore overrides the default with
`working-directory: .` — without that override, bash cannot even start and the
job fails with *"No such file or directory"*.

### Job 1 — Unit Tests

Checks out the repo, installs Node 20 with the built-in npm cache (keyed on
`backend/package-lock.json`), installs dependencies with `npm ci`, and runs
`npm run test:unit`. These are the fast, pure tests — routing engine
strategies, metrics math, health thresholds, the mocked Gemini service —
requiring no database and no network.

`npm ci` is used instead of `npm install` deliberately: it installs *exactly*
what the lock file specifies, fails loudly if `package.json` and
`package-lock.json` have drifted apart, and never mutates the lock file. That
is precisely what you want in CI — reproducible installs identical to what was
tested locally.

### Job 2 — Integration Tests

Same setup as unit tests, plus one extra cache step:

```yaml
- name: Cache MongoDB memory server binaries
  uses: actions/cache@v4
  with:
    path: ~/.cache/mongodb-binaries
    key: mongodb-memory-server-${{ runner.os }}
```

The integration suite uses `mongodb-memory-server`, which downloads a real
MongoDB binary (~70 MB) the first time it runs. Caching that binary means only
the very first pipeline run pays the download; every subsequent run restores
it in seconds. The suite then exercises the real HTTP surface — vendor CRUD,
`/route` with failover, health, metrics, logs, and AI endpoints — via
Supertest against the in-memory database. The npm script runs Jest with
`--runInBand` so integration files execute serially and never race each other
over the shared mongoose connection.

### Job 3 — Coverage Report

Runs the **entire** suite (unit + integration) with `--coverage`, then
publishes the resulting `backend/coverage/` folder as a downloadable artifact:

```yaml
- uses: actions/upload-artifact@v4
  with:
    name: coverage-report
    path: backend/coverage
    retention-days: 14
```

After any run, open the workflow run page → **Artifacts** →
`coverage-report`, unzip it, and open `lcov-report/index.html` in a browser
for the full per-file, per-line coverage view. Artifacts are kept for 14 days.

Note the artifact path is `backend/coverage`, not `coverage` — the
`defaults.run.working-directory` applies only to `run:` steps, **not** to
`uses:` action inputs, so action paths must be written relative to the repo
root. This asymmetry is a common GitHub Actions gotcha.

### All three jobs run in parallel

There is no `needs:` between the test jobs, so GitHub schedules them on three
runners simultaneously. Total pipeline time is roughly the *slowest* job (the
coverage job, since it runs everything) rather than the *sum* of all three.
The trade-off — coverage re-executes tests the other jobs already ran — is
accepted for job isolation: each job's pass/fail shows up as its own named
status check, and a unit failure is instantly distinguishable from an
integration failure without opening logs.

### Deploy gating

```yaml
deploy:
  needs: [unit-tests, integration-tests, coverage]
  if: github.event_name == 'push' && github.ref == 'refs/heads/main'
```

Two independent gates must both open:

1. **`needs`** — the deploy job is skipped unless *all three* test jobs
   succeeded. One red job anywhere blocks deployment entirely.
2. **`if`** — even with green tests, deploy only runs for a real **push** to
   **main**. Pull requests run the tests (so reviewers see the checks) but can
   never trigger a production deploy, which also protects against a malicious
   or accidental deploy from a fork PR.

### The Render deploy step

```bash
response=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${{ secrets.RENDER_DEPLOY_HOOK_URL }}")
if [ "$response" -ge 200 ] && [ "$response" -lt 300 ]; then
  echo "✅ Render deploy triggered successfully (HTTP $response)"
else
  echo "❌ Render deploy hook failed (HTTP $response)"
  exit 1
fi
```

Render exposes a private **deploy hook** URL per service; POSTing to it tells
Render to pull the latest commit and rebuild. The step captures only the HTTP
status code (`-s -o /dev/null -w "%{http_code}"`), treats any 2xx as success,
and explicitly `exit 1`s otherwise so a rejected hook turns the job red
instead of silently "passing" while nothing deployed.

The hook fires and forgets: a green deploy job means *Render accepted the
trigger*, not that the build on Render's side succeeded. Watch the Render
dashboard (or configure Render's own notifications) for build failures.

---

## Frontend Pipeline (`frontend-ci-cd.yml`)

The frontend is static HTML/CSS/JS with no build step, no dependencies, and no
test suite, so its pipeline is a single job mirroring the backend's deploy
stage:

```yaml
on:
  push:
    branches: [main]
    paths: ["frontend/**"]
  pull_request:
    branches: [main]
    paths: ["frontend/**"]

concurrency:
  group: frontend-ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  deploy:
    name: Deploy to Vercel
    runs-on: ubuntu-latest
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    steps:
      - name: Trigger Vercel deploy hook
        run: |
          response=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${{ secrets.VERCEL_DEPLOY_HOOK_URL }}")
          ...
```

Same patterns, same reasoning: path-filtered trigger, per-branch concurrency,
push-to-main-only gate, and a status-checked webhook call against
`VERCEL_DEPLOY_HOOK_URL`. Since the only job is the curl step and nothing is
checked out, this workflow needs no `defaults.run.working-directory` block at
all — the runner's default directory is fine.

---

## One-Time Setup

### 1. GitHub repository secrets

Repo → **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Used by | Where to get it |
|---|---|---|
| `RENDER_DEPLOY_HOOK_URL` | backend deploy | Render → your service → Settings → Deploy Hook |
| `VERCEL_DEPLOY_HOOK_URL` | frontend deploy | Vercel → project → Settings → Git → Deploy Hooks |
| `MONGO_URI` | backend test env | your MongoDB/Atlas connection string |
| `GEMINI_API_KEY` | backend test env | Google AI Studio |
| `GEMINI_MODEL` | backend test env | e.g. `gemini-2.5-flash` |
| `CLIENT_ORIGIN` | backend test env | your deployed frontend URL |

Secret names are case-sensitive. A referenced-but-missing secret silently
becomes an **empty string**, not an error — if a job fails with something like
"GEMINI_API_KEY is not configured," the first thing to check is the exact
spelling of the secret name.

Treat both deploy-hook URLs as passwords: anyone holding the URL can trigger
deployments of your services.

### 2. Render configuration

In the Render service settings, turn **off** "Auto-Deploy" (Yes → No).
Otherwise Render deploys on every push by itself, bypassing the test gate and
making the entire pipeline pointless. Runtime environment variables
(`MONGO_URI`, `GEMINI_API_KEY`, `NODE_ENV=production`, etc.) go in Render's
**Environment** tab.

### 3. Vercel configuration

If the Vercel project is connected to the Git repo, disable its automatic
Git deployments (project → Settings → Git) for the same reason, and rely on
the deploy hook. Set the project's **Root Directory** to `frontend/`.

---

## Troubleshooting

**`npm ci` fails with `EUSAGE` / "lock file out of sync."**
`package.json` was edited without reinstalling. Locally run
`cd backend && rm -rf node_modules && npm install`, commit the regenerated
`package-lock.json`, and push. Also confirm the lock file is tracked by git
and that your local Node major version matches the workflow's (`node-version:
20`) — lock files generated under different majors can resolve optional
transitive deps differently.

**Deploy step: "error occurred trying to start process '/usr/bin/bash' …
No such file or directory."**
A `run:` step is trying to start in `backend/` on a runner that never checked
out the repo. Keep `working-directory: .` on the deploy step (or move the
working-directory default from workflow level down into the test jobs).

**Deploy job shows "skipped."**
Working as designed: either a test job failed (check the red job) or the event
was a pull request / a push to a non-main branch, which the `if:` gate
excludes.

**Integration job is slow on its first run.**
First run downloads the MongoDB binary for `mongodb-memory-server`; the cache
step makes every later run fast. If the cache ever corrupts, bump the cache
`key` (e.g. append `-v2`) to force a fresh download.

**Deploy job is green but production didn't update.**
The webhook only *triggers* the platform build. Check the Render/Vercel
dashboard for the actual build log — a build-time failure there does not
propagate back to GitHub Actions.

**Workflow didn't run at all.**
Check the changed paths: a commit touching neither `backend/**` nor
`frontend/**` (e.g. only the root README) intentionally triggers nothing.

---

## Extending the Pipeline

The structure makes common additions mechanical. A lint or type-check job is a
copy of the unit-test job with `npm run lint` / `npx tsc --noEmit` as its final
step, plus its name added to the deploy job's `needs` list so it becomes part
of the gate. A staging environment is a second deploy job gated on a
`develop` branch with its own `RENDER_STAGING_DEPLOY_HOOK_URL` secret. And if
the frontend ever gains a build step or tests, its workflow grows the same
test-then-deploy shape the backend already has — the `needs` + `if` gating
pattern transfers unchanged.