# Private community reporting contract

The first reporting foundation adds canonical intake, private reporter receipts,
scoped review records and a durable per-account report budget. It reuses the
social command receipt service, current account and source policies, church
capabilities, and existing rate-limit storage. It adds no client dependency,
automatic content snapshot or parallel moderation of source records.

This foundation is a partial moderation milestone. Intake defaults off. Real
reviewer appointment, escalation and recovery coverage must be established before
activation. A fictional test grant does not establish operational readiness.
The broader moderator worklist, source hide/remove/restore actions, author
decision notices, appeals integration and other writers' activity budgets remain
separate unfinished work. Existing content access and interaction restrictions
remain enforced by their canonical owners.

## Sources and submitted context

Supported targets are `POST`, `COMMENT`, `PROFILE` and `CHURCH`, each referencing
its exact canonical ID. A post report targets the selected distribution record;
plain repost and quote IDs are not silently converted into Like targets. A form
must identify what the person is reporting and use the target lookup when opened.

New submissions require a current verified adult account and current source
access, including bilateral blocks and church audience rules. Post/comment
versions are checked at submission. Comment context also binds the parent post
version; church representation binds the listing and management versions.
Profile changes reuse the existing presentation version, which the canonical
profile writer increments for basic fields as well as presentation changes.

Reasons are spam, harassment, privacy, safety, impersonation and other. Optional
details are plain text, limited to 2,000 characters. The service stores only the
target identity/versions, original review scope, selected reason and deliberately
submitted details. It never copies source text, images, prayer histories or
unrelated conversations. Details are private case context, not public comments.

Source references have no destructive source foreign-key cascade. An accepted
report and its owner receipt survive withdrawal, deletion and the reporter's
later loss of source access. Receipts contain no fetched source body. No public,
source-author, notification or share response contains reporter identity.
Account export includes only the requesting account's own submitted reports and
safe status; other reports, reviewer identities and private decision notes are
excluded. This milestone introduces no automatic purge or new retention duration;
operational retention/erasure policy must be settled before intake activation.

## Authority and review

Church-authored and church-audience sources use their church's existing
`MODERATE_CHURCH_POSTS` authority, with current eligibility, approved connection,
and active direct or role-derived grant. Merely sharing a personal public post
to a church does not make it church-owned moderation material. Global sources
require the explicit new `REVIEW_COMMUNITY_REPORTS` operator capability. Support,
account-management titles, membership, and claim-review permission confer no
implicit report access. Global report permission does not open private church
case context.

Every reviewer read and action checks current authority. Privileged exact retries
also recheck it before consulting the stored command receipt. Review requires
the original pinned church scope and any current church scope; changing a
source's audience never transfers old private evidence to unrelated reviewers.
The current one-approved-church rule can make a cross-church transition
unreviewable without a future explicitly authorized handoff. This foundation
does not bypass that rule. A withdrawn/deleted source retains the original scope.

Reviewer resolution is limited to `CLOSED` and `FOLLOW_UP_REQUIRED` with a
5–1,000-character reason and expected report version. The audit records actor,
old/new status, reason, resulting version and timestamp. One concurrent decision
wins; a stale decision conflicts. These statuses record review only and do not
hide content, alter audiences, restrict accounts or notify other people. Report
counts never trigger punishment. Broader enforcement must use canonical source
writers and preserve source audiences rather than creating another content copy.

Church impersonation receipts link to the existing representative claim flow
with the existing church ID. A report does not recreate a church, submit a claim,
appoint a representative or grant access. Ordinary bugs and appeals remain with
the existing support owner; this foundation does not claim a new appeal was sent.

## API, retries and limits

`/api/platform/community-reports` uses the existing private social transport:
same-origin POST, current session, expected-account header, bounded body and
private no-store responses. Strict fields prevent supplied owner identities.

- GET `view=target&targetType=...&targetId=...` returns current target versions,
  owner identity and honest intake availability. Fetch on form opening, not on
  every feed card render.
- POST `operation=create` takes `mutationId`, `targetType`, `targetId`,
  `expectedTargetVersion`, `expectedContextVersion`, `reason`, optional `details`.
- GET `view=receipt&id=...` returns an owner-only receipt; `view=mine&after=...`
  returns up to 30 own receipts and an owner-bound next cursor.
- GET `view=review&id=...` returns one authorized case and up to 30 recent
  decision records. It is not a general reviewer worklist.
- POST `operation=resolve` takes `mutationId`, `id`, `expectedVersion`,
  `resolution`, `decisionReason`, and requires current scoped authority.

The existing owner-scoped command fingerprint handles exact retries atomically.
The same key/body replays the original acknowledgement without a fresh report,
decision or activity charge. An altered body with the same key is a 409. A new
key for the same reporter/target/source versions returns the original case,
preserves its original details and consumes no new report quota. A deliberately
changed source version can receive a new report. New-key duplicates still check
current target access; old successful create receipts remain available after
source withdrawal or intake pause without resubmitting.

`COMMUNITY_REPORTS_ENABLED` defaults false. Enabling it also requires a valid
integer `COMMUNITY_REPORTS_PER_10_MINUTES` (1–50, default 5) and an eligible
explicit reviewer for the target scope. Missing coverage or invalid configuration
returns 503 without a report or successful receipt. Owner/reviewer reads remain
available while new intake is paused.

New report activity uses an account-scoped HMAC key in `PlatformAuthLimit` inside
the command transaction, after receipt replay and duplicate checks. The default
is five new reports per ten minutes; accounts sharing an IP do not share this
activity allowance. The existing transport flood limit remains independent.
Quota rejection returns 429 and `Retry-After` seconds; the form must retain its
entries. The existing social operation storage ceiling still bounds new keys.

Future contact-request and message targets must be added through this same
contract with participant eligibility and deliberately selected evidence. A
report must never grant access to the rest of a private conversation. Those
targets and their intake UI are not implemented merely by this foundation.

## Verification and release boundary

The focused service suite covers source versions, all four target kinds, owner
privacy and export, concurrency, quota expiry, exact/changed/duplicate retries,
revoked reviewers, current scope changes, target removal and the existing claim
boundary. The HTTPS suite exercises transport and receipt privacy with both
controlled enabled intake and the production-safe disabled configuration.
See the dated implementation receipt for actual executed results and commit.
Schema application to an isolated fixture is not a production migration or live
feature release. Production migration requires the existing encrypted backup,
restore rehearsal and release verification workflow.
