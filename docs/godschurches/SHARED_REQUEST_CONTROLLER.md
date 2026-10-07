# Shared request and draft controller

`@godschurches/shared-core` owns the request attempt core and the existing draft
controller. The browser imports both through small adapters. Native consumers
use this same package; secure storage, lifecycle, navigation and fetch remain
platform adapters. There is no new cache library, durable draft store or backend.

## Request adapter

`prepareRequest(adapter, input)` freezes the original path, method, body and
expected owner. It requires a result decoder; its second argument is the captured
identity, so a native decoder can bind a response envelope to the original viewer.
The adapter supplies:

- `capture(cancellation?)`: an identity `{ owner, generation }` and a `send`
  closure bound to that same credential snapshot. Generation is a non-secret
  integer or string that changes on account or credential replacement. It must
  never be the credential itself.
- `currentIdentity(cancellation?)`: the current identity after reading the response. Native
  adapters use their immediately invalidated session generation, with server
  authorization and verification still authoritative.
- `decodeFailure`, optional `challenge`, and `now`: validated error projection,
  platform challenge notification and a clock for Retry-After dates.

`send` supplies status, the Retry-After header and a `read()` function. It receives
only the frozen request and optional cancellation subscription. Native adapters
own the configured trusted HTTPS base URL and captured credential; the core only
accepts bounded `/api/platform/` paths without traversal. Do not use its relative
path as permission to send credentials to an untrusted host or follow a redirect
that changes origin. The canonical native API, original-owner headers and server
permission checks remain authoritative.

Cancellation has a `cancelled` flag and `subscribe(listener)` returning an
unsubscribe function. Bridge it to the platform's fetch abort mechanism. Cancel
and release response streams and subscriptions in the adapter. Cancellation or
malformed data after dispatch is an uncertain outcome, never proof that a write
did not happen. The core returns no stale data or challenge after an identity or
credential-generation change. Arbitrary transport diagnostics are not returned
because they can contain private URLs, credentials or response fragments.
The cancellation also covers a final identity network check. An identity failure
after dispatch keeps `dispatched: true` and `responseError: false`; callers must
require `responseError` before discarding a write as a definitive rejection.

There are no automatic retries. A write's explicit retry is allowed only when
the caller marks a reviewed endpoint idempotent and its frozen body includes a
valid original `mutationId`. Retain that prepared object for recovery. Do not
recreate it using changed component props, the latest account, new fields or a
new key. One object permits one concurrent attempt. Definitive server errors and
local uncertainty are distinct, and Retry-After is a bounded hint, not a timer.
The core keeps only its original request and identity, not a history or response
cache. The mounting owner must drop private pending objects on its chosen clear,
logout or unmount boundary; there is no automatic persistent storage.

## Initial native password issuance

`issueNativePasswordCredential(adapter, credentials, initiatingIdentity, options)`
is a single canonical `POST /api/platform/v1/auth/password` attempt. It snapshots
the initiating guest identity synchronously, validates exact password bytes with
`nativePasswordInput`, and requires that same guest generation after capture,
before dispatch and after reading the response. Ordinary prepared writes still
require an authenticated owner. There is no public guest-write option.

The adapter must omit bearer, cookie and expected-account headers for this guest
request, bind its send closure to the initiating generation, and recheck that
local generation immediately before network dispatch. The response uses
`decodeNativePasswordResponse` to validate its new account, envelope and activity
owner together. Canonical error codes are preserved with a fixed safe message;
untrusted server text cannot echo the submitted password through this entry point.

The caller receives only a promise for the decoded issuance result, never a
password-bearing prepared request or retry object. There is one dispatch per
invocation and no automatic, idempotent or Retry-After replay. A lost or malformed
reply remains uncertain. The mobile session owner must recheck the initiating
generation before storing/adopting the credential, clear the password entry, and
handle any possible orphaned server credential through the canonical auth policy.

## Preserved browser behavior

`lib/platform/social-client.ts` retains the existing `socialRequest` signature
and `SocialClientError` class identity. It keeps `same-origin` credentials,
`no-store`, the existing expected-account header, and the authenticator event.
The deterministic before-change fixture measured one identity read, one command,
then another identity read: three requests. The adapter preserves those two
identity checks rather than trading away account-race protection. Client failures
remain distinct from confirmed server rejection codes for legacy callers.

The private-choice hook is the first stricter consumer. It validates the receipt
through the prepared request and retains the original endpoint, owner and bytes
through a lost reply. It also checks current owner/endpoint before adopting the
result. Its existing current-access, hidden-state, Back-navigation and deferred
confirmation gates remain. An original browser choice may be explicitly recovered
after returning from account A to B and back to A and revalidating access. Browser
cookies do not expose a credential generation; the adapter preserves that existing
owner-based policy. Native credential replacement uses a separate generation and
must reject an old flight or retry until its owner explicitly reconciles it.

## Existing draft controller

The implementation moved from `lib/platform/draft-controller.ts` to the shared
package. The browser file supplies `crypto.randomUUID`, `setTimeout` and
`clearTimeout` while preserving its constructor. The shared class requires those
ID and scheduling functions. The five-second autosave debounce, immutable pending
body, payload whitelist, concealed server snapshot, permission-null handling and
original generation checks are preserved. Draft verification clears pending draft
work when its owner changes; that policy differs intentionally from recoverable
private choices. Each mount owns one controller and calls `dispose()` to cancel
its timer. Browser events remain in the existing provider.

An inherited teardown limitation remains to be fixed before native drafts: a
save already in flight can finish verification and schedule another autosave
after `dispose()` if newer edits exist. The extraction preserves this behavior;
disposal alone is not a native continuation-invalidation boundary. Keep draft
activation gated on a held-save/dispose regression and reviewed lifecycle repair.

This extraction does not activate native draft writes. The controller's logical
legacy paths need a reviewed native transport mapping and equivalent endpoint
contracts before enabling native compose or publish. Existing native auth/read
receipts support the first reading journey; they do not grant draft-write support.
Do not send browser cookies, fake Origin headers or unsupported writes from native.

## Verification and remaining integration

The named-package check compiles request and controller consumers with ES2022 and
no DOM/Node ambient types. Focused tests cover exact retries, credential changes,
concurrent attempts, cancellation, malformed replies, error classification,
bounded Retry-After and injected scheduling. Existing controller, availability,
topic-response, HTTPS workspace and browser privacy/recovery suites provide the
website regression gates. Keep actual results in the task's private receipt.
Use the current composer-shell browser suite; the older draft-controller browser
driver targets the retired details-based composer. Current composer coverage
includes exact retries, conflicts and once-only publication. Account replacement
is covered by controller tests and the Menu privacy browser flow, not by the
current composer browser script. Menu evidence retains every raw browser write
while validating and separating foreground session renewal from preference saves.

Native app integration must consume the tested canonical commit and current API
schemas, connect the credential/lifecycle adapter, and verify the complete native
flow. The canonical decoders and shared client are combined with the explicitly
named preactivation baseline described in `PORTABILITY_CHECKS.md`. This source
integration does not resolve an active dependency-security hold or establish
SDK/device/store acceptance.
