# Optional Likes and direct reply email

## Combined integration checkpoint, September 18, 2026 UTC

The tested candidate `3967483` is merged with the verified Church Settings
release. Combined runtime `8468e9f` adds conditional public guidance and product
version `2026.09.18.7`; test-only `9ac185a` adds canonical church removal and
group departure coverage. Eleven focused email tests pass. The two new cases
cancel pending direct-reply and comment-Like email without provider calls and
deny old authenticated links after membership ends. Recipients own comments on
someone else's post, so author access cannot hide a revocation failure.

The combined production build passes copy, types, lint, hydration and runtime
trace checks. Five email browser groups, six existing Settings groups and twelve
Church Settings groups pass against that built application. The 320-pixel email
controls and explanation were visually inspected. An initial local attempt used
a stale generated Prisma client; regeneration resolved the export/type failure.
The first browser attempt had fictional phone delivery disabled; configuring its
fictional keypair allowed the existing permission-denial scenario to run. These
environment failures are retained separately from the passing acceptance.

The encrypted production-copy rehearsal upgrades 99 to 100 migrations, preserves
all original column fingerprints across 144 tables and completes protected
restoration with outbound delivery disabled. This does not change production.
The complete combined regression gate exits successfully: 186 discovered files,
200 executions, 1,209 passes, two expected production-phase skips and zero
failures. Both new membership-loss cases are included. Populated upgrade,
no-backfill checks, fresh migration, restoration, development and production
builds, restart persistence and production HTTPS privacy checks pass. Production
migration, installed recovery registry, exact release and live verification
remain open at this checkpoint.

Actual production configuration has no social-email enable flag; the default is
false. Keep real provider acceptance, a consenting recipient's inbox, authorized
link opening and withdrawal acceptance open before activation. Publishing the
controls does not establish delivery or physical-device acceptance.

The lazily loaded notification component changes from 14,036 to 14,809 raw bytes
and 4,880 to 5,040 independently compressed bytes. The same four Settings/root
route inputs change by 81 raw and 20 compressed bytes. These measured client
costs are separate and do not establish production latency improvement.

## Scope and release boundary

This branch adds separate, initially-off email choices for Likes on personal posts
and comments and direct replies. Disabling Likes email preserves reply email,
Activity and phone choices. Feedback follow-up remains independent, with its
existing source consent. Required account emails are unchanged.

The existing single-intent precedence is preserved: replies that mention the
recipient use Mentions. Mentions, followed-conversation updates, prayer activity,
digests and other categories gain no email channel. The interface explains this
boundary rather than promising email for every comment.

This is an integration candidate, not a production release receipt. Integration,
production migration/configuration and live verification belong to the release
owner. Real provider acceptance, inbox receipt and physical-device experience
remain separate from local engineering evidence.

## Implementation

- Settings use the current owner-bound, versioned and exact-retry command. Legacy
  forms preserve unseen email choices; unconfigured delivery rejects new opt-ins
  while allowing withdrawal. Browser notification permission remains independent.
- Dated per-category consent prevents historical backfill and pending-event
  revival after withdrawal/re-enabling. Unknown and recovered values fail closed.
- The existing outbox/queue and source adapters check current source access,
  recipient eligibility, undo/mute/read state and credentials before delivery.
  The message contains generic text and an authenticated delivery link.
- The existing lease, bounded retries, idempotency, quiet hours and 23-hour email
  expiry apply. Feedback transport and its stable template remain unchanged.
- Protected recovery clears uncertain new consent; private export includes the
  owner's saved choices. No source bodies are stored in the outbox.

## Configuration and migration

Apply `20260918123000_social_notification_email` before serving this branch. It
adds one nullable JSON column and extends the immutable-delivery insert guard to
exact supported reply/Like kind-category pairs. It does not change existing
preferences, opt anyone in or enqueue historical work. The staged upgrade gate
compares existing preferences, events and deliveries before and after migration.
The release owner must refresh installed migration checksums and verify the
protected restore path as required by [Backup operations](BACKUP_OPERATIONS.md).

`SOCIAL_EMAIL_ENABLED=false` is the default. Activation requires the existing
validated account email provider and notification queue. Members must still
choose each category explicitly. The release owner should verify configured
availability, one consenting test recipient's generic email, current authorized
opening and opt-out before recording real delivery acceptance. Disabling the
flag stops pending attempts; the additive migration may remain on rollback.

## Verification

Nine focused service tests cover: opted-out enqueue cost, independent Likes/reply
consent and actual
test-sink output; old-client preservation and no backfill; unavailable provider
and unsupported-category rejection; comment Likes, nested replies and mention
precedence; recovery quarantine; undo/mute/read/account/source/provider
revocation; quiet hours and expiry; stable provider-stub retries and SQL identity
guards. These pass alongside all nine existing feedback-email regressions. No
real email is sent.

Five built HTTPS browser groups pass at 320px and desktop widths: initially-off
and unavailable choices with denied phone permission; keyboard Likes-email
withdrawal preserving replies and Activity after reload; an actual isolated email
intent and test-sink message opening the exact authorized reply; a lost-response
exact retry with one durable receipt; and current-account isolation after
switching, including denial of the previous recipient's email link.
Uncaught browser errors and overlays are zero. External browser requests are blocked.
The preview server deliberately disables email delivery; existing consent is
prepared through the isolated service to verify withdrawal during unavailability.
Enabled delivery is exercised by the service sink/provider stubs and the browser
journey's isolated message preparation.

TypeScript and copy checks pass. Repository lint has zero errors and 35 existing
unused-variable warnings in unrelated browser scripts. An inherited enrollment
mode caused two legacy authenticator tests to fail in the first full run. The
harness now explicitly establishes the default MFA mode and disables social
email before suites opt in; all 14 targeted legacy/new authenticator cases pass.
The final complete `test:support` gate exits successfully from a fresh isolated
cluster: 185 discovered test files, 1,200 reported passes, zero failures and two
expected development-delivery skips in the production phase. Populated upgrade,
no-backfill comparison, backup/restore, fresh migrations, production builds,
development HTTP, verified production HTTPS and server-restart persistence all
pass. The development browser also loads without an uncaught error or overlay.

## Runtime review

This reuses the existing event, owner preferences, source authorization, outbox,
provider and queue. It adds no package, route, background worker, poller, cron or
queue topic. At most one EMAIL row is created per supported event; phone and
feedback retain their existing paths. New source resolution runs only for an
enabled supported kind with dated recipient consent. Existing bounded queue
pages and provider retry limits remain. With email enabled and phone delivery
disabled, the isolated opted-out enqueue measurement records one SELECT for the
saved preference, with no source authority
reads or delivery writes. The first local candidate used 17 SELECTs for that same
fixture. This is not a comparison with the released app or a production latency
claim. Settings also shares one current-eligibility lookup across its available
channels.

## Proposed release note

Choose email separately for Likes and direct replies when email alerts are
available. Both choices start off and apply to new activity. Quiet hours pause
optional email, and you can turn a category off without changing your other
notification choices.
