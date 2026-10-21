# PR-2B.1 - FRONTEND HARDENING CORRECTION REPORT

Date: 2026-10-04. Repository: restaurants-web. HEAD: 1f0018d, main.
Precheck: all PR-2B changes remained present and uncommitted; git diff --check passed.

## AXIOS

Vendor transform removed: YES, entirely from vite.config.ts.
node_modules/vendor code modified: NO patches or custom rewrites; npm ci restored
published packages through the normal install workflow.
Axios bundle behavior untouched: YES. Its inert non-browser http://localhost
fallback remains as published. No transform targets Axios internals or replaces
vendor strings. No new dependency was introduced.

## BUILD TARGETS

| Workflow | Vite mode | Validator target | Rules |
| --- | --- | --- | --- |
| npm run dev | development | local | HTTP/localhost allowed; public URL may be empty |
| npm run build | development | local | Same rules; local QA artifact allowed |
| npm run build:staging | staging | staging | Required API/public HTTPS origins; no loopback |
| npm run build:production | production | production | Same security rules as staging |

Target determination: resolveBuildTarget in src/config/env.ts uses only Vite MODE.
Unknown modes fail with Invalid build configuration: MODE. Neither command=build
nor import.meta.env.PROD determines the target. The runtime and Vite build config
call the same validator. Vite reserves the literal mode name local for .env.local;
development maps explicitly to the local target instead.

Secure modes retain complete/TLS Reverb validation when any realtime value is set.
All four empty disables realtime. Local mode retains PR-2B's optional behavior.
Configuration errors name only the invalid variable, without printing values.

## LOCAL BUILD

npm run build: PASS with the existing .env, no injected overrides.
Localhost allowed: YES, including HTTP API and optional blank public app origin.
Result: valid local QA build. No .env file was edited.

## STAGING BUILD

Command: npm run build:staging.
Secure env: https://api.staging.example, https://app.staging.example,
public-example-key, ws.staging.example, port 443, scheme https (WSS).
Result: PASS. Local AFORO origins in dist: ZERO.

## PRODUCTION BUILD

Command: npm run build:production.
Secure env: https://api.example, https://app.example,
public-example-key, ws.example, port 443, scheme https (WSS).
Result: PASS. Local AFORO origins in dist: ZERO.

Fictitious variables were supplied only to build/test processes. No requests were
sent to the .example hosts. The final dist is the simulated staging artifact.

## ARTEFACT SCAN

The scan verifies specific AFORO local origins, including http://localhost:8080,
http://localhost:5173, http://localhost:5174, http://127.0.0.1 and https://localhost.
It also loads the local env configuration to include known local API/public
origins and local ws/wss Reverb endpoints. Generic inert http://localhost is not
a prohibited needle; a regression fixture confirms it is tolerated.

For EACH safe production/staging build, tests verify embedded API/public/Reverb
values and scan every dist file. They then load the actual runtime config and QR
helper under the same mode and env: target and consumed origins must match the
expected .example values, Reverb must use TLS, and the QR URL must use the secure
public origin with an encoded token. This distinguishes application configuration
from strings in dependency implementation code. Production tooling/harness strings
remain excluded from dist.

## NEGATIVE BUILDS

All 14 real Vite builds were rejected before creating an index.html artifact in
a unique output path. Both staging and production exercised every row:

| Case | Staging | Production | Variable identified |
| --- | --- | --- | --- |
| API localhost | REJECTED | REJECTED | VITE_API_URL |
| Public localhost | REJECTED | REJECTED | VITE_PUBLIC_APP_URL |
| API HTTP | REJECTED | REJECTED | VITE_API_URL |
| Public HTTP | REJECTED | REJECTED | VITE_PUBLIC_APP_URL |
| Reverb localhost | REJECTED | REJECTED | VITE_REVERB_HOST |
| Reverb scheme http | REJECTED | REJECTED | VITE_REVERB_SCHEME |
| Reverb incomplete | REJECTED | REJECTED | VITE_REVERB_APP_KEY |

Error format: Invalid build configuration: VARIABLE_NAME.
Unit/module checks additionally cover missing/invalid origins, IPv4/IPv6 loopback,
Reverb port/host validation and trimmed TLS configuration.

## HARDENING REGRESSION

| Area | Result |
| --- | --- |
| Authenticated/public timeout | Preserved: 30,000 ms each |
| Upload timeout | Preserved: 180,000 ms |
| Bootstrap | Preserved: 401/419 anonymous; network/500 unavailable; retry |
| 401 runtime / 419 | Preserved: authenticated interceptor, exclusions, cleanup |
| Logout offline | Preserved: cleanup and login navigation; incomplete-server notice |
| Auth/Echo cleanup | clearSession/disconnectEcho implementation unchanged |
| Retry-After | Preserved: integer seconds / HTTP-date normalization |
| QR | Preserved: shared validated origin, encoded token, blank-local disabling |
| I18N | ES/CA/EN additions unchanged |
| Agent browser | Same version; remains in devDependencies |
| Public client | Separate; no authenticated session interceptor or credentials |
| localStorage | No auth token storage; only restaurant selection/theme/locale |

The correction changed only target/config wiring, scripts, scan/tests and docs.
The auth, HTTP, upload, Echo lifecycle, QR encoding and localization implementations
approved in PR-2B were not changed. Automated checks exercise modules/real router
guards with memory history; no rendered-browser or live-backend test was claimed.

## QUALITY

| Check | Result |
| --- | --- |
| npm ci | PASS |
| npx vue-tsc -b | PASS |
| npm run test:hardening | PASS: 115 focused checks + 14 negative / 2 safe builds |
| npm run build, current local env | PASS |
| npm run build:staging, simulated safe env | PASS |
| npm run build:production, simulated safe env | PASS |
| npm audit | PASS: 0 vulnerabilities |
| git diff --check | PASS |

Reproduce with npm ci, npx vue-tsc -b, npm run test:hardening, npm run build and
npm audit. The hardening tests supply fake secure values for their own processes
and do not call those hosts. The target-specific scripts were also executed
separately, in addition to the test harness builds.

## FILES CHANGED BY PR-2B.1

- vite.config.ts: removed vendor transform; validation derives from mode only.
- src/config/env.ts: explicit target resolver and returned target; no PROD flag.
- src/config/runtime.ts: same mode-only target resolution at bootstrap.
- package.json: explicit development/staging/production scripts.
- .env.example: corrected local QA workflow and target/security documentation.
- tests/frontend-hardening.mjs: local target and unknown-mode regressions.
- tests/frontend-hardening-build.mjs: 14 negative builds, semantic target/config/QR
  checks, per-target artifact scans and inert vendor fallback regression.
- docs/PR-2B-frontend-hardening-report.md: updated obsolete decisions/results.
- docs/PR-2B.1-frontend-hardening-correction-report.md: this report.

package-lock.json retains the PR-2B dependency move/repair unchanged by PR-2B.1.
All other uncommitted PR-2B changes remain in the working tree.

COMMIT: NO.
PUSH: NO.
DEPLOY: NO.
BACKEND SOURCE ACCESS: NO.

VERDICT: PR-2B READY FOR COMMIT.
