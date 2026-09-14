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
