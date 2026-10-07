# Native Likes and reaction-count preferences

The native v1 routes adapt the existing website services. They do not introduce
a second reaction model or change the browser cookie and Origin boundaries.

| Route                                   | GET                                                         | POST                                                     |
| --------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------- |
| `/api/platform/v1/posts/:postId/like`   | Current Like state, version and visible total               | Desired Like state with mutation ID and expected version |
| `/api/platform/v1/reaction-preferences` | Original account's authored-count choice and recovery state | Versioned authored-count choice with mutation ID         |

Only the Like read admits genuine guests. Authenticated requests use the existing
native bearer and `X-Expected-Account` headers. A supplied invalid session never
falls back to a guest. Origin, browser Fetch Metadata, account cookies, unknown
query fields and unsupported methods are rejected. Input uses the strict existing
v1 schemas and a 16 KiB maximum; errors and responses retain private/no-store
headers. Protocol confirmation and feature pauses follow
[the compatibility policy](NATIVE_API_COMPATIBILITY.md).

## One authoritative service

`readPostLike` accepts an optional strict identity checked within `withPostRead`.
`postLikeCommand` checks an optional expected owner at the start of its existing
receipt callback, inside the canonical account and permission lock. Browser
callers retain their current behavior. Native preflight verifies the session
before consuming the body or charging the same website rate bucket; the service
checks it again before mutation or receipt replay. Preference services already
enforce their original account inside their own lock and remain unchanged.

Native and browser requests use the same `post-likes` and
`reaction-count-preferences` rate namespaces. The native route schedules the
same durable notification drain after a successful Like command. Canonical
activity and outbox identities deduplicate the logical notification. First-Like
time, group/topic participation, current audience and bilateral block checks
remain owned by the existing services.

Plain repost interactions return the original post ID; quoted commentary keeps
its own identity. The requested path's post ID remains in the mutation
fingerprint. Retrying a different path is different work, even if both resolve
to the same original. Hidden reaction totals remain `null`, while own Like
state/version remains available. Church-authored speech retains its existing
count policy. Browser-local viewer display choices are separate from the
account's authored-count preference.

## Retry, recovery and client responsibilities

Keep the original account, mutation ID, expected version, path and exact input
after an uncertain response. Exact retries return the historical receipt without
reapplying the change. A delayed Like receipt does not reverse a newer Unlike,
and it does not establish current readability. Current group/topic replay checks
still apply. Refresh the authorized state after reconciling a receipt.

Preference protection can fail after the database commit. That response is
`unconfirmed` (503, reconcile), distinct from a pre-admission feature pause.
Retry through the complete canonical preference service so its recovery journal
can finish. Never substitute a fresh key or bypass the recovery step by returning
a stored operation directly. Recovery quarantine projects hidden totals and
`recoveryRequired: true` until the current account reviews its choice.

Capabilities advertise `likes.read`, `likes.write`, `reactionPreferences.read`
and `reactionPreferences.write`. Each can be independently paused before database,
body or rate-limit access. Invalid pause configuration closes optional admission.
An already admitted request can complete; rollback preserves rows and immutable
receipts. Native interfaces still need their own draft, lifecycle, transport and
physical-device acceptance. Post cards conservatively retain `requiresWeb` until
their full native journey is supported.

## Verification status

Application and tested source `1f389eacd37b9d7d6383b521d47fd05df4e05494`,
production build `b4-E-7SgzHK03pGzLuIMe`: 31 policy/service checks and 12 actual
local HTTPS checks pass with all 125 migrations in an isolated fictional database.
Full types, lint (zero errors and 39 existing warnings), source/copy checks,
production build, hydration, runtime traces and public-build security pass.
The three owned ports are closed and the fixture database is stopped.

The current checks exercise concurrent and historical receipts, original-account
binding before new writes and replay, plain-repost identity, private/withdrawn
sources, hidden totals, recovery uncertainty and exact recovery retry, quarantine
projection, strict transport, shared rate buckets and pause/rollback without
side effects. Existing group, topic, concurrency, reaction-count and browser
session regressions pass. HTTPS confirms web/native service parity and one
durable notification intent; it does not establish provider delivery.

No browser UI, hosted CI, combined package integration, device/provider,
production migration or live acceptance is claimed. The unchanged API decoder
bytes match the canonical shared-core handoff; combined package import
integration remains a release step. There are no schema or dependency changes.
Existing security and designated release-owner gates remain open.
