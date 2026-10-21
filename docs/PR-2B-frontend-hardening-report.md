# PR-2B - FRONTEND HARDENING REPORT

Date: 2026-10-04. Repository: restaurants-web.

Updated by [PR-2B.1 correction](PR-2B.1-frontend-hardening-correction-report.md).
Build targets and vendor scan decisions below reflect the corrected implementation;
the original file/stat inventory is a historical PR-2B snapshot.

## GIT

HEAD: 1f0018d, main (origin/main). Initial clean: YES.
Verified status, branch tracking and last 15 commits before edits.
Backend source was not accessed. No deploy, real domain configuration, commit or push.

## ENV VALIDATION

Module: src/config/env.ts; runtime consumer: src/config/runtime.ts.
Vite calls the same validator before build; runtime calls it before clients/QR initialize.
Variables actually used (all public): VITE_API_URL, VITE_PUBLIC_APP_URL,
VITE_REVERB_APP_KEY, VITE_REVERB_HOST, VITE_REVERB_PORT, VITE_REVERB_SCHEME.

Required staging / production: API and public app HTTPS origins. Reverb is optional
only when all four values are empty; any configured value requires all four.
Reverb requires a bare host, public key, integer port 1..65535 and https (WSS only).
Validated, trimmed Reverb values are consumed directly, including the TLS flag.
Target is determined only by Vite MODE: development = local, staging = staging,
production = production. Unknown modes fail. Local QA builds and the development
server allow local HTTP and an empty public origin (QR disabled).

Staging localhost: REJECTED. Production localhost: REJECTED.
HTTP: REJECTED. Invalid URLs: REJECTED. Loopback/unspecified hosts (including IPv6,
subdomains of localhost and alternate IPv4 forms) are rejected in secure modes.
Origins cannot carry paths other than /, credentials, query strings or fragments.
Fail-fast: explicit Invalid build configuration: VARIABLE_NAME; values/secrets
are never included in validation errors.

Environment rule: configure the intended environment's origins explicitly.
No real domain is hardcoded and no automatic staging/production domain inference
is attempted. HTTPS is the minimum rule requested for both environments.

.env.example documents local, staging, production, the existing /t/:publicToken
route, and that every VITE_* value is public and embedded in the bundle.

## QR

Local: valid HTTP origins accepted; unset public origin returns null.
Staging / production: use the centrally validated HTTPS origin; unsafe values
prevent build and bootstrap. Tokens are encoded as one URL path segment.
Unsafe QR possible under the stated localhost/HTTP/invalid-origin rules: NO.
A syntactically safe origin still needs operational confirmation that it hosts
the correct environment; the frontend cannot prove this without domain policy.

## HTTP

Authenticated timeout: 30,000 ms. Public timeout: 30,000 ms.
Upload exception: productService.uploadMedia uses 180,000 ms for image/video.
Audit found one FormData upload path. Normal requests remain bounded without
an arbitrarily short media timeout. No automatic replay of mutations is added.
429 Retry-After: normalized to optional retryAfterSeconds; supports integer
seconds and HTTP-date, clamps past dates to zero, rejects malformed values.

## AUTH BOOTSTRAP

401: anonymous state, login through the existing guard.
419: expired/missing session, same anonymous bootstrap outcome.
Network / timeout / 5xx: unavailable state; login/protected content stays hidden.
Retry: localized action resets the memoized bootstrap, checks identity again,
then forces navigation through the actual guard. Concurrent bootstrap callers
still share one request. Permission context retains its existing fail-closed
behavior on non-session failures.

## SESSION

401 runtime / 419: authenticated client interceptor clears user/context/restaurant
and calls disconnectEcho, then redirects an authenticated non-public route to login.
Loop prevention: expiration is idempotent; no automatic request retry; login,
CSRF-cookie and logout endpoints are excluded; login credentials remain handled
by the form. Anonymous bootstrap is handled by the store, without forced navigation
from the interceptor. Session notices are localized.
Public client unaffected: separate instance; no session interceptor/credentials.
Public route bypasses admin bootstrap and is never redirected by session handling.

## LOGOUT

Backend success: local state cleared, Echo disconnected, navigation to login.
Backend offline / timeout: same cleanup and navigation, without propagating the
raw error to UserMenu. Localized notice explicitly states server sign-out could
not be confirmed; server session revocation is not claimed.

## I18N

ES: es-ES. CA: ca-ES-valencia. EN: en-GB.
Added API unavailable, session expired, logout incomplete and retry messages.
Build configuration errors are developer-facing and identify variable names only.

## AGENT BROWSER / PROD HARNESS

Before: agent-browser ^0.36.0 in dependencies (locked 0.36.0).
After: same version/range in devDependencies; lockfile updated by npm install.
Bundle impact: no runtime import; zero agent-browser strings in staging dist.
tests/day-close-whatsapp.browser.ts remains unchanged, not imported by src/Vite,
and absent from dist. New focused .mjs checks stay outside production code.
No separate browser TypeScript infrastructure was added.

## BUILD

npm ci: PASS (final real clean installation).
npx vue-tsc -b: PASS.
Local default npm run build with existing localhost API: PASS (development mode,
local target). npm run dev uses the same explicit local target.
npm run build:production with safe fictitious production HTTPS/WSS variables: PASS.
Staging simulated build with HTTPS/WSS .example variables: PASS.
Local AFORO origins in staging/production dist: ZERO. Generic inert vendor
http://localhost text is allowed and does not indicate application config.
No requests were sent to these fictitious hosts.

Axios retains its published non-browser http://localhost fallback. PR-2B.1 removed
the former scoped transform completely. No vendor source is patched or rewritten.
Scans check specific local AFORO origins/known local env origins and separately
verify the resolved runtime config, embedded HTTPS origins and actual QR consumer.

NPM AUDIT: PASS, 0 vulnerabilities. No npm audit fix used.
git diff --check: PASS.

## TESTS / BROWSER

npm run test:hardening:
- 115 focused checks through Vite-loaded frontend modules.
- Env: local acceptance; staging/production required values, invalid/insecure
  origins, Reverb completeness/port/host/TLS and normalized TLS whitespace.
- QR: actual URL helper, encoded token and missing token; secure origins tested
  by the same validation module required before QR initializes.
- Auth: 401, 419, network, 500; bootstrap retry; expired state/restaurant cleanup;
  interceptor endpoint exclusions; public credentials separation.
- Navigation: actual router guards with memory history; 401/419 go to login,
  network/500 keep target route behind unavailable UI, public route bypasses auth.
- Logout: backend success/offline, local cleanup, notice and login navigation.
- Fourteen actual Vite fail-fast builds (API/public localhost and HTTP, Reverb
  localhost, non-TLS and partial config, all in both secure modes).
- Two safe actual Vite builds (production then staging), followed by byte scans
  of every dist file for specific local application origins, test harness and
  agent-browser; generic inert vendor localhost is allowed.

Run: npm ci; npx vue-tsc -b; npm run test:hardening; npm audit.
The test command supplies fictitious env values only to its own process/children
and leaves dist containing the simulated staging build. It does not modify .env.
These are automated module/guard/build checks, not a rendered-browser UI run;
route components are placeholders in the memory-history checks. No live backend,
real Reverb socket or production logout revocation was exercised.

## FILES CHANGED

```text
docs/PR-2B-frontend-hardening-report.md
.env.example
package-lock.json
package.json
src/App.vue
src/api/errors.ts
src/api/http.ts
src/api/public-http.ts
src/i18n/locales/ca-ES-valencia.ts
src/i18n/locales/en-GB.ts
src/i18n/locales/es-ES.ts
src/main.ts
src/realtime/echo.ts
src/router/index.ts
src/services/product.service.ts
src/stores/auth.ts
src/utils/table-public-url.ts
src/views/LoginView.vue
vite.config.ts
src/api/retry-after.ts
src/api/session.ts
src/api/timeouts.ts
src/config/env.ts
src/config/runtime.ts
tests/frontend-hardening-build.mjs
tests/frontend-hardening.mjs
```

Tracked git diff --stat (new untracked files listed above are additional):

```text
 .env.example                       | 30 +++++++++++--------
 package-lock.json                  | 61 +++++++++++++++++++++++++++++++++++++-
 package.json                       |  7 +++--
 src/App.vue                        | 11 +++++++
 src/api/errors.ts                  |  6 +++-
 src/api/http.ts                    |  5 +++-
 src/api/public-http.ts             |  5 +++-
 src/i18n/locales/ca-ES-valencia.ts |  5 ++++
 src/i18n/locales/en-GB.ts          |  5 ++++
 src/i18n/locales/es-ES.ts          |  5 ++++
 src/main.ts                        |  9 ++++++
 src/realtime/echo.ts               | 27 +++++++----------
 src/router/index.ts                |  1 +
 src/services/product.service.ts    |  3 +-
 src/stores/auth.ts                 | 55 +++++++++++++++++++++-------------
 src/utils/table-public-url.ts      | 30 ++++---------------
 src/views/LoginView.vue            | 10 +++++++
 vite.config.ts                     | 48 ++++++++++++++++++++----------
 18 files changed, 224 insertions(+), 99 deletions(-)
```

## BUGS FOUND

Unvalidated build/QR origins; missing HTTP timeouts; network/5xx misclassified as
anonymous; missing coherent runtime 401/419 cleanup; rejected logout preventing
navigation; stale public-route documentation; browser tooling in production deps.
Also found npm's lock regeneration dropping two optional WASM dependency entries:
npm install restored @emnapi/wasi-threads and tslib; final npm ci passed. Existing
package versions were not upgraded. Found Axios's internal loopback fallback; PR-2B.1 preserves it unchanged and
corrects artifact checks to distinguish vendor text from application config.

## REMAINING BEFORE STAGING

Supply real, authorized HTTPS origins and optional Reverb public configuration
outside this PR, then validate actual staging connectivity/session/CORS/CSRF/QR
behavior against that deployment. Confirm the chosen public origin is the intended
environment. These operational checks require real values and were not simulated
as successful. No definitive domain, hosting configuration or deploy was created.

COMMIT: NO. PUSH: NO.

VERDICT: PR-2B READY FOR COMMIT.
