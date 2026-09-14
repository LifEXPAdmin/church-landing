# Followed conversation integration

14 September 2026 UTC · Candidate; not yet published.

The existing discussion, sheet composer, mentions, pinning, private recovery and
reader controls are retained. Their fresh 16-group browser acceptance is recorded
in CONTINUOUS_SOCIAL_REPORT.md. This feature completes explicit thread-follower
Activity and optional phone delivery using the existing notification owners.

## Implementation

- One canonical comment/recipient Activity intent, shared with direct replies
  and mentions. No copied comment body or implicit person/church subscription.
- A comment-owned, content-free job records the continuation in the same source
  transaction. Twenty candidates per transaction; cursor/recipient intents commit
  together. Shared permission gate, per-job row lock and current source authority.
- Follow and phone-consent start dates plus device creation strictly precede the
  source. Equal millisecond boundaries fail closed. Default, Mute, refollow,
  blocked/ineligible accounts and revoked church/source access are rechecked.
- Separate initially-off conversations phone category, existing exact recovery,
  source-bound devices, generic payloads, quiet hours and current-link opening.
- After-response first page, native continuation queue, secured daily repair and
  aggregate health backlog. Seven-day work expiry, bounded diagnostic cleanup,
  source deletion cascade and recovery quarantine. No new provider, dependency
  or schedule. Migration 52 preserves prior fields, with no historical work.

## Acceptance in progress

Fifteen final comment-notification service groups pass, including independent
consent, delayed follow/device choices, competing workers, expiration, revocation
and church access. The preceding related run passes Activity, batched source,
operational health and actual isolated restore checks; its one lifecycle receipt
assertion was corrected and passes in the final 15-group run. Types and scoped
lint pass. Full migration/build/HTTP/browser, protected production-copy recovery
and exact release/live checks remain required. Physical phone keyboard/gesture, locked-notification display/tap/reply
and account-switch acceptance remain separate from browser emulation.

Do not close broader notification author-bell/domain-adapter tasks or the
discussion's physical acceptance solely from this feature. Prayer integration
is the next independent feature after this cycle is verified and reconciled.

## Final candidate browser and cost evidence

Application source `0ae2b3a7072e5bc9321141fcec9809e345d73d4a` passes 38 isolated
production-browser groups: ten notification settings/integration, eight comments,
three private recovery, five reader and twelve Activity. Page errors and real
provider sends are zero. The real reply HTTP after-response path creates the
follower intent; its Activity link opens the exact reply and Mute removes the
thread from Activity. Simulated browser permission is not physical phone receipt.

The clean Node 24 production build passes with 149 runtime traces, 3,348 entries
and 377 server JavaScript files, excluding private fixtures/environment files.
An earlier preview build in the working checkout used an inherited Node 22 and
exhausted its 6 GiB heap. The same application source built successfully in a clean
checkout using Node 24; no application change or capacity claim follows from that
local helper failure. Types and complete lint pass.

A local 43-follower measurement uses 23 SQL statements for a source comment with
no followers and 24 with followers; both use 16 SELECTs. Processing is separate:
20/20/3 candidates take 268/267/47 SQL statements and 103.67/96.83/16.24 ms with
phone delivery disabled. These are local diagnostics, not hosting capacity or
latency guarantees. The existing 100-client feed target remains unmet.

Compared with the .15-equivalent build using unique route and shared-layout
JavaScript, Home grows 226 raw/81 gzip bytes, discussion 224/81, and profile
226/71. The separate lazy notification-settings chunk grows 253 raw/92 gzip bytes.
There is no added client fetch on card mount or new runtime dependency.

Protected encrypted production-copy upgrade 51→52 passes with original columns
across 93 tables preserved, complete protected replay and plaintext restoration
removed. Production application data is unmodified. Exact deployment, installed
recovery registry, canonical live behavior and private task closure remain pending.
