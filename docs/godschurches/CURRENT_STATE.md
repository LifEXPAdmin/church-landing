## Adult message service verified locally — 12 September 2026

Persistent text, bounded history/inbox reads, exact receipts, monotonic personal
read positions and mute/archive/hidden-prefix choices now use the existing
accepted two-person membership. Sixteen message groups, 32 shared regression
checks and 18 contact/message HTTPS groups pass; types/lint/build and runtime
import/tracing checks pass. See [the service receipt](ADULT_MESSAGES_REPORT.md).
Both messaging migrations remain isolated-only. Next is profile resume and the
inbox/history UI with scoped durable activity and reconnect integration. Live
production remains the reporting version below; owner and parent gates remain.

## Adult contact request interface verified locally — 12 September 2026

Received/sent requests, persisted recipient decisions and contact preferences
now use the verified service. Eight enabled contact, five paused contact and
eight report browser groups pass, including exact retries, account replacement,
block/report, stale choices and failed reads. Types/lint/build and 22 navigation/
settings checks pass. See [the local receipt](ADULT_CONTACT_REPORT.md).
Production remains the reporting release below. Next is the prioritized
persistent-conversation service and its profile/inbox integration; no contact
migration, activation, parent acceptance or new phone test is claimed yet.

## Adult contact service verified locally — 12 September 2026

The focused contact, conversation-membership and preference contracts are
recorded in [the adult contact contract](ADULT_CONTACT_CONTRACT.md). The first
service milestone passes 47 focused tests and eight HTTPS groups, plus
types/lint/build. It preserves the existing relationship, account, report and
retry owners; its migration is isolated-only. See
[the service receipt](ADULT_CONTACT_REPORT.md). Request/preference UI,
conversation messages, in-app indicators and release verification are next.
Production remains the reporting release below; real operations and parent/
owner acceptance remain open.

## Private report forms and receipts verified live — 12 September 2026

Product `2026.09.12.24`, application `e710170d653672b885b491c8c523b9d54c6f51f8`,
is READY in `dpl_9QusbmKcg7v8ERjbYeLpsZjJSmKp`; the independent canonical alias
and serving endpoint match. Contextual forms, exact retries and private receipts
are published. New intake stays disabled pending actual reviewer operations and
retention/erasure policy; no report, decision or reviewer grant was created.

The complete gate passes 86 discovered test files: 543 passes, zero failures and
two production-phase delivery skips. Eighteen final built-browser groups and six
live read-only groups pass. The encrypted-backup rehearsal and actual additive
migration preserve original-column fingerprints across all 75 existing tables;
production has 33 checksum-matching migrations. Live application write requests,
browser errors and scoped runtime error/fatal rows are zero. See
[the reporting receipt](COMMUNITY_REPORTING_REPORT.md) and
[its contract](COMMUNITY_REPORTING_CONTRACT.md). Next is the prioritized adult
contact-request contract. Broader moderation and parent/owner acceptance remain
open, with prior physical-phone observations preserved.

## Social reliability and runtime repairs verified live — 12 September 2026

Product `2026.09.12.23`, application `4a11762af55439f6e3964366eab99a57b12eaae8`,
is READY in `dpl_C2Z5hciXqzkcQQ3q6Jgq1NSmAarb`; the independent canonical alias
and serving endpoint match. Likes now use explicit state, versions and exact
retries. Retired native mutations are removed, photo-discard navigation settles
before confirmation, and protected reads/visible avatars avoid unnecessary work.
Closed-discussion copy, CSV escaping, dependency remediation and import ownership
are repaired. See [the complete repair evidence](AUDIT_REPAIR_REPORT.md).

The full gate passes all 84 discovered test files: 528 passes, zero failures and
two development-only delivery checks skipped in the production phase. Ten
existing browser scripts, four Like scenarios, two final release-detail groups
and six live read-only groups pass. The migration preserves original columns
across 75 tables and brings production to 32 matching migrations. Live application
writes, browser errors and scoped runtime error/fatal rows are zero. Measured
Home requests fell 95→8 in the same fixture; combined initial Home JavaScript is
4,073 gzipped bytes smaller. These local measurements are not a production
latency claim.

Next is the scoped reporting, evidence and abuse-limit foundation for contact
requests and messaging. Portal/support read-side reconciliation remains a
scalability limit. Real reviewer/provider, church-management, phone acceptance
and parent integration gates remain open; historical phone observations are
preserved separately from automated verification.

## Attributed reposts and quotes verified live — 12 September 2026

Product `2026.09.12.22`, application `6859cb075006f05c59680c0e582621bb9102742e`, is READY in `dpl_C9ZRqD7Lu2uzbxMiTGY9uKBhzwNG` and independently assigned to Godschurches.com. Plain Repost/Undo and quotes use current source permission and existing draft/reply recovery. See [the complete release evidence](REPOST_REPORT.md) and [contract](REPOST_CONTRACT.md). Fifty-four focused tests, twenty distinct built-browser groups (including five referral integration groups) and five live read-only groups pass. Live checks observed zero writes/page errors/runtime error rows. One additive migration brought production to thirty-one matching migrations while preserving original columns across all 75 existing tables.

The next coding prerequisite is the scoped reporting/evidence/abuse-limit foundation for contact requests and messaging. Real reviewer appointment and operational coverage remain explicit gates. Physical-phone referral/share acceptance, the unreproduced hydration issue and legitimate church-management owner actions remain open; automated checks do not replace prior reported device results.

## Attributed repost release candidate — 12 September 2026

The repost/quote service checkpoint and focused UI are locally verified. See [the repost contract](REPOST_CONTRACT.md) and [verification report](REPOST_REPORT.md). Private quote drafts retain original source references and reply permissions; author opt-in, current church publishing rights, source revocation and exact retries are enforced. Candidate product 2026.09.12.22 has 54 passing focused tests, fifteen built browser groups and a passing production-backup migration rehearsal. Production still serves 2026.09.12.21 until the subsequent live receipt confirms the migration, READY deployment and canonical identity. Parent referral/device acceptance and independent access/moderation owners remain open.

# Godschurches current state

## Shared post and reply editor — September 12, 2026

Product `2026.09.12.21`, application `4c515835cc54c4bafef9a8f083e27d556f64c6a5`,
is live on READY deployment `dpl_E3KFyqpXTGLTkbDU73WRMgRRC2oA`; independent
canonical assignment and serving identity match. Posts and replies share a
responsive Close/Save draft/Post-or-Reply frame, compact optional tools,
exact-request recovery and explicit close choices. Saved drafts, reply permissions,
photo sources and publication access checks retain their authority. Twenty browser
groups, 26 controller/release tests, 12 workspace service tests, scoped
lint/types/build and a fresh backup/restore pass. Six live read-only checks pass
with zero application writes, browser errors or runtime error rows. See
[Shared composer evidence](SHARED_COMPOSER_REPORT.md). Parent and physical
acceptance remain open.

## Compact social controls — September 12, 2026

Product `2026.09.12.20`, application `8b8219bb30f5301c1ee092e11a698133acc21927`,
is live on READY deployment `dpl_8m5GJ3kzzou2Hj5EmRoLvgG8W9eb`; independent
canonical assignment and serving identity match. Post/comment More menus reuse
existing handlers; the compact action row links to private Bookmarks and external
Share. Repost, quotes and contextual reporting remain with their owning contracts.
Nineteen browser groups, 14 focused tests, scoped lint/types/build and eight live
read-only checks pass with zero application writes or browser errors. See
[Compact action evidence](COMPACT_SOCIAL_ACTIONS_REPORT.md). Parent and physical
acceptance remain open.

## Mission and Home return — September 12, 2026

Product `2026.09.12.19`, application `b82424fb37d22352ff4951e5e9f2e4cbbed4424d`,
is live on READY deployment `dpl_FtKKJjzqj2ug5iiKL229LHacBB2z`; canonical
assignment and serving identity match. Visitor Home, About, manifesto, existing
registration acknowledgement and shared footer carry the approved mission.
An initial feed-history write now preserves Back restoration. Four browser groups,
14 focused tests, types/lint/build and nine read-only live checks pass with zero
application writes or browser errors. See [Mission evidence](MISSION_PRESENTATION_REPORT.md).
The separate historical hydration warning and parent/physical acceptance stay open.

## Searchable help and current product information — September 12, 2026

Product `2026.09.12.18`, application `a77bf8caa5a7bce048f8c9f7071426fd5bdf37d3`,
is live on READY deployment `dpl_wQUitNXMH8rYJQC9vc9tB7jggZpE`; independent
canonical assignment and serving identity match. Help and About adds searchable
explanations of current settings and reuses the existing Help/contact, private
request, policy, loaded-version, release-note and feature destinations.

Ten focused tests, four Help browser groups, types, scoped lint and production
build pass. Fifteen live checks at 15:12:19 UTC passed with zero application writes
or browser errors. All 30 migration checksums and the protected backup/restore
are verified; no migration/provider change. See [Help evidence](HELP_SETTINGS_REPORT.md).

Expanded private feedback/attachments, public roadmap/suggestion credit and
parent/physical owner acceptance remain gated. The next P1 Extra High
investigation is the previously observed intermittent navigation hydration error;
the older unexplained observation is not closed by these clean browser checks.

## Data, browser permissions and lifecycle guidance — September 12, 2026

Product `2026.09.12.17`, application `4113c7ef7fbe6bf4af82fc4276a924d5da1c031b`,
is live on READY deployment `dpl_CPR6eNoprjMMJTSQNMgZJdbKTbrf`; independent
canonical assignment and serving identity match. Data shows browser-reported
permissions without requesting access, current export scope and separate
deactivation guidance. Existing confirmation, owner projection, retention,
source audiences, private draft reply permissions and duty gates remain intact.

Six export, nine lifecycle and three focused resource groups pass, along with
eight contract/release tests, five Data and six Settings browser groups, types,
scoped lint and production build. Fourteen live checks at 15:04:24 UTC passed with
zero application writes or browser errors. All 30 migration checksums and the
protected backup/restore are verified; no migration/provider change. See
[Data evidence](DATA_SETTINGS_REPORT.md).

Optional consent, general connected-app access, permanent deletion and new
resource transfer/lifecycle integration retain their separate gates. Next is
focused Help and policy navigation. Parent and physical owner acceptance remain
open.

## Safety choices and private relationship search — September 12, 2026

Product `2026.09.12.16`, application `a5eac27559abc655658d07f8f0d598038d99c09c`,
is live on READY deployment `dpl_96vxCDgVJLwiEyZtm1587X1WzKH6`; independent
canonical assignment and serving identity match. Safety explains current choices;
blocked/muted lists support private name/username search before pagination and
neutral unavailable-account labels. Unblocking requires confirmation and preserves
existing command, version and exact retry behavior without restoring connections.

Four search and ten social service groups, twenty-two navigation/Settings/release
tests, five Safety and four relationship browser groups, types, scoped lint and
production build pass. Thirteen live checks at 14:48:22 UTC passed with zero
application writes or browser errors. All 30 migration checksums and the protected
backup/restore are verified; no migration/provider change. See
[Safety evidence and recovery limitation](SAFETY_SETTINGS_REPORT.md).

Contextual reporting and report history remain gated by their moderation
authority. Next is the focused Data folder and export/lifecycle presentation.
Parent integration and physical owner acceptance remain open.

## Display preview before Save — September 12, 2026

Product `2026.09.12.15`, application `77f8b40cf629572f99f27ee1114aa383a22dec0b`,
is live on READY deployment `dpl_Fm8mii86UtYsojZUvQfsSsHHR22c`; independent
canonical assignment and serving identity match. Display previews theme, text and
List/Pages before saving through the original browser cookie. Exact retry,
confirmed discard/reset, native Back and safe-update protection remain intact.
Device appearance and reduced motion work independently of profile presentation.

Six new Display, six Settings and five photo-recovery browser groups passed,
with twenty contract/navigation/release tests, types, lint (zero errors) and
production build. Twelve live checks at 14:15:20 UTC passed with zero application
writes, browser errors or runtime error rows. All 30 migration checksums and the
protected backup/restore were verified; no migration/provider change. See
[Display evidence](DISPLAY_SETTINGS_REPORT.md).

Feed and notification capability maps document their actual service gates; no
unsupported preference was enabled. Next is the focused language/location audit
and supported Safety controls. Parent and owner/device acceptance remain open.


## Current Privacy choices — September 12, 2026

Product `2026.09.12.14`, application `2bc0948c1b69c121918518b9dfb7978171199ff7`,
is live on READY deployment `dpl_EyXgyxvCHUupWfYafQh594yT1EHM`; independent
canonical assignment and serving identity match. Privacy summarizes actual saved
mention permissions and follower/following count visibility. Current People
search uses names/usernames; profile, directory and post audiences remain
separate. Failed reads conceal stale values and unknown values never imply a
permissive default.

Five private-context and ten social service groups, twenty Settings/navigation/
release groups, five Privacy and six Settings browser groups pass. Types, scoped
lint and production build pass. Eleven live checks at 13:40:30 UTC passed with
zero application writes, browser errors or scoped runtime error rows. Fresh
backup/restore and all 30 migration checksums remain verified. No schema or
provider change. See [Privacy contract and evidence](PRIVACY_SETTINGS_REPORT.md).

Search opt-out/QR-only accounts, future-post defaults/activity controls and family
management remain gated by their absent authorities. The next focused audits
cover feed/notification capability maps and existing display controls. Parent and
owner/device acceptance remain open.

## Profile Settings and save continuity — September 12, 2026

Product `2026.09.12.13`, application `13344d9e865e37e74dac2f2f724b5e6921f72160`,
is live on READY deployment `dpl_2R8cQiAh2WCBgtXemEeqvt4qaLXE`; canonical
assignment and serving identity match. The existing profile editor groups
identity and optional introduction/contact guidance, with direct Settings and
directory links. Confirmed saves release their Back guard before redirecting;
unsaved text/photos retain normal navigation protection and exact upload retry.

Five profile service groups, eighteen directory groups across appropriate
fixtures, two HTTPS groups, thirteen Settings/style/release groups and ten built
profile/photo-recovery browser groups passed. Types, scoped lint and build pass.
Eleven live checks at 13:22:46 UTC passed with zero application writes, browser
errors or scoped runtime error rows. Backup/restore and all 30 migration
checksums were verified; no schema, provider or production identity change.
See [profile verification and fixture limits](PROFILE_SETTINGS_REPORT.md).

Next is the focused adult Privacy overview. Street-address/age-policy disclosure,
username rename and unsupported security/discovery/default-preference services
retain their own gates. Parent and owner/device acceptance remain open.

## Method-aware Security — September 12, 2026

Product `2026.09.12.12`, application `246e6f758656bbdb9acceb85613dacaa62006e14`,
is live on READY deployment `dpl_F7rEWec2e8XZFoaFJBT1aNQ8dLdW`; canonical
assignment and serving identity match. Security reflects actual sign-in methods
and recovery availability. Existing Google confirmation returns to the intended
Settings detail and retains its purpose, expiry and one-use protections.

Thirty-four isolated context/Google groups, seven Security browser groups, five
Account browser regressions and twenty Settings/navigation/release groups pass.
Types, scoped lint and production build pass. Ten live checks at 13:00:32 UTC
pass with zero application writes, browser errors or scoped runtime error rows.
Backup/restore and all 30 migration checksums remain verified; no schema or
provider change. See [Security verification](SECURITY_SETTINGS_REPORT.md).

Next is the focused Profile/contact Settings audit. Username rename, configurable
security alerts, MFA and passkeys retain their separate capability gates. Church
appointments and parent/global/owner/device acceptance remain open.

## Account Settings — September 12, 2026

Product `2026.09.12.11`, application `1d085e68273de74354607fa4a60b34c10018cec1`,
is live on READY deployment `dpl_7mnPaWncWJK5YGaar5jB1XKoy47A`; canonical assignment
and serving identity match. Account shows masked contact and verified status;
session sign-out refreshes confirmed state and separates an uncertain command
from a failed list read. Folder links reuse existing identity/security services.

Fourteen service/HTTPS groups, one disabled-email HTTP group, two release groups
and five built browser groups passed. Types/build/scoped lint pass. Nine live
checks at 12:41:56 UTC passed with zero application writes/browser errors/runtime
errors. Current backup/restore and all 30 migration checksums are verified; no
schema/provider/production identity change. See [account integration](ACCOUNT_SETTINGS_REPORT.md).

Account username changes still need an authoritative rename contract. The next
independent increment is method-aware Security and confirmation/recovery return
navigation. Parent/global and owner/device acceptance remain open.

## Searchable Settings — September 12, 2026

Product `2026.09.12.10`, application `59c520bcc0904718a38182334edf48fc689194df`,
is live from READY deployment `dpl_6SFfSMrdA4GuX9YJLszaBTjGCSEd`, with independent
canonical and serving identity verification. Grouped folders, approved synonym
search and detail routes reuse existing account, privacy, directory, reading and
church controls. Back retains query/scroll; retries, conflict review, discard and
display-only reset preserve confirmed and unsaved choices. Current access refresh
conceals stale controls and retains edits through a transient read failure.

Six isolated browser groups, three private-context groups, 13 focused unit groups
and 23 draft/navigation regressions passed. Types/build passed; lint has no errors
and 37 existing fixture-helper warnings. Fresh encrypted backup/restore preserved
75 tables and 30 migration checksums; no migration or production data change.
Nine live checks at 12:25:51 UTC passed with zero application writes or browser
errors, and no scoped runtime errors. See [Settings report](SETTINGS_REPORT.md).

The next focused increment audits existing account/session controls in these
folders and implements only missing presentation/navigation. Church appointments,
owner/device acceptance and parent integration remain open.

## Community next steps — September 12, 2026

Product `2026.09.12.9`, application `f4fdc30ab73c15a2079d768a87a5a55422ce2dd6`,
is live from READY deployment `dpl_91PJ2T1iG6RfwfZFDVL4mxG43ArM`; its canonical
assignment and serving identity match. Poll setup links from the composer after
publication, preserving the private reply-permission contract. Results, local
event times, RSVP links and volunteer capacity/actions are clearer on phones.
Church welcome panels reuse current optional profile, follow, connection and
member-team state. Church-specific content and appointments still require the
legitimate claim/review/activation workflow.

Six participation service groups, three actual HTTPS groups, eleven draft checks,
three church access/welcome groups, two release checks and ten participation/
welcome/phone browser groups passed. Types/lint/build passed (lint retains unused
fixture-helper warnings, no errors). The final build verified 119 runtime traces,
9,995 entries and 295 server JavaScript files. Narrow church action spacing was
repaired and checked with doubled text at 320/390/1024px, reduced motion and
photo-viewer keyboard/Back navigation. iPhone Safari emulation verifies Menu
installation guidance; physical-device reports are distinct from these checks.

Twelve live checks at 08:48 UTC passed with zero application mutation requests,
browser errors or runtime error rows. The downloaded QR independently decodes to
the canonical public entry. Production remains on 30 matching migrations; none
were needed for this increment. The current encrypted backup and prior restore
proof remain available. Earlier photo migrations created two derived associations
and no user-content rows; no real account, content, role or event was created.
The daily cleanup ran successfully at 07:35 UTC with zero due objects removed.

All independent work in the selected overnight packet is complete. Prepared
church content, actual representative/reviewer appointment and owner/device
acceptance remain open. No external notification or form submission was sent.
Isolated preview/database processes are stopped. See the [participation report](POST_PARTICIPATION_REPORT.md),
[photo contract](PERSONAL_PHOTO_LIBRARY_CONTRACT.md) and [maintenance evidence](MEDIA_MAINTENANCE.md).

## Named album release — September 12, 2026

Product `2026.09.12.8`, application `1b07696de1aa858940032fe2a4968e4a3a1e2375`,
is live from READY deployment `dpl_AHwoMEdjSS6pr2wRAP1RoUukjXZU` on the verified
canonical domain. Named albums organize owned photos without copying uploads.
Album and source audiences both apply; current access gates covers, counts,
pages and enlarged images. Removal/deletion keeps photos; retirement cannot
break existing album references. Exact retries and deliberate conflict review
preserve editing work across connection failures and navigation.

Five album, nine core photo, seven media and two release test groups passed.
Eight album/pagination/disabled/personal browser groups, types/lint/build and
119 runtime traces passed. The encrypted backup/restore and additive 29-to-30
migration preserved original columns in 73 tables; production added no content
or derived rows. Compatible deployment, drained requests and zero active uploads
preceded activation. Ten live checks at 08:17 UTC passed with no application
writes or browser errors. Physical-device and owner acceptance remain separate.
See the [photo contract](PERSONAL_PHOTO_LIBRARY_CONTRACT.md).

The first scheduled image cleanup was also observed at 07:35 UTC: HTTP 200,
zero objects due for removal. See [maintenance evidence](MEDIA_MAINTENANCE.md).

## Church tools and identity — September 12, 2026

Product `2026.09.12.7`, application `71ee8ced5f5633577d6d74be3920d9c9d243170a`,
serves from READY deployment `dpl_AY9dWXNNoZmWLjisUkGedbUwUQqk` on the verified
canonical domain. Current-capability links reuse profile, organization, roles,
privileges and history; contributors see their own claim status without appointment.
Church image managers can crop, replace and remove logos/covers through existing
media services. Public/unlisted visibility, revoked access and provider gates hold.

Two church and seven media service groups, seven church/disabled/personal browser
groups, two release checks, types/lint/build and 118 runtime traces pass. Eight live
checks at 07:28 UTC passed with no application writes or browser errors. Production
remains on 29 migrations, with no content or authorization changes. See the
[media contract](MEDIA_SHARING_CONTRACT.md). Actual church representative approval,
content activation and physical/owner acceptance remain separate. Named albums and
focused participation improvements continue after this verified milestone.

## Personal photo library — September 12, 2026

Product `2026.09.12.6`, application `42f62219c3d9c1faabc35fcd9c70ea99c4786353`,
is live in READY deployment `dpl_GV1ZG2UaUysw4eaneJhgfZuQRcaW`; the canonical
assignment and serving release match. Profile Photos now provides bounded pages,
retained profile/cover history, explicit direct uploads and shared-composer reuse.
Personal post photos retain their source audience. Gallery upload/order/caption
controls preserve per-file progress, exact retries, conflicts and navigation work.
Reduced photo data uses smaller previews and deliberate large-image loading.

Fifteen core/return browser groups, focused processed-image/controller/privacy
regressions, reading/release checks, types/lint and production builds pass. The
fresh encrypted backup/restore and additive 28-to-29 migration preserved original
column data in 71 tables; production created two derived photo associations with
zero user-content writes. Compatible deployment and a drained handover preceded
retention activation. Fifteen final live checks at 06:58 UTC passed with zero
application writes, browser errors or runtime error rows. See the
[photo ownership and release contract](PERSONAL_PHOTO_LIBRARY_CONTRACT.md).

The preceding photo viewer, already-friends QR state and visible iPhone installation
help remain live. Physical device reports remain distinct from automated browser
checks. Church management readiness, permitted church image controls, named albums
and the remaining focused enhancements continue independently. Parent integration
and owner acceptance remain open; legitimate church appointments are unchanged.

## Profile photo activation — September 12, 2026

Product `2026.09.12.4`, application `225bf5bf5ddf299c2d68606e174b6db7701dfdfd`,
is live on the canonical domain in READY deployment
`dpl_4ixDABUdx8igK36ae7Dzrbn9qpeE`. Public photo uploads use the existing private
store after verified deployed cleanup. The existing personal editor and permitted
profile/post/comment avatars remain unchanged; the guide reflects the live upload
switch and retained notes describe the release. Personal invitations from the
preceding release remain available through Menu → My QR code.

Twenty-five media/maintenance checks, ten sharing/photo browser groups, enabled
and disabled guide rendering, two release-content tests, lint/types/build and
runtime tracing passed. At 03:48 UTC, ten live read/browser checks passed with
zero application mutation requests, browser errors or runtime error rows. The
deployed worker's separate provider acceptance created/deleted four tiny private
objects and one maintenance record, leaving no probe data or changed user/profile
records. Its daily schedule is registered; the first scheduled run has not yet
occurred. Production remains on 28 matching migrations; photos needed no schema
change. See [maintenance and activation evidence](MEDIA_MAINTENANCE.md).

Approved demo church identity/content and the physical/owner rehearsal remain
open. Broader parent acceptance and external object backup remain separate.
Local fixture services are stopped at this checkpoint. No delivery test message
or owner notification was sent.

## Personal invitation release — September 12, 2026

Application `4fb52ed12e8eab94b786fdf572fce3da0ffa9434`, product `2026.09.12.3`,
is live in READY deployment `dpl_fYMmbx1ueDJAa7mjW1JpJswVEoq1` on the canonical
domain. Menu now opens personal QR sharing. New members knowingly accept an
invitation during signup; verified eligible accounts connect through both
canonical follow edges. Removal, blocks and lifecycle changes prevent stale
callbacks from restoring the friendship. No additional private or church access
is granted. [The focused report](FRIEND_INVITATIONS_REPORT.md) records service,
HTTPS, browser, QR, release and backup/upgrade evidence. Fourteen live checks
passed without application writes or errors. Production has 28 complete matching
migrations; the additive migration preserved original data in all 69 old tables.

The next P1 engineering slice connects the existing bounded photo cleanup worker
and verifies it before enabling uploads. Private storage already exists. Approved
demo church content, physical/device rehearsal and parent/owner acceptance remain
open; earlier live receipts below remain historical checkpoints.

## Current continuous interface session — September 12, 2026

Latest verified application: `a1c4f02a8a27b02f81c8c13d6398d88041db1e20`, READY
deployment `dpl_EdARDtV4wChaxBRSLgKrbsRPbk2b`, canonical godschurches.com,
product version `2026.09.12.1`. The 02:24 UTC receipt includes nine read-only demo
checks and visual review of the corrected 320px layout, zero writes/browser
errors/runtime error rows. The feature release `5b892ad` also passed 33 live
checks. All 27 migration checksums match; none were applied.

This continuous session completed installation help, comment/recovery/reader
interfaces, relationship/privacy/library controls, Saved collections, typed
search/filters/history, public Copy/Share/QR, the website QR/signup flow, app
versions, retained notes, safe What's new, the feature guide and release-content
maintenance. The church overview now reuses current-access upcoming events.

Photo editor/post/comment avatars are verified in isolation. Private Blob
connectivity passed, but public uploads remain disabled until the required
cleanup worker is deployed. The approved demo church record/content was not
found in public search. These operational/content prerequisites, the physical
rehearsal, parent integration and owner acceptance remain open. The next focused
engineering task is the existing image-maintenance gate at High reasoning;
owner-supplied church content can proceed independently. See
[continuous evidence](CONTINUOUS_SOCIAL_REPORT.md).
Earlier sections below describe historical release checkpoints.

## Installation and comment interface release — September 12, 2026

Application `2eabdecf2d205f1bfc4bb7c40be4f3d1a37540b8` is live in READY deployment
`dpl_7XPNvsK174YQ4sN71CC1zUNUrgFX`, assigned to godschurches.com. Menu installation
help, threaded comments, reliable private comment drafts/recovery, mentions,
individual links, conversation preferences and shared reader/event discussion
are verified. At 00:32 UTC, 28 read-only live checks passed with zero writes,
browser errors or deployment error-log entries. All 27 migration checksums match.
Twenty local installation/comment browser groups, 27 controller/navigation checks,
26 service checks, upgrade/dump-restore, lint and production build passed.
See [the continuous social report](CONTINUOUS_SOCIAL_REPORT.md). Parent/source,
physical-device and owner acceptance remain open. Continuous work proceeds to
ready relationship controls; subsequent local changes are not part of this release.


## Shared draft composer, resume and safe updates — September 11, 2026

Application `4951b9fefec0064a7e92bbb2c0cf0975ac467281` is published in READY
deployment `dpl_CTjS9VAETdBh5TCUMZyJV32i2zPB`; canonical-domain and release
identity checks match. The composer now autosaves private snapshots, retries
exact requests, handles conflicts deliberately and resumes saved drafts with
permissions and versions intact. The update notice preserves unresolved work
and offers only explicit clean refresh, with connection recovery in the open tab.

Fresh verification: 24 service checks, ten controller/policy tests, ten HTTPS/export
checks, twenty browser groups, lint/types/build/runtime traces and populated
upgrade/dump-restore passed. All 24 read-only live checks passed at 23:17 UTC;
zero production mutation requests or migrations. All 27 migration checksums match.
No service worker, private offline storage or push behavior was added.
See [the batch report](DRAFT_COMPOSER_UPDATE_REPORT.md). Parent integration,
rich draft types, physical-device and owner acceptance remain open. The next
recommended interface slice is installation help at the Medium reasoning route.

## Private draft reply permission repair — September 11, 2026

The existing private-draft service now preserves both reply modes and blocks
publication of legacy snapshots until the author explicitly saves a choice.
Original request fingerprints, versions, atomic publish-once and current church
access checks remain intact. No schema/provider changes are needed.

Fresh local verification: 24 workspace/post/search checks, ten HTTPS/export checks,
ten draft-library browser groups, TypeScript/lint/build/runtime tracing, isolated
upgrade and dump/restore all passed. Production inspection found 27 matching
migrations and none pending; no application writes or migration occurred.
Application `b58d4004f2c0a5f74962016d32d2bc4f0c446c2f` is live through READY
deployment `dpl_3cDcS8DoiaiJVMagfuvQ4xGooc1o`; canonical assignment and release
SHA match. All 21 live read-only checks passed at 22:40 UTC, with zero mutation
requests and no deployment error-log entries. See [the focused report](DRAFT_REPLY_PERMISSIONS_REPORT.md)
and [contract](POST_WORKSPACE_CONTRACT.md). The autosave controller's prerequisite
is satisfied; its implementation, resume integration and parent/owner acceptance
remain open.

## Private draft library and manifest — September 11, 2026

The Medium batch adds a signed-in private draft library/discard interface and
wires the approved web app manifest. Application `a230b36104507f6918217fc753218c7924b440a0`
is live in READY deployment `dpl_EfZ2CynF7cxXmr9jZmyB8uUZmZ9z`; canonical domain
and release SHA match. Local build/lint/runtime, 22 service/policy checks, eight
workspace/export checks and ten browser groups passed. All 17 existing live API
checks and ten new draft/manifest checks passed with no browser errors or
application mutation requests. The deployment error scan was empty. All 27
production migrations match with none pending; no migration was applied.

See [Draft library and manifest report](DRAFT_LIBRARY_MANIFEST_REPORT.md).
Autosave/resume now waits for an explicit Extra High reply-permission snapshot
contract repair. Continue independent Medium saved/collection/search/comment work;
installation help is now ready after live manifest verification. No schema or
provider changes are needed. Physical and parent integration gates remain open.

## Social foundations published — September 11, 2026

Application `2e58ac913227efa22e8dcb0a0e9445668465d0d0` is live through READY
production deployment `dpl_5qHAUY1rJqstXfy493WcPrNWcLni`; canonical-domain
assignment and the live release SHA match. It includes the earlier private
workspace/search/install foundation and new relationship/privacy, threaded
conversation, gallery-control and permission-safe sharing foundations.

Fresh acceptance: 406 full-suite passes with two expected skips; 26 final focused
service checks, two final local HTTPS checks, ten local browser groups; all 34
live HTTP checks and seven live browser groups passed. The new deployment error
scan was empty. All 27 production migrations match their checksums; one additive
migration was applied in this release and original-column fingerprints remained
unchanged across all 60 existing tables. No application row writes were made by
the migration or live verification. Uploads remain provider-inactive.

See [Social foundations release](SOCIAL_FOUNDATIONS_REPORT.md) for implementation,
backup/build/live evidence and retained limits. The private Medium queue contains
17 immediately executable P2 slices and 10 follow-ons with Medium dependencies.
Start with draft save/recovery and comment thread/composer work, then continue
through their linked interface tasks. Broader integration, provider and physical
acceptance remain open. The intermittent hydration issue was not reproduced and
is not claimed fixed. Report-only publication identity is kept in the private
handoff. Earlier local-only statuses below are historical checkpoints superseded
by this production receipt.

## Private workspace and installation foundations — September 11, 2026

A new foundation batch is implemented on `codex/foundation-unlocks`, based on
published application `46c6567`. It is not deployed and the new migration has not
been applied to production. The prior section remains the latest production
receipt; this batch reports isolated local checks only.

- Private versioned draft snapshots, stale-tab conflicts, exact retries,
  discard tombstones and atomic publish-once behavior now have session-owned APIs.
- Private saved collections/items enforce ownership in both services and database
  keys. Reads recheck current source access and redact unavailable sources.
- Community search supplies bounded, permission-filtered posts, author labels,
  churches, published church event occurrences and explicit topic vocabulary.
- Installation identity/start/scope/icons and online-first caching/update policy
  are settled. The server embeds its public build identity for safe update
  comparison; a no-store endpoint and tested decision helper support the next UI.
- Account export includes the owner's active workspace data with explicit fields.

Contracts: [Private post workspace and community search](POST_WORKSPACE_CONTRACT.md)
and [Installation and update foundation](INSTALLATION_CONTRACT.md). They define
actual API paths, inputs/results, limits, versions/retries, errors, pagination,
permission checks and focused interface acceptance. Medium work should continue
from this branch in the existing medium checkout, not an older main checkout.

Verification: 20 isolated workspace/search/canonical-post service tests passed;
two installation-policy tests passed; two actual production-mode local HTTPS API
tests and six account-export regressions passed. All 26 migrations applied to a
fresh isolated database, the populated upgrade preserved existing account/post
rows, and dump/restore preserved populated workspace records and constraints.
Lint, TypeScript, final production build and runtime tracing passed (98 traces,
7,710 entries, 240 server JS files). The shared full account harness now includes
the new checks and restore tables; that entire broad suite was not rerun here.

Ten existing browser regression groups passed on the initial foundation build.
After adding the server-rendered release marker, fresh HTTPS checks and twelve
cold/warm guest navigation cycles passed at 390/1280px across system/light/dark
appearance with network throttling: structure to signup and Back, Home to Explore
and Back, zero browser page errors. Local release-marker checks used a clearly
synthetic public SHA; it is not a deployment identity. The intermittent hydration
error remains unconfirmed, with no reproduced cause or claimed fix. Physical
phone installation and account-switch pilot acceptance remain open.

The private queue is reconciled to six immediately executable P2 Medium slices
plus four dependent P2 Medium follow-ons, with focused briefs and readback.
Foundation application commit: `b49385c`, pushed on `codex/foundation-unlocks`. Parent integrations remain open:
rich image/poll/scheduled draft snapshots, receipt retention/compaction, future
block/mute propagation, manifest/help/update UI, physical devices and push are not
claimed complete. End-of-batch review stays last. No production writes, migrations,
new service activation or messages to other people occurred in this batch.

## Medium bundle published; query-return correction — September 11, 2026

The Medium bundle `6b1d814` reached production in READY deployment
`dpl_2GzD3eLJHvHHJ6oeDXEu9MnZLwNb` at 14:26:09 UTC. The canonical domain
matched and 17 read-only HTTP checks passed. All 25 migrations were present;
none were pending. Production records and provider settings were not changed.

The live browser pass found that a newly typed, unsubmitted Explore query was
lost on Back from church search. This follow-up saves the query in the source
history entry and adds the missing browser regression. Fresh build/runtime,
lint and all ten isolated browser groups passed. The private release handoff
records the final follow-up deployment and live verification. See
[Medium refinement acceptance](MEDIUM_REFINEMENTS_REPORT.md) for the exact
evidence and retained limits. Earlier local-only statements below are historical.

## Medium presentation refinements verified locally — September 11, 2026

Guest gate titles, Explore query transfer, Home entry/empty copy and native
profile-dialog scroll locking are implemented in `70bd3bc`. Shared icons and a
static branded share-card renderer are in `db70799`; existing taxonomy and all
67 page metadata routes are inventoried in `1011cf0`. Branch
`codex/medium-workflow` is local, unpushed and unpublished.

The isolated sweep passed 374 checks with two expected disabled-email skips.
Final rebuild/runtime, lint/types and ten browser acceptance groups passed.
One earlier transient React 418 remains an explicit navigation-investigation
handoff; it did not recur in the diagnostic run. Physical-device, manifest/provider,
resource-preview and broader integrated gates remain open. See
[Medium refinement acceptance](MEDIUM_REFINEMENTS_REPORT.md) for scope and limits.


## Integrated release published — September 10, 2026

Application `c7067ae8d0d1dd14b1da7bb3ab3537cb65fe3c5c` is live on
`https://godschurches.com`, through READY deployment
`dpl_4ibe716oCJhfJRuBFJS1Gmuia1cc`. Canonical alias identity matched that
application, and all 17 live read-only HTTP checks passed at
2026-09-11 03:15 UTC (September 10 local time). Live guest browsing paged through
both public authors, kept the background inert/locked in My feed and restored
Home scrolling and opener focus on close. No live post, reaction or account was
changed by these checks. The nine additive migrations are applied: 25 complete,
none unfinished. Production email delivery remains enabled; support intake,
Google sign-in and photo uploads retain their existing inactive settings.

This supersedes the local/unpublished statuses in the earlier checkpoints below.
The candidate's 374 passing isolated checks, two expected disabled-email skips,
29 final HTTPS checks and backup/restore evidence remain the release evidence.
The remote Linux build also passed lint/types and runtime verification (95 traces,
7,363 entries, 233 server JS files). A report-only follow-up may deploy the same
application; the IDs above identify the application release actually checked.
The private handoff records the final serving receipt. The wider batch, real
reviewer/policy operations, physical-device checks and final review remain open.

## Integrated church, community and reader release candidate — September 10, 2026

Current main recovery/verification and focused-feed changes are integrated with
the church editor, role/privilege, post-audience and profile work. Community
selection runs after current post eligibility; private church posts stay scoped.
Home and My feed share mounted forms and a frozen reading set, preserving unsent
entries across opening, paging, closing and browser Back/Forward. Enlarged-text
feed controls now reflow without splitting their labels into narrow columns.

The full isolated suite passed **374 checks with two expected disabled-email
skips**. After the final CSS adjustment, the production build and **29 HTTPS
checks** passed, including chart, portal, reader, entrance and guest routes.
Runtime audit passed: 95 traces, 7,518 entries and 233 server JavaScript files.
Actual Chrome checks covered guest engagement prompts, draft preservation,
keyboard/focus restoration, 320/390px Mobile emulation, 200% OS text, reduced
motion, both swipe directions, long-post scrolling and deliberate pull to close.
All browser emulation settings were restored; physical Samsung remains separate.

A new encrypted PostgreSQL 17 backup was authenticated and restored privately.
All 16 existing migration checksums matched; nine pending migrations applied on
the isolated restore. Original column fingerprints across 42 tables matched,
new post/chart defaults were correct and no role grants were created. The
plaintext restore was removed. Production has not been modified at this
candidate checkpoint. Publication and serving verification are the next step.
See [CHURCH_STRUCTURE_REPORT.md](CHURCH_STRUCTURE_REPORT.md) and
[FEED_READER_REPORT.md](FEED_READER_REPORT.md).

Photo uploads remain disabled with explicit interface guidance because no Blob
store is configured. Real church review operations, physical-device acceptance,
Google sign-in and Search Console retain their separate existing dependencies.
These do not block publishing the verified editor/feed changes. The complete
batch, pilot/QA gates and final batch review remain open.

## Phone and keyboard chart controls — September 10, 2026

The chart now provides full-size non-drag card movement buttons, keyboard handle
activation that moves focus to the reporting picker, and a persistent panning
exit. Escape exits panning from any chart control. Review, recovery and editing
decisions restore focus to the editor. Connected drag handles appear only at
explicit 100% or greater zoom; the fitted overview retains non-drag alternatives.

Platform text honors supported OS text enlargement. Narrow layouts reduce nested
padding and reflow navigation into two columns without reducing enlarged text.
Chrome's actual mobile emulation covered 320/390px, 200% OS text and reduced
motion; ordinary page scrolling, deliberate touch-style dragging, non-drag
movement/Undo, reviewed saving and panning exits were exercised. Desktop keyboard
checks covered reporting changes, handles, assignment review/save, contact and
outline navigation, and restoration of the selected role's focus. Physical
Samsung testing remains separate. See
[CHURCH_STRUCTURE_REPORT.md](CHURCH_STRUCTURE_REPORT.md) for final check evidence.

The church editor bundle remains local and unpublished. Integrated release
acceptance and current main recovery/feed integration follow, preserving existing
post-audience authorization. No new owner action blocks coding. The complete
batch and final review remain open.

## Chart draft recovery and saved history verified locally — September 10, 2026

Unsaved chart choices can now survive ordinary navigation, browser Back/Forward
and reload in the same tab for up to 24 hours. Recovery retains only placement
geometry and an exact uncertain-save reference; current church access, member
details and a fresh confirmation are required. Save or explicit discard clears
the copy. Storage failure is reported rather than claiming a draft was kept.

Managers can view paginated saved chart history with time, current permitted
editor names and before/after placement. Unlisted or unavailable people/positions
remain unnamed. Current membership and authority protect HTML, Flight and JSON;
open history clears when access cannot be confirmed.

Eighteen pure checks, 32 targeted service checks, eight development structure HTTP
checks and 27 final production HTTPS checks passed, alongside build, lint/types
and runtime audit. Chrome verified navigation/reload recovery, fresh confirmation,
discard/save cleanup, access loss/restoration and exact retry after reload. That
walkthrough fixed an acknowledgement comparison that had rejected an already
loaded save. A superseded receipt retains choices for review without overwriting
the newer chart. See [CHURCH_STRUCTURE_REPORT.md](CHURCH_STRUCTURE_REPORT.md).

Draft/history acceptance is complete locally. Phone/keyboard/large-text checks
are next, followed by integrated release acceptance. The bundle remains
unpushed/unpublished; integrate current main recovery/feed changes while keeping
post-audience checks before release. No new owner action blocks coding. The
complete batch and final review remain open.

## Contact cards and current sharing verified locally — September 10, 2026

Church contact cards now connect the directory, chart, unconnected roles and
responsibilities to the same permitted person/role projections. They show chosen
shared email/phone, truthful missing fields and relevant roles. Fixed same-church
return contexts restore the selected person or position; role titles open duties,
while person names open contacts. Wrapped chart titles have a continuous target.

Visible contacts, directory entries and chart projections refresh every 15 seconds,
on return to the tab and on request. Unavailable reads hide protected information.
Chart drafts/undo retain geometry only across access loss and require current
access plus a new review. Static structure views invalidate withdrawn identities
or authority without discarding a retry merely because the chart version changed.

Fifteen pure checks and 26 final production HTTPS checks passed, with build,
lint/types and runtime audit. The broader isolated service/migration/development
sweep and resumed production groups passed after correcting two HTML/Flight test
expectations. Browser checks covered chosen-contact changes, unlisting, directory/
chart/outline/responsibility return focus, lost authority/membership, geometry-only
retention and exact retry after an unconfirmed committed save. See
[CHURCH_STRUCTURE_REPORT.md](CHURCH_STRUCTURE_REPORT.md).

The contact integration task is complete locally. Full browser Back/reload draft
recovery, history, accessibility and integrated release acceptance remain open.
The bundle is unpushed/unpublished; integrate current main recovery/feed changes
while preserving post-audience checks before release. No new owner action blocks
coding. The complete batch and final review remain open.

## Staffing and position lifecycle verified locally — September 10, 2026

The remaining unconnected-role staffing/lifecycle acceptance passed on the drag
editor. Stepping down ends only that assignment; ending the last assignment leaves
a vacant position with its staffed reporting branch. Another role's permission
contribution remains active. Archiving a parent with children is rejected, while
a confirmed leaf archive returns to the updated chart.

Browser verification found and fixed a generic structure-form error path that
hid the archive explanation and stayed busy during automatic refresh. These forms
now retain the actual server explanation and offer explicit reload/current-review
after conflicts, access changes or uncertain responses. The built routes passed
25 HTTPS checks, build/lint/types and runtime audit. See
[CHURCH_STRUCTURE_REPORT.md](CHURCH_STRUCTURE_REPORT.md).

The unconnected-role/staffing task is complete locally. Continue with contact-card
entry/return context and current-consent behavior, followed by full draft/history
recovery and accessibility/release acceptance. This bundle is unpushed/unpublished.
Integrate current main recovery/feed fixes while retaining audience checks before
release. The complete batch and final review remain open; no new owner action
blocks independent coding.

## Deliberate chart dragging verified locally — September 10, 2026

The visual editor now stages reporting drag/drop, explicit root/detach targets
and independent grid movement through the shared chart rules. The equivalent
reporting picker, Undo/Redo, Auto-arrange, review and confirmed Save/Discard are
available. Saved anchors carry automatically placed descendants while retaining
their reporting links. Conflicts and uncertain saves keep reviewed choices.

Twelve pure model/layout checks and 25 production HTTPS checks passed, together
with production build, lint/types and the runtime audit. Chrome verified actual
dragging, preserved branches/assignments, invalid descendant drops, grid save,
same-save retry, two-editor conflict recovery, fresh confirmation, undo/discard,
another-tab readback and 320/390-pixel layout. Browser checks caught and resolved
an offscreen leave prompt and a first-selection shift during dragging. See
[CHURCH_STRUCTURE_REPORT.md](CHURCH_STRUCTURE_REPORT.md).

The drag/reporting task is complete locally. Continue with the unconnected-role
staffing/lifecycle acceptance, then contact-return context and full save/recovery.
History, browser Back/reload draft recovery, full native keyboard/touch/large-text
and physical-device acceptance remain open before integrated release. The bundle
is unpushed/unpublished; current main recovery/feed fixes still need integration
without weakening post-audience checks. No new owner action blocks this coding.
The complete batch and its final review remain open.

## Atomic chart-save foundation verified; drag controls next — September 10, 2026

The server can now save a reviewed set of reporting and grid-layout changes
atomically, with current authority/version checks, exact retry receipts and
placement-only history. Shared draft rules preserve branch descendants and keep
assignments/permissions out of undo data. Optional coordinates and save history
use an additive migration that preserves existing records.

The full isolated sweep passed 322 checks (320 pass/two expected skips); all 31
targeted service checks and ten pure layout/model checks passed. Populated upgrade,
restore/fresh migrations, restart, actual development/production HTTP,
build/lint/types and runtime audit passed. See
[CHURCH_STRUCTURE_REPORT.md](CHURCH_STRUCTURE_REPORT.md).

Continue with deliberate drag handles and staged editor controls. The visual chart
and mandatory Privileges tasks remain complete locally; drag, staffing/lifecycle,
full save/recovery and accessibility/release acceptance remain open. This bundle
is unpushed/unpublished, with no new owner action blocking code. Preserve current
main recovery/feed fixes and existing post-audience checks during integration.
The complete batch and final review remain open.

## Visual chart and mandatory assignment integration verified — September 10, 2026

The local church chart now has connected role cards, an unconnected area, pan/zoom,
fit, branch expansion, role/shared-name search and the existing full outline. It
preserves separate positions and private member projections. Chart staffing and
existing assignment links use the mandatory Privileges review; that interface's
remaining chart integration is complete.

Five layout/search checks and 24 production HTTPS checks passed. Build, lint/types
and runtime audit passed. Chrome verified manager/member views, collapsed-branch
search and focus, keyboard pan/zoom, mixed listed/unlisted assignments, two roles
for one person, explicit vacancy/second-assignee saves, another-tab readback and
320/390-pixel layouts without page overflow. Readback preserved reporting and
existing grants; the new fictional assignments added no permissions. See
[CHURCH_STRUCTURE_REPORT.md](CHURCH_STRUCTURE_REPORT.md).

Continue with snapping reporting connections and staged edit/save integration.
Full touch/keyboard/large-text and physical-device acceptance remain separate.
This bundle is unpushed/unpublished; integrate current main recovery/feed changes
without removing audience checks before release. No new owner action blocks code
work. The complete batch, provider-account/church-policy dependencies and final
review remain open.

## Unconnected placement verified; visual chart next — September 10, 2026

Positions now distinguish Not connected yet, an explicit chart root and a reporting
position. New positions start unconnected, editing duties preserves placement, and
moving a branch preserves its assignments and grants. The migration retains prior
position fields, roots, reporting lines and permissions. The tree has a separate
unconnected area, with placement labels in details, Privileges and responsibilities.

The full isolated sweep passed 303 checks (301 pass/two expected skips), all 24
targeted service checks passed, and populated upgrade/restore/fresh migrations,
build/types/lint, restart and actual production HTTPS checks passed. Chrome verified
two separately assigned positions from one title, reload, one-at-a-time placement,
branch detach, unchanged duties/reporting and the member view. The 320/390-pixel
layouts and visible keyboard focus passed; native arrow-key selection and full
chart accessibility/physical-device review remain unverified. See
[CHURCH_STRUCTURE_REPORT.md](CHURCH_STRUCTURE_REPORT.md).

The Privileges interface and placement prerequisite are verified locally; the
future visual chart must still use the mandatory assignment flow. Continue with
the visual hierarchy canvas, preserving the equivalent outline. This bundle is
unpushed/unpublished. Integrate newer main recovery/feed changes without removing
post-audience checks before release. No owner action blocks this coding; separate
provider-account and church-review policy decisions and the final batch review
remain open.

## Privileges interface verified; placement integration remains — September 10, 2026

The saved `codex/role-privileges-interface` checkpoint provides the shared
selection → Privileges → final confirmation flow from People, Structure, position
controls, contact details and My responsibilities. It preserves reviewed choices
on conflict or an uncertain response, shows other permission sources, and rechecks
current delegation. Existing titles never silently change saved grants.

The isolated full sweep passed 302 checks (300 pass/two expected skips), the final
23 affected service checks and 24 production HTTPS checks passed, and build,
lint/types and runtime audit passed. Chrome verified pastor/volunteer/custom role
reviews, cancellation, competing editors, dropped-save retry, revoked delegation,
unlisted privacy, keyboard and 320/390-pixel layouts. The People entry was added
and verified during that walkthrough. See
[CHURCH_STRUCTURE_REPORT.md](CHURCH_STRUCTURE_REPORT.md).

Role-library acceptance is complete locally. Privileges chart integration stays
open until new positions have explicit persisted unconnected state and the future
chart uses this flow. No real church records or permissions changed; this saved
bundle remains unpushed and unpublished. Integrate the current main recovery and
focused-feed changes without removing post-audience checks before release.
Password reset/sign-in/email verification are already owner-confirmed, and no new
owner action blocks independent coding. Church-review policy and provider account
choices remain separate dependencies; the full batch and final review are open.

## Role-library browser acceptance completed; permissions interface next — September 10, 2026

Chrome completed the remaining fictional role-library walkthrough on saved
application `a25e872`: create/rename/archive, duplicate feedback, retained two-tab
conflict drafts, stable retry after a dropped committed response, separate
positions using one title and preserved reporting/duties after archive. Keyboard,
inline confirmations and desktop/390/320-pixel layouts passed. No application
change was needed and no real church record or permission changed. See
[CHURCH_STRUCTURE_REPORT.md](CHURCH_STRUCTURE_REPORT.md).

Work continues on `codex/role-privileges-interface`, preserving the unpublished
social/profile/role bundle. The mandatory Privileges screen is next; chart and
integrated acceptance stay open. Earlier recovery blockers below are historical:
the owner confirmed password reset, sign-in and email verification. Production
is the separately verified `9c19f348` release (application `7fdaf6a`), including
email-flow fixes, all-public early community feed and full-screen My feed.
Those newer main changes must be integrated without removing audience checks
before this saved bundle can be released. No new owner action blocks coding.

## Assignment permission service verified locally; recovery takes priority — September 10, 2026

`codex/scoped-role-permissions` adds separate assignment-owned permission
contributions, explicit atomic review/save, current delegation checks, stable
retry receipts and effective access shared by church, calendar and post tools.
Removing a role ends only its contributions; independent and other role grants
remain. Membership removal/suspension cannot revive grants on rejoining. Public
representative authority remains in the reviewed claim workflow.

The sweep and corrected remaining run passed 333 distinct checks: 331 pass,
two expected disabled-email skips, no unresolved failures. This includes eight
new service groups, development/production HTTP, populated additive upgrade,
backup/restore, fresh migrations and restart. Build, lint and types passed.
The expanded fictional HTTP scenario initially exhausted its shared rate budget;
scenario isolation fixed the test without changing production limits. See
[CHURCH_STRUCTURE_REPORT.md](CHURCH_STRUCTURE_REPORT.md).

The role-library browser walkthrough remains open; normal Chrome navigation
works and provides an alternative to the old stalled Codex preview. Its saved
fictional fixture was upgraded without changing earlier records or creating
permissions. The mandatory Privileges interface is the next code task after
account access is restored. No role-service change has been pushed or published.

The owner again requested immediate password recovery. Discretionary feature
implementation is paused: the existing provider page still needs owner acceptance,
production delivery remains disabled and the original account mailbox is still
needed. No reset email or password change is claimed. Provider activation and
same-account recovery remain the first priority.

## Role-library code verified; browser acceptance pending — September 10, 2026

`codex/church-role-templates` preserves the unpublished post/profile work and
merges the live recovery-entry release. The 82-title catalog, versioned
church-owned templates and editable recommendations are implemented. Separate
position references preserve prior names, duties, reporting links and grants.
The full isolated sweep passed 323 checks (321 pass, two expected skips), including
populated upgrade, restore and fresh migrations. All 22 final affected production
HTTPS checks, lint/types/build and runtime audit passed (91 traces / 7,198 entries /
223 server JS files; no private fixtures/environment files).

A real fictional browser saved the customized starter title and confirmed the
390-pixel layout. An old native test confirmation stalled browser input. Page-based
review controls now replace it; their remaining browser acceptance is still open
pending dismissal of the old test tab. This task is neither completed nor
published. See [CHURCH_STRUCTURE_REPORT.md](CHURCH_STRUCTURE_REPORT.md).
The next independent code action is scoped permission delegation and assignment
grant ownership, while the owner/browser step and real account email activation
remain explicitly pending. The visual chart, social release and final batch
review stay open.
## Focused My feed reader — September 10, 2026

The dedicated `/platform/feed` reader is implemented on `codex/focused-feed-reader`.
Home remains scrollable; the modal pages horizontally and supports deliberate
vertical dismissal, Close/Escape, keyboard/trackpad controls, long-post reading
and restored Home position. Fifteen development and fifteen production HTTPS
checks, final build/lint/types/runtime, and fictional browser checks passed;
application `7fdaf6a` is live on READY `dpl_DrpPVcC5FY7yVth5RfsDaM5h5zBU`.
Exact canonical identity, all 17 live read-only checks and actual guest paging
through both public authors passed. Native Chrome touch emulation also passed
both swipe directions, short/large vertical drags and long-post scrolling.
Physical-device feel, broader Home planning and later ranking remain separate.
See [FEED_READER_REPORT.md](FEED_READER_REPORT.md).

## First-use account and early feed fixes — September 10, 2026

The owner confirms password reset, original-account sign-in and email verification.
Dedicated verification/recovery screens, automatic signup verification, direct
email buttons and same-tab fragment handling are verified locally on
`codex/early-community-account-flow`. Home shows all active public posts by
default, retaining the Following filter for later. The isolated suite/remainder
has 219 passes and two expected delivery skips, plus focused checks and actual
fictional browser acceptance. Sender-scoped DMARC resolves authoritatively; spam
guidance is included. Application `06a0fdd` with CLI upload exclusions `3d931bd`
is published on READY `dpl_4GdrKfA3ry117BCwVGkonGYuhhiW`; canonical identity
and all 13 live read-only checks passed. Phone verification is deferred.
The requested full-screen horizontal My feed reader follows this urgent fix;
Home remains normally scrollable. See [ACCOUNT_DELIVERY_REPORT.md](ACCOUNT_DELIVERY_REPORT.md).

## Password-recovery sender activated — September 10, 2026

Production email recovery is enabled. The dedicated Resend sender is verified
with publicly resolving Cloudflare DNS, no tracking configuration, enforced TLS
and a sending-only domain-restricted key stored as a Vercel production Secret.
No paid plan was purchased. The actual account endpoint issued one authorized
recovery email, which the provider reports delivered. Inbox receipt and the
owner's private password reset/sign-in remain pending; no account was replaced.

The existing application source `2e90f6fdfdda290f292a5c92dc06265f7dfc2c52` is on
READY `dpl_9pCtiZ3yvcWu1px5AWVEbc1x6tCe`. Remote build/lint/types and runtime
checks passed, with no pending migrations. Six candidate HTTP checks passed
before the email test and promotion. All 13 live read-only HTTP checks passed.
Canonical serving identity and actual browser navigation from Forgot password to the enabled recovery form passed;
the deployment error scan returned no rows. Full lifecycle regressions were
previously verified and were not rerun for this configuration-only activation.
See [ACCOUNT_DELIVERY_REPORT.md](ACCOUNT_DELIVERY_REPORT.md).

The sender/terms prerequisites are now resolved. Preserve the separately saved
post/profile/role work and keep final account acceptance open for the owner's
result. Earlier disabled-sender sections below are historical.

## Password-recovery entry published — September 10, 2026

`codex/account-recovery-activation` changes the account entry link to **Forgot
password?** and makes the surrounding guidance follow the same validated
availability setting as the recovery page. Help directs readers to that current
status. Account ownership, reset and session behavior are unchanged. The work is
based on the currently published calendar code, with no schema/dependency change.

Across the sweep and corrected remaining checks, 216 of 218 checks passed with
two expected disabled-email skips and no unresolved failures. Final build/types/
lint, migrations/restore/restart and runtime checks passed (85 traces / 6,163
entries / 204 server JS files), including an additional private-fixture audit.
The rendered-text/RSC assertion and a mismatched fixture resume were corrected.
Application `324415197e5be57a007023dda4aacc5e70d16a09` is live on READY
`dpl_NJ72TNNqvtkBt71YXfoKvsWf3unF` at 16:40:24.703 UTC. Exact canonical serving
identity, all 13 live read-only checks and actual 390-pixel keyboard navigation
passed; no browser errors were returned. See
[ACCOUNT_DELIVERY_REPORT.md](ACCOUNT_DELIVERY_REPORT.md).

Real sender activation is still pending: fresh hosting inspection found no
Resend resource or sender variables and delivery remains disabled. The existing
provider terms screen requires the owner step and an authorized account mailbox.
No real recovery email, password or account-data change has occurred. The broader
post/profile work remains saved on its separate local branch; the full batch and
actual account-recovery acceptance remain open.

## Profile photos and customization verified locally — September 10, 2026

`codex/profile-controls` adds saved avatar/cover crop, zoom, reposition, progress,
retry, replacement/removal, readable appearance presets, About/Posts order and a
pinned introduction. Versioned profile saves preserve competing drafts for
explicit review. Guest profiles/media stay gated, and owner visitor previews use
only minimal author identity, including in development responses. Account export
includes personal image metadata and appearance within a 4 MiB total cap.

Across the sweep and corrected remaining runs, 311 of 313 distinct checks passed
with two expected disabled-email skips and no unresolved failures. All 86 final
production HTTPS checks (84 passing, two skips), migrations/restore, lint/types,
build and private-trace checks passed. The root build has 90 traces / 7,126 entries /
221 server JS files. Actual fictional browser rotation/crop/retry/remove/replace,
reload/second sign-in, conflict review/focus, previews, 320/390/1,226-pixel layouts
and large text/dark/reduced-motion preferences were checked. Physical Samsung,
OS 200%/motion and recordings remain separate acceptance. See
[PROFILE_CONTROLS_REPORT.md](PROFILE_CONTROLS_REPORT.md).

Profile/post/image changes remain local and unpublished; calendar remains live.
Production image storage and subsequent galleries/church images/cleanup acceptance
stay open. The next active priority is existing-account password recovery,
including the requested Forgot password? label and verified sender delivery.
The full batch and parent profile assignment remain open.

## Private image foundation verified locally — September 10, 2026

`codex/image-foundations` adds bounded JPEG/PNG/WebP processing, orientation and
metadata removal, responsive WebP sizes, stable upload/replacement/removal,
durable orphan cleanup records, and current account/church/post permission checks
for every delivery. Uploads and individual outputs fit the hosting payload limit;
private media cannot enter the shared image optimizer. Across the full regression
and corrected/final reruns, 296 distinct checks passed with two expected skips
and no unresolved failures (298 total). The final build passed 89 runtime traces,
6,784 entries and 219 server JavaScript files, with private fixture/environment
files explicitly excluded and checked. Both final production HTTPS image groups,
lint/types and migration/restore checks passed. The test-writer mode and fixture
tracing issues found during verification were corrected. Storage remains disabled;
actual provider delivery, the cleanup worker and image/profile UI are next.
These changes are local and unpublished; calendar remains live. See
[IMAGE_FOUNDATION_REPORT.md](IMAGE_FOUNDATION_REPORT.md).

## Bible-page reader verified locally — September 10, 2026

`codex/bible-page-reader` adds literal rightward-next/leftward-previous gestures,
paper hinge/shadow motion, retained mounted post controls, Pages first-use default
with saved preferences preserved, stable reading URLs and explicit guarded
refresh/retry behavior. The full isolated run passed 274 checks with two expected
skips and zero failures (276 total). All eleven final affected production HTTPS
groups and final lint/types/build/runtime checks passed. Actual fictional browser
actions, drafts, List/Pages, profile Back, older sets, outage recovery and 320/390/
1,226-pixel layouts were checked; source matched the browser copy. Real Samsung,
OS motion/200% text and short recordings remain separate integrated acceptance.
The post changes are local and unpublished; calendar remains live. Profiles and
image uploads are next. See [POST_READER_REPORT.md](POST_READER_REPORT.md).

## Safe post link previews verified locally — September 10, 2026

`codex/post-link-previews` adds optional removable public HTTPS text cards to the
shared composer/editor and readers, with plain-link fallback. Bounded DNS and
redirect validation, pinned TLS connections, signed actor-bound receipts and
current post permissions protect fetching and saving; withdrawal clears all link
fields. The full isolated run passed 261 checks with two expected skips and no
failures. Final service checks (15) and production HTTPS checks (10) passed after
the final retry change, bringing unique coverage to 264 checks, 262 passing and
two expected skips. Final build/types/lint/runtime and actual fictional browser
add/remove/edit/failure/guest/private/withdrawal and phone/desktop checks passed.
The post changes remain local and unpublished; calendar remains live. The
Bible-page reader is next. See [POST_LINK_REPORT.md](POST_LINK_REPORT.md).

## Publishing controls verified locally — September 10, 2026

`codex/post-publishing-interface` adds explicit personal/church authorship,
controlled audiences and deliberate church sharing, visible text/topic limits,
safe paragraphs/lists, recoverable versioned editing and management forms, and
church posts with bounded expiring pins. All 247 applicable regressions passed
across the sweep and corrected HTTPS reruns (249 distinct checks, two expected
skips), including migrations/restore and actual development/production requests.
Final lint/types/runtime and fictional browser publishing, two-session stale
edits, participation preservation, withdrawal/cancellation, guest gates and
phone/desktop reflow passed. These post changes remain local and unpublished;
the calendar release below remains live. Safe link previews are next. The parent
and full batch remain open. See [POST_EDITOR_REPORT.md](POST_EDITOR_REPORT.md).

## Poll and volunteer participation verified locally — September 10, 2026

`codex/post-participation` continues the verified local post foundation at
`5d55274`. Poll ballots, event-linked volunteer roles/reservations, authorized
rosters, My commitments integration and their interface are implemented locally.
All 239 applicable checks passed (241 total, zero failures, two expected delivery
skips), including migrations/restore and actual development/production HTTP.
After browser-found availability and viewing-zone fixes, all ten final affected
production HTTPS groups passed. Final lint/build/types/runtime and actual
fictional voting, last-place contention, cancellation, roster, guest and
phone/desktop browser checks passed. These changes are unpublished. Full
publishing controls are next; the parent and full batch remain open. See
[POST_PARTICIPATION_REPORT.md](POST_PARTICIPATION_REPORT.md).

## Post publishing foundation verified locally — September 10, 2026

`codex/post-publishing-foundation` extends shared posts with explicit personal or
church authorship, current audience and capability checks, bounded multiline
text/topics, versioned editing/withdrawal, reply restrictions, pins, scheduling
domain state and linked-event visibility. Existing feed/search/profile/direct
reads and actions use the same rules. Upgrade/restore/fresh migrations and
relevant regressions passed, with one stale Home-copy assertion corrected in a
targeted rerun. After browser-found fixes, seven database groups and all 13 final
production HTTPS checks passed, along with lint/build/types/runtime. Actual
fictional posting, comment/like persistence, exact multiline limits, withdrawal,
public/private reading and phone layouts passed. This foundation is local and
unpublished; the calendar release below remains live. Polls and volunteer
participation are next, followed by the publishing interface and Bible-page
reader. The parent and full batch remain open. See
[POST_PUBLISHING_REPORT.md](POST_PUBLISHING_REPORT.md).

## Calendar interface published — September 10, 2026

`codex/calendar-interface` adds real calendar/event pages, sharing/publication,
RSVP and My commitments, with guest-readable public church events. All 214
applicable regressions passed (216 total, two expected delivery skips), including
eleven service groups and four actual HTTP groups each in development and
production. Final lint/build/types/runtime and four final verified-HTTPS groups
passed. Actual fictional browser sharing, revocation, recurrence, RSVP,
validation/retry/conflict and 320/390/1440-pixel journeys passed. Application
`f0fe0e92a68161d38e67593b62dccd37c3167f63` is live on READY
`dpl_DoMvFu23uHdhaw8RAcg1YJrE3KSD`; exact canonical identity, all 113 live HTTP
checks and 390-pixel guest/signup/Back navigation passed. No browser or deployment
errors were returned. Parent calendar work keeps later event-thread,
shift, outbox and physical-device acceptance open. See
[CALENDAR_REPORT.md](CALENDAR_REPORT.md).

## Calendar foundation verified locally — September 10, 2026

`codex/calendar-foundation` adds private personal and church calendar ownership,
explicit busy/detail sharing, separate editing/publication permissions, stable
weekly occurrences, RSVP/commitments, private conflict hints and owned export.
All 203 applicable checks passed (205 total, two expected delivery skips), plus
a final calendar deactivation/reactivation test. Full migrations/restore/restart,
production build/runtime and existing HTTPS regressions passed; final lint and
TypeScript passed. Calendar routes/forms and actual browser acceptance are next.
The foundation is local and unpublished; the structure release below remains
live. See [CALENDAR_REPORT.md](CALENDAR_REPORT.md).

## Church structure published — September 10, 2026

`codex/church-organization-structure` adds church positions, one-parent reporting
lines, vacancies, consented assignments/contact cards, personal responsibilities,
explicit access delegation and current-session revocation. All 195 applicable
isolated checks passed (197 total, two intentional delivery skips), including
upgrade/restore/fresh migrations and restart. Final lint/build/runtime, both
production HTTPS groups and actual fictional browser journeys passed. Two
independent browser sessions verified stale-editor revocation; phone/desktop
reflow, keyboard expansion and the twelve-level tree/outline passed. Application `73ea360cd953edf01047751c9a7acbbb866e4fb2` is live on READY
`dpl_8UokbVooXAFf9n3tbHHcnb9bEDM9`; exact canonical identity and all 93 live HTTP
checks passed. Phone-width signup/Back preserved its destination. One transient
React hydration error remains an open navigation investigation; reload and fresh
in-app/Chrome journeys returned no new errors. Server error logs were empty.
Real claim policy/reviewer readiness and later calendar/publishing integration
remain open. See [CHURCH_STRUCTURE_REPORT.md](CHURCH_STRUCTURE_REPORT.md).

## Official church setup published — September 10, 2026

`codex/church-official-claims` implements private representative drafts, accessible
review contact, independent scoped decisions, explicit activation on the same
church record, managed profile publication and grant-specific revocation. All
182 applicable isolated checks passed (184 total, two intentional delivery skips),
plus final targeted service and production HTTPS checks. Actual fictional
browser setup, approval, activation, public-profile publication and stale-editor
revocation passed across phone and desktop layouts. Application
`a0ede60daa74cab6a8a12cadb9e6a59285cbe35d` is live on READY deployment
`dpl_A746vaUDxw3umTnjPEzd4hqsfPC6`. Exact canonical identity, 71 live HTTP
checks and live phone-width setup/signup/Back navigation passed without overflow.
No deployment error entries were returned. Live claim review stays disabled pending the recorded verification-policy
and reviewer-operations decision; no real powers or verification were granted.
Roles and the organization tree remain next in task 1. See
[CHURCH_CLAIM_REPORT.md](CHURCH_CLAIM_REPORT.md).

## Community listings published — September 10, 2026

`codex/church-community-listings` adds search-first private drafts, explicit
public previews, unofficial church pages, and independent correction/duplicate
review without membership or management grants. Saved drafts enter the owner’s
private account download. All 170 applicable isolated checks (172 total, zero
failures, two intentional delivery skips), migration/restore/restart, final
lint/types/build/runtime and fictional browser journeys passed. A browser-found
review redirect race was corrected and the final create/save/review navigation
passed. Phone/desktop reflow and public guest gates passed without browser errors.
Application `bb68c9f0c82b52a6a18e6e9333c8d1400c3b9016` is live on READY
deployment `dpl_33DLfMj1NAQCRWAnvrTY5wvFBfa9`. Exact canonical identity, all
52 live checks and live mobile guest navigation passed; no browser or deployment
errors were returned. Official claims, verification and the
organization tree remain next in task 1; actual providers and physical acceptance
remain separate. See [CHURCH_LISTING_REPORT.md](CHURCH_LISTING_REPORT.md).

## Shared church search published — September 9, 2026

`codex/church-discovery-search` adds public name/description search and preserves
the query through pagination and Back. Signed-in members can now reach churches
beyond the first 100 results; granted church tools remain independent from search.
All 158 applicable isolated checks, final lint/types/build/runtime, 22 additional
production Menu/card checks and actual public browser search/pagination/reflow
passed. Application `b05974754e3a6715718fe31ab518126f11a6503f` is live on READY
deployment `dpl_5GRGzNLo6MbATfTmt6Yvdastq1EK`, with exact canonical serving
identity, 36 live HTTP checks and actual 320px search/390px Menu navigation passed.
No browser or deployment errors were returned. No church creation, claim, verification or grant is
activated. The broader shared onboarding/roles/tree work remains open. See
[CHURCH_DISCOVERY_REPORT.md](CHURCH_DISCOVERY_REPORT.md).

## Menu and phone navigation published — September 9, 2026

`codex/navigation-menu` adds a guest-readable Menu for working account, church and
help destinations. Home, Churches/My church, Explore and Menu remain visible at
320px; Activity follows the real notification service. All 156 applicable isolated
regressions, 22 additional production HTTPS route/privacy requests, final
lint/types/build and runtime verification passed. Actual fictional browser checks
covered account gates, login return, keyboard navigation, Back, search-state return
and phone reflow. Application `2701b16c7e3c48f74ac4863f0dafa2e4b5cbc311` is live
on READY deployment `dpl_Erx2D3CWEJyYuum5gds2syN9A6mC`, with exact canonical
serving identity, 32 live checks and 320/390px guest navigation verified. No
deployment error entries were returned. Continue shared church discovery and
onboarding while actual provider setup waits. Full navigation acceptance remains open for
later feature/dialog/draft integration and physical Samsung/200% text tests. See
[NAVIGATION_REPORT.md](NAVIGATION_REPORT.md).

## Google interface published, provider activation pending — September 9, 2026

The `codex/google-account-interface` implementation completes explicit Google
onboarding, sign-in-method management and sensitive account confirmations above
`9199d7d`. All 156 applicable isolated checks passed (zero failures, two intentional
delivery skips), plus actual fictional-provider browser journeys and 20 enabled
privacy requests in each of development and production. Final lint/types/build,
runtime traces and migration/restore/restart passed. A shared cookie reader
prevents Next development diagnostics from serializing request credentials.
Google remains disabled in production, with real provider/device acceptance
still open. Application `61ec62510686f881a93d6d742249954938d820db` is live on
READY deployment `dpl_5WuUwEqsubosE4Jx8t41pb1m1rCA`, with exact canonical
serving identity, 29 live HTTP checks and mobile guest navigation verified.
No browser errors or warnings were returned. Continue the navigation foundation
while actual Google and email-provider setup remain pending. See
[GOOGLE_ACCOUNT_REPORT.md](GOOGLE_ACCOUNT_REPORT.md).


## Google HTTP integration verified locally — September 9, 2026

`codex/google-http-boundary` extends `83f4f1e` with origin/rate-limited routes,
callback cleanup, HttpOnly proof cookies and existing account-endpoint integration.
All 153 applicable checks passed, including ten new boundary groups and real
disabled development/production HTTP checks. Final lint/types/build/runtime and
migration/restore/restart passed. UI/provider
acceptance remains pending and all Google work is local and unpushed. Production
continues serving the verified guest-browsing release below. See
[GOOGLE_ACCOUNT_REPORT.md](GOOGLE_ACCOUNT_REPORT.md).

## Google account controls verified locally — September 9, 2026

`codex/google-reauthentication` extends local foundation `6030ba3` with one-use,
action-specific Google confirmation for sensitive account services, explicit
Google reactivation and own-identity export. All 139 applicable isolated checks,
lint, TypeScript, upgrade/restore/fresh migrations, restart and the final
production build/runtime checks passed. HTTP/UI integration and real provider acceptance remain
pending, and no Google control is enabled or published. See
[GOOGLE_ACCOUNT_REPORT.md](GOOGLE_ACCOUNT_REPORT.md).

## Google account foundation verified locally — September 9, 2026

The local `codex/google-account-foundation` branch adds library-verified Google
identity proofs, browser-bound authorization attempts and transactional
signup/link/session rules. All 130 applicable isolated checks, including nine new
Google security groups, lint, TypeScript, upgrade/restore/fresh migrations and
the final production build/runtime validation passed. Google controls, routes, real provider
configuration and Google-only account controls are not enabled. See
[GOOGLE_ACCOUNT_REPORT.md](GOOGLE_ACCOUNT_REPORT.md). The guest-browsing release
below remains production; the foundation is not published.

## Browse before joining published — September 9, 2026

Guest browsing is implemented on `codex/guest-browsing`: public posts and all
comments, paginated church discovery and public church details are readable
without signing in. Member profiles, settings and participation use contextual
Join/Sign in with validated return destinations. Minimal author projections keep
member biographies out of anonymous queries and responses. All 121 applicable
isolated checks, final lint/types/build/runtime checks and fictional browser
signup/return/reflow passed. Application `ced731baaeea4d31a00759cfee562d8e2e0637a6`
is live on READY deployment `dpl_91yvqbhLpucMq79iGojnzLXAFp9E`; exact SHA/canonical
serving identity, 22 live HTTP checks and live mobile-width navigation passed.
The live lists are empty; populated reading was tested using fictional fixtures.
No browser or deployment errors were returned. See
[GUEST_BROWSING_REPORT.md](GUEST_BROWSING_REPORT.md) for scope and evidence.
Topic communities remain specified for the discussion/moderation workstream.
Continue Google sign-in's account foundation while actual sender/provider setup
and full account acceptance remain open.

## Verified email-change release — September 9, 2026

Current-password-confirmed sign-in email changes are implemented and locally
verified on `codex/account-email-change`. Confirmation requires the same account,
a one-use link delivered to the new address and the current password; it revokes
every session while preserving profile, church and directory records. All 116
applicable isolated checks, lint/types, migration/restore/restart, browser flows
and the final production build/runtime trace passed. Two enabled-delivery cases
are intentionally skipped in the disabled production-mode pass. Application
`0b885a7abfd736f45ee6f863ee22c9905c8c4ec5` is live on READY deployment
`dpl_BccPQgGhXJD98qd6wXXHRN8HwJKG`; exact SHA/canonical serving identity and
17 live checks passed. Delivery stays disabled until sender setup is ready.
See [ACCOUNT_EMAIL_CHANGE_REPORT.md](ACCOUNT_EMAIL_CHANGE_REPORT.md).

Guest browsing was the next product slice after this email-change release; its
latest implementation and release status is recorded above. Topic communities
are captured in the private canonical roadmap for implementation with
discussion/moderation foundations.

## Account lifecycle published — September 9, 2026

Password-confirmed deactivation and explicit reactivation are implemented on
`codex/account-lifecycle`. Duty handoff is enforced before deactivation; sessions
and sharing end while stored records remain. Inactive community content is hidden
and all community writes recheck session status under the shared access gate.
All 105 isolated service/HTTP tests, lint, TypeScript, migration/restore/restart
checks, actual fictional browser flows and the final production build/runtime
traces passed. Application `c08226efba67dcc2aabe1f4c97030aafdfe922bc` is live
on READY deployment `dpl_2iwfAMNWTszoV6Nfx1KxmjEK5L5T`; exact SHA/canonical
alias and 17 live checks passed. See [ACCOUNT_LIFECYCLE_REPORT.md](ACCOUNT_LIFECYCLE_REPORT.md).
Remaining account work includes actual email delivery, verified ownership changes,
permanent deletion and Google linking; full parent acceptance remains open.

## Private account download published — September 9, 2026

Account settings now offers a password-confirmed private JSON download, bound to
the current active session through a one-minute authorization. Explicit fields
exclude credentials and unrelated private church/support data; oversized exports
fail without returning a partial file. Suspended sessions also cannot change
passwords. All 96 isolated service/HTTP checks, lint and final production
build/type/runtime traces passed. Actual local browser preparation/save, inspected
file content, wrong-password/expiry feedback and 320/390/1440px reflow passed.

See [ACCOUNT_DATA_REPORT.md](ACCOUNT_DATA_REPORT.md) for scope, bounds and evidence.
Application `19c5850b931fd75ce4ea365206c654fc79c3ddff` is published on READY
deployment `dpl_ChL5CKaPNJSvz3jxJpMhk7XgzsLy`; the exact SHA/canonical alias and
11 live route/anonymous export checks passed. The broader list remains active, with
email activation, account lifecycle/ownership and remaining product work open.

## Account delivery integration published — September 9, 2026

The Resend adapter and post-response account delivery are implemented on
`codex/account-delivery`. All 91 isolated service/HTTP checks, lint, production
build/type/runtime traces and migration/restart checks passed. Requests remain
neutral; failed sends invalidate only the new grant; suspended accounts cannot
request or consume grants. No schema or dependency change was needed.

**Actual recovery email remains disabled:** production has no configured
transactional sender/key. Real sender verification and authorized inbox receipt
are still required. See [ACCOUNT_DELIVERY_REPORT.md](ACCOUNT_DELIVERY_REPORT.md)
for exact behavior, activation steps and the distinction between provider mocks,
local sink evidence and real delivery. Full account/Google acceptance remains
open. Application `5fc6d3fea4975655067687ee4bdf832edd178445` is published on READY
deployment `dpl_J11qS8MCY126MTQc7DGoX1zc9o5C`; exact SHA/canonical alias and
15 live route/anonymous API checks passed. No actual email was sent.

## Account session controls published — September 9, 2026

The owner-only active sign-in list and password-confirmed revocation of other
sessions are published from `codex/account-sessions`, application commit
`b792f500f4b0f6c9984e1526b4ccab2abd206288`, on READY production deployment
`dpl_Dow1e3xE9fhRV1eQk6d77vZDAjHM`. The exact Git SHA and canonical domain alias
were verified. Ten live route/anonymous API checks passed; the deployment-scoped
error query returned no matching entries. The 85-test isolated harness
and an actual two-browser fictional-session flow passed, including next-request
rejection for the revoked browser and continued access for the retained session.
See [SESSION_CONTROLS_REPORT.md](SESSION_CONTROLS_REPORT.md) for scope and limits.
This bounded slice does not complete the broader account recovery/Google work.

## App entrance published — September 9, 2026

The tested entrance was authorized for immediate publication and is now live at
https://godschurches.com. Commit `b0b7aab404b3d947267844e7ec73537dc81e1989` is on
main and deployment `dpl_J4D1fjzPS8zMSxgzazWStF3EVvQr` is READY. The exact Git SHA
and canonical alias were verified, followed by 30 passing live HTTP checks and
browser navigation/phone-width public-page checks. Remaining account/Google and
broader acceptance work continues separately. See the publication section of
[ENTRANCE_REPORT.md](ENTRANCE_REPORT.md). The local checkpoint below predates this
explicit release instruction.

### Local entrance verification checkpoint

The app entrance and waitlist retirement are implemented and verified locally on
`codex/app-front-door`. Root and old confirmation links lead to Home; old join
links lead to account signup; retired submissions and tracking return 410 without
writes. Public About/Help, navigation, metadata and service information match the
current application. Accounts and historical records are preserved.

All 78 isolated service/HTTP checks, final lint/build/type/runtime-trace checks,
and browser reflow checks for five routes at 320/390/1440 px passed. Browser scope
was anonymous local navigation; authenticated checks used the HTTPS harness.
The live site was not changed. Account/Google and applicable mobile/support gates
remain open. See [ENTRANCE_REPORT.md](ENTRANCE_REPORT.md) for actual evidence,
serving identity, limitations and the next account-foundation slice. The published
design and account reports below remain historical release evidence.

## Official platform design, September 2026

The owner approved the attached direction for the real platform, superseding the
preview-only proposal. See [DESIGN_IMPLEMENTATION_REPORT.md](DESIGN_IMPLEMENTATION_REPORT.md)
for scope, behavior, verification, publication, and remaining limitations. Account
security and private church/support boundaries from the preceding release remain
in force. The official interface is published at https://godschurches.com/platform.
The marketing landing page and production data were preserved. Local checks passed
(74 service/HTTP, 16 account browser, 15 design browser, 3 preference/contrast),
plus the production build and 39 HTTP/48 browser live smoke checks. The linked
report identifies the exact tested application commit and serving deployment.


<!-- ACCOUNT_REPAIR_CURRENT_BEGIN -->
## Account repair, September 8, 2026

**Published and verified on https://godschurches.com.** Application/tested commit:
`f3b2fe11ceaa1092bafc43f733e5e512c21fb027`. Vercel deployment: `dpl_6mY9kQiTvcp17hjxppr8H6JigQ3G`, READY at
2026-09-08T23:40:36.380Z. The canonical alias matched this exact deployment when checked at
2026-09-08T23:45:11.049Z. See ACCOUNT_TEST_GUIDE.md for the distinct signup/sign-in pages.
A report-only follow-up commit may redeploy the same application code; the IDs here
identify the release on which the controlled real-account test was performed.
This account repair supersedes the account status in the historical reports below;
Stage 2C support features are preserved, not expanded.

Confirmed defect: all registration P2002 conflicts were swallowed. Reproduced over
isolated production HTTPS: unique signup 200 with insertion and login 200; taken
public username plus fresh email 200 without insertion, then login 400. The live
inventory contained one legacy passwordless account. It is preserved. Protected
recent runtime logs did not establish Andrew's exact attempt; browser validity and
other failures cannot be retroactively inferred from a generic error screenshot.

Public handles now get explicit invalid/taken guidance (409 for taken), including
race and ambiguous unique-target rechecks independent of private email linkage.
Duplicate private emails remain neutral, insert-only, without overwrite, a created
flag or a session. After submission a distinct sign-in view retains only email in
short-lived page state. Existing accounts never receive a password through signup.
No email verification, church appointment, or sender is needed for ordinary new
signup/login. Recovery/verification delivery remains disabled and is stated plainly.

Forms have stable distinct IDs, POST methods, labels, email autocomplete=username,
public-handle separation, current/new-password hints, show/hide and FormData autofill.
No reset before successful navigation, no automatic retries and no credential app
storage. Profile edits are session-owned, explicitly validated, reject forged IDs,
and give visible failures. Optional new profile fields start empty. Privacy and
existing credentialVersion/password-change/logout protections remain intact.

74 automated service/HTTP checks passed: the previous 67 account/portal/support
regressions plus six focused production-HTTPS checks and one actual new-server-
process persistence check. Fresh/upgrade migrations, synthetic full restore,
production builds and runtime trace guards passed with unchanged schema/lockfile.
The browser flow passed 16 checks with the full Chromium binary: 320/390/1440px,
validity without request, event-free autofill, profile reload/new tab, browser-process
restart, private HTML/RSC, logout and fresh sign-in. Actual password-manager vaults,
physical devices, Safari, Samsung Pass, biometric and sync behavior are not verified.

Current encrypted PG17 production backup was decrypted and restored locally with
account/content fingerprints matching production; the restore server is stopped.
Exact-ID cleanup removed only the May 10 Test post, its comment reading Test, and
one same-owner reaction. Before/after account fingerprints match; one existing
account remains. No account, contact, church, support record, privilege or password
was changed. Private backup/manifest evidence is ignored under .account-test/account-repair;
no IDs, emails, hashes, cookie values, credentials or connection strings are in reports.

Session policy is unchanged: 30-day finite DB session and host-scoped persistent
Secure/HttpOnly/SameSite=Lax cookie. The browser must retain cookies. No Remember-me
checkbox, second session store, authentication bypass or new dependency was added.
Production origin remains https://godschurches.com, Node24/2048MB account API/60s,
8 existing migrations, SUPPORT_INTAKE_ENABLED=false, ACCOUNT_DELIVERY_MODE=disabled.
No blind rollback to pre-credentialVersion code is safe.


### Production outcome

One controlled disposable, unprivileged account was created through the real browser
form. PostgreSQL insertion and a non-null compatible password hash were confirmed
privately. Email stayed unverified and optional profile fields started empty.
Signup 200, sign-in 200, profile save 200 and fresh sign-in 200 were observed through
the actual production boundary. The same profile survived full reload, new tab,
actual Chromium process close/reopen and logout/fresh sign-in. HTML/RSC and application
storage checks did not expose its email, password or raw session token. A simulated
DOM autofill without input/change events successfully submitted through FormData.
The test completed at 2026-09-08T23:41:32.154Z; no external email or public post was sent.

Exact-ID cleanup then removed that repair-owned account and its one remaining
session after checking row state and all foreign-key dependencies. The existing
account fingerprint still matched the pre-test value. Final real data: one preserved
legacy account, zero posts/comments/reactions and eight migrations. Four post-cleanup
feed/search/profile checks passed, including zero public profile posts and no search
result for the removed verification account. The read-only fixture demo remains.

The separate live smoke run passed 39 public HTTP checks and
36 Chromium route/width checks for existing demo, portal, support,
login/recovery, guards and privacy. The controlled live account journey passed 16
browser checks. No browser JavaScript errors. Production diagnostics returned safe
ACCOUNT_VALIDATION/400 and ACCOUNT_ORIGIN/403 with random reference IDs. Local tests
also cover durable 429 and safe configuration/database 503 behavior. Recent protected
log retrieval alone did not identify Andrew's historical failure; successful live
creation is not proof that a preserved passwordless account can now sign in.

Canonical HTTP-to-HTTPS redirects return 308. Only the apex godschurches.com is
attached to this project; www is not a configured alternate origin. Exact-origin
checks were not relaxed. The existing Neon production target has eight completed
migrations; deployment reported no pending migrations. Runtime outputs confirm
Node24, 2048 MB and 60s for the account API and RSC counterpart. Actual Linux trace
checks passed: 49 traces, 3544 entries, 114 server JS files, no Prisma config loader.
No database, dependency, provider or schema migration was needed for this repair.

### Limits and next secure step

Existing passwordless accounts still require verified ownership recovery or a
separately reviewed owner-specific process. No unauthenticated claiming, silent
password overwrite, verification shortcut or account deletion was added. Recovery
emails remain disabled; do not promise them or repeatedly register the same email.
For a new-account check, use an unused public username and an unused email you control.
Andrew's old account is preserved unchanged. Actual password-manager Save/Update/Fill,
Apple/Safari, Samsung, biometric and sync behavior require the manual guide; this is
not a security certification or approval to open real church/support intake.

### Reproducibility

Run the existing Node24 `npm run test:support` harness for all 74 service/HTTP
checks, actual production-server restart, fresh/upgrade and restore checks. It uses
isolated loopback PostgreSQL and a verified local TLS certificate. No production
account or email sender is involved. `scripts/check-account-browser.mjs` exports
`checkAccountBrowser` for the isolated fixture preview, requires Playwright and a
full Chromium binary, and accepts a private output directory and fixture identity.
PLAYWRIGHT_MODULE and CHROMIUM_PATH can point to a local test installation; the bundled
runtime is the default here. Its certificate pin is local-only. Headless Shell was
not used to claim persistent browser-cookie behavior. Private helper scripts and
credentials are not committed. No actual password vault is accessed by this helper.

Browser implementation guidance checked against primary documentation:
[Sign-in form best practices](https://web.dev/articles/sign-in-form-best-practices)
and [HTML autocomplete](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/autocomplete).

<!-- ACCOUNT_REPAIR_CURRENT_END -->


<!-- STAGE_2C_CURRENT_BEGIN -->
## Stage 2C current status (September 8, 2026)

**Published:** ordinary private support code and a fictional, read-only demonstration at the existing godschurches.com project.

Application SHA: 9177e86d8fde78db8ff5a50c7e8633b46900dc32. Vercel deployment: dpl_26z5tg2wEr8K6gAdS2xTJ4U6hY2e, READY at 2026-09-08T22:45:25.238Z. The canonical godschurches.com alias independently resolves to this deployment. Live verification finished 2026-09-08T22:46:45.832Z.

**Real new-case intake remains unavailable.** Production SUPPORT_INTAKE_ENABLED=false;
no real eligible RESPOND grant or approved SupportIntakeSetting has been created.
Andrew is the only confirmed operator, but a display name or founding role does not
appoint an account. ACCOUNT_DELIVERY_MODE=disabled remains unchanged. No real email,
fixtures, church appointments, member imports, case redactions or purchases occurred.
Code publication and a public demo are not approval for a real-member church pilot.

Verified candidate: Node 24.20.0, Next 15.5.25, Prisma/Client 6.19.3; unchanged lockfile.
67 real-service/HTTP checks pass (18 account, 26 portal, 23 support), plus fresh
migrations, actual Stage2B-to-2C upgrade, synthetic full restore, production builds,
dev-renderer guards, lint and TypeScript. Chromium: eight support journey groups
and 13 existing account/portal/demo groups; 1440px, 390px and 320px checks, keyboard,
no horizontal overflow or page errors. These are emulated browser widths, not physical
iOS/Android or screen-reader certification. Authenticated mutations use isolated
fictional actors, not production accounts. Live: 39 HTTP checks and 36 browser groups passed, no demo mutations or page errors.

Fresh protected real backup release-2026-09-08T22-39-07-914Z was restored from the encrypted artifact
using PostgreSQL17. Its exact candidate migration rehearsal preserved all 17 existing
tables' full-field fingerprints. One additive production migration completed at 2026-09-08T22:44:02.032Z; eight migrations are now complete, without verification backfill, support fixtures or grants.

See SUPPORT_OPERATIONS.md for the authorization/transition/provisioning and redaction
contract, SUPPORT_POLICY_REVIEW.md for concrete unapproved notice facts, and the current
QA/deployment sections here for limitations. Earlier dated sections below are historical
and do not override this explicit build-and-publish instruction or the current result.
Stop after 2C. Recommended next bounded stage: real verification/recovery delivery,
verified operator/church provisioning and operational/policy approval, not more demos.

### Implemented support slice

Eight new support models: Case, Message, CoordinatorShare, Read, Operation, AuditEvent,
CapabilityGrant and IntakeSetting. Four ordinary categories and five case states;
feature decisions remain separate from support resolution. No general messaging,
attachments, pastoral records, allegations, AI triage, anonymous intake or notifications.

Private service projections and HTTP/HTML/RSC enforce requester, one current assigned
RESPOND owner and at most one deliberately shared eligible coordinator. ASSIGN alone
gets only opaque unassigned routing metadata; REDACT additionally requires ownership.
Role/category, public contact title and church membership never imply case authority.
Versioned grants and shares, revocation hooks, case versions, transactions and actor-bound
HMAC retry receipts prevent stale writes or renewed grants from reviving old access.
An unassigned reopen stays unassigned even if the intake default changes; assignment
requires its own explicit audited handoff. Requester history survives leaving its fixed
church context. The global pilot transaction gate is not a load-tested large queue.

Real platform copy says Create an account and that early-preview account/post data is
saved. Landing design and deferred search correction are unchanged. New private routes:
/platform/help/new, /requests, /inbox, /routing and /cases/[caseId] beneath /platform/help;
API /api/platform/support. Public fixture-only routes are /platform/demo/support-requests,
/platform/demo/support-case and /platform/demo/support-inbox; no login or live state.

<!-- STAGE_2C_CURRENT_END -->

## Earlier dated records (historical)

<!-- RELEASE_STATUS_BEGIN -->
## Published release (September 8, 2026, America/Chicago)

The actual account foundation and Stage 2B church portal are published together at
https://godschurches.com/platform. A persistent, signed-out, fixture-only tour is
available at https://godschurches.com/platform/demo. The original landing/feed remain.

Application SHA: 7679e034b93e3a905a7bee92ac6f5c377c2ce42d.
Vercel deployment: dpl_GnAHFqqiDBzheEh6j6ohL4G1P21R, READY; canonical alias confirmed.
Published September 8, 2026 at 16:10:07 CDT (21:10:07 UTC).
This current section supersedes the historical local-only/no-deployment statements
below; it does not retroactively change their results or remove real-member gates.

The user explicitly included routine publication in this and future authorized
build stages unless they say otherwise. Stop before the next feature stage.
No purchases, member imports, email/invitations, real church appointments, auth
bypass or destructive production data changes were performed.

Verification: 44 isolated account/portal tests, five demo fixture tests, lint,
types, fresh/upgrade migrations, production builds, encrypted real backup restore
and upgrade rehearsal passed. Actual local Chromium: 13 journey groups including
320px keyboard/mobile. Live: 28 HTTP checks and 27 browser checks, no page errors
or demo mutation attempts. Two additive production migrations applied; seven
complete. Linux build traces exclude the Prisma configuration-loader request path.
Account/portal functions: Node24, 2048MiB, 60 seconds; hashing was not weakened.

Published is not pilot approval. Real recovery/verification delivery is disabled;
operator identity/provisioning, real church/reviewer appointments, independent
security/privacy review, policy/retention and independent concern routing remain.
No email was silently verified and no demo data was inserted into production.
An actual owner-authenticated production journey was not exercised. Comprehensive
mutation/concurrency tests used isolated fictional records, not live accounts.
See DEPLOYMENT_REPORT.md for exact URLs, evidence, availability and recovery limits.

The application remains the SHA above. Post-verification report changes are a
local documentation-only successor, not a different published application release.

<!-- RELEASE_STATUS_END -->


## Current: Stage 2B local portal (September 7, 2026 local)

This section supersedes the historical inventory below. Branch
`codex/church-portal` continues `9b6a5a0` and preserves account commits `f027758`
and `e8b370c`. Stage 2B implementation commit: `9e927f6`, local only. All 42
automated tests plus migration/restore/build checks pass; browser/device checks
remain blocked by the locked Mac. The user explicitly authorized Stage 2B,
not publication, production reads/migrations, real email, or ordinary support cases.
Production SHA remains unverified. Nothing in this report describes the live site
as patched or ready for private church use.

Implemented locally:

- Reusable Church records; explicitly provisioned operator capabilities;
  church-scoped reviewer and coordinator-appointment grants; minimal audit events.
  Account categories, following, Basic Auth, and contact titles confer no authority.
- Verified contact plus `adult-preview-v1` acknowledgment for private participation.
  Existing accounts are not backfilled as verified/adult. No birth dates or IDs.
  Suspension checks are integrated into login, locked session creation, and every
  session read. Account security from Stage 2A remains intact.
- Discovery, requests, My church, withdrawal, scoped approval/decline, leave/remove,
  and explicit re-request. A combined partial unique index permits only one row
  per person in either PENDING or APPROVED, not one of each. Following is independent.
- Version checks, transaction-scoped authorization and audit writes; self-review
  and cross-church decisions denied. Revocation is evaluated against current DB
  state in old sessions. Leaving preserves accounts and public content.
- Separate opt-in directory name; optional contact email and phone default ONLY_ME.
  Login email is never copied. Same-church approved eligible people may view without
  listing themselves. Fields are projected on the server, not hidden in the browser.
  Leaving/removal clears preferences and related grants/appointments. Rejoin needs
  new approval and consent; old appointments are not restored.
- Primary/backup Church Connection Coordinators and a distinct Godschurches
  relationship owner. Titles do not grant approval or directory access. Unassigned
  slots say setup pending. Direct published email remains available; no internal
  phone, invented staff, response promise, or independent responder is published.
- One application shell with Godschurches branding, mobile bottom navigation,
  labeled forms, pending/conflict/error/denied states and scoped review links.
  Marketing layout remains separate. Signed-in feed introduction remains hidden.
- All platform routes/API responses are private/no-store/no-referrer/noindex;
  platform tracking is disabled. Marketing analytics accepts only known paths and
  no arbitrary label/referrer. No directory search, export or public affiliation.

New routes: `/platform/churches`, `/platform/churches/[churchId]`,
`/platform/my-church`, `/platform/my-church/sharing`,
`/platform/churches/[churchId]/directory`, `/platform/churches/[churchId]/review`,
`/platform/help`, `/platform/operator/churches`, `/api/platform/portal`.
Services are `lib/platform/portal.ts`, `portal-boundary.ts`, and `portal-types.ts`.
UI modules are `components/platform/portal-*`. Additive migration:
`prisma/migrations/20260908032000_church_portal/migration.sql`.

`lib/platform/portal-session.ts` keeps credential access in a server data boundary.
Because the installed development Flight debugger serializes awaited I/O values,
new portal pages show a static notice before private reads outside production.
The local portal preview therefore uses a production build behind isolated HTTPS,
not the development renderer. Real email stays disabled in that server.

Dependencies: Next/eslint-config-next 15.5.25, Prisma/client 6.19.3, targeted
compatible transitive fixes. One remaining advisory appears as three high package
entries: GHSA-ggr8-5vv4-36mx in deepmerge-ts 7.1.5 via Prisma config. See
DEPENDENCY_REVIEW.md for named advisories, sources and reachability limits.

Evidence and exact final run status are in QA_REPORT.md and PROGRESS.md. Browser
checks are a distinct gate, not inferred from HTTP or compilation. Local generated
fixtures, sink records and credentials remain ignored under `.account-test/`.
The unrelated `docs/ai-assisted-investing-workflow.md` was not read or changed.

Release gaps: real recovery sender, independent concern route, actual church/operator
authorization, policy/retention facts, independent security/privacy review, real
backup/restore and deployed-version verification. Wider search-category correction,
ordinary support cases, policy publishing and calendar remain deferred.

## Historical inspection and Stage 2A evidence

Inspection: September 7, 2026 (local system date). Stage 1 only.

## Evidence and source

- Root: `/Users/awmccuen/Documents/New project`.
- Branch: `main`; HEAD `68b4190f83b6833251dcf1dd664804117ef4c930` (Add platform account settings).
- Remote: `https://github.com/LifEXPAdmin/church-landing.git`. Read-only `git ls-remote origin refs/heads/main` returned the same commit.
- No AGENTS.md found in the repository, searched parent project tree, or ancestor paths through filesystem root.
- Pre-existing untracked `docs/ai-assisted-investing-workflow.md` is unrelated and was not read or changed. No tracked changes existed at inspection start.
- Read all 17 sections and the final marker of the supplied build brief, release 1.0.0, plus the complete inspect-and-plan prompt. The brief dates its observations September 8, one day after the local date. Preserve those as supplied observations, not a new verified inspection date.
- The numbered prompt authorizes inspection and documentation, not product implementation or deployment. The brief's future behaviors are requirements/proposals, not evidence of existing functionality. Model-selection preparation text is not a product requirement.
- The optional living master, start-here document and stage 2/3 prompts were not supplied. No claim is made to have read them.

## Stack and deployment

Installed: Next.js 15.5.12 App Router, React 19.2.4, TypeScript 5.9.3, Prisma 6.19.2, Tailwind 3.4.19; npm/package-lock.json. Radix Slot and local UI components, not a complete installed shadcn component suite. Node crypto scrypt backs passwords; opaque database sessions back authentication. PostgreSQL is the schema provider. Historical user deployment logs identify Vercel and Neon, but current production configuration and deployed SHA were not accessed.

`package.json` has dev/build/start/lint and Prisma commands; no test script, test fixtures, CI workflow or test framework found. Five migration directories cover waitlist, analytics, platform, engagement, and password sessions. `next.config.ts` only enables strict mode. No tracked vercel.json or local .vercel linkage was found. README documents Vercel deployment. `scripts/prisma-deploy.mjs` loads Next env and supplies DIRECT_URL fallbacks before invoking migrations; `build` does not run migrations. Current Vercel dashboard command remains unverified. The wrapper omits DATABASE_URL_UNPOOLED and may fall back to a pooled address. It does not itself fill DATABASE_URL from POSTGRES_* the way `lib/prisma.ts` does.

Public URL in the brief: https://godschurches.com/platform. The web tool could not open it or the two search URLs (safe-open error). No live browser mutation or database query was performed. Matching GitHub HEAD proves source synchronization, not deployed-version identity. Runtime tests below are not implied by the earlier conversation's reports of successful posting.

## Routes and server boundaries

- Marketing: `/`, `/manifesto`, `/for-users`, `/for-churches`, `/for-creators`, `/for-businesses`, `/join`, `/thanks`, `/privacy`, `/terms`, sitemap and robots.
- Platform: `/platform`, `/platform/login`, `/platform/search`, `/platform/settings`, `/platform/profile/me`, `/platform/profile/[username]`.
- Admin: `/admin/waitlist`, `/admin/waitlist/export`, `/admin/analytics`; middleware protects these with shared Basic Auth, not platform capabilities.
- APIs: `/api/health` returns static ok (not a DB health test); `/api/track` accepts analytics writes.
- Social writes: `app/platform/actions.ts` server actions, direct Prisma calls. Identity: `lib/platform/session.ts`; hashing: `lib/platform/auth.ts`. Reads live in page modules, with shared server-rendered `components/platform/*`.
- Waitlist writes: `app/join/actions.ts`; MailerLite in `lib/mailerlite.ts`. Database success can coexist with failed email sync, which is caught/logged without a durable retry queue. `lib/email.ts` contains an unused Resend notification helper, not evidence of active delivery or password recovery.
- No jobs, uploads, church APIs, private messaging or background worker were found.

## Feature inventory and OBS mapping

Implemented below means source exists; behavioral verification is explicitly separate. No simulated social repository was found.

| Observation | Evidence in source | Status this inspection |
|---|---|---|
| OBS-01 preview/feed | app/platform/page.tsx; PlatformPost and PlatformUser | Implemented, builds; runtime untested |
| OBS-02 post/comment/reaction | components/platform/post-card.tsx; actions.ts create/delete/toggle; three relational tables | Implemented, runtime untested; no real records copied |
| OBS-03 profile | app/platform/profile/[username]/page.tsx and profile/me/page.tsx; updatePlatformProfile | Implemented, runtime untested; public bio/location/website/interests |
| OBS-04 text search | app/platform/search/page.tsx: contains on content/scripture, people name/username/bio | Implemented, runtime untested |
| OBS-05 Testimony mismatch | Same query omits PlatformPost.type; format.ts supplies display label | Source confirms mismatch; live reproduction unavailable |
| OBS-06 accounts | login/page.tsx, actions.ts, auth.ts, session.ts; PlatformUser/PlatformSession | Implemented with defects below; recovery missing |
| OBS-07 double navigation | app/layout.tsx renders SiteHeader; PlatformShell renders second nav | Confirmed in source; also nested main landmarks |
| OBS-08 large intro | app/platform/page.tsx conditional on !currentUser | Visitor intro present; already hidden for signed-in users |
| OBS-09 privacy | app/privacy/page.tsx | Waitlist-focused February policy; accounts/private church features not covered |
| OBS-10 terms | app/terms/page.tsx | Waitlist purpose and promotional consent language need review |
| OBS-11 churches | app/for-churches/page.tsx marketing route; no church model | Organization setup/review/connection functions missing, not hidden behind auth |
| OBS-12 design | platform-shell.tsx, post-card.tsx, app/globals.css; root Google fonts | Dark/gold source styling; responsive behavior not browser-tested |
| OBS-13 branding | app/layout.tsx, platform-shell.tsx, metadata, header/footer | Church display label persists; Godschurches direction requires targeted edits |

Follows use PlatformFollow unique pairs and upsert/delete actions. Signed-in feed is own posts plus followed users; logged-out feed is newest public posts. No interest ranking exists. Posts remain globally public through search/profiles. Church connection requests, scoped capabilities, directory consent/contact fields, representative assignments, ordinary support cases, moderation/reporting and account suspension are missing. The CHURCH/BUILDER enum values are presentation categories; no platform privilege branch currently checks them. Runtime forged-role denial still needs testing.

## Safeguards and concrete gaps

1. **Account ownership, high priority:** actions.ts:55-74 allows password assignment to a passwordless legacy account on matching email and username alone. Neither proves ownership. README endorses this unsafe path. The number of affected accounts is unknown; do not query/reset them during stage 1.
2. **Session recovery:** changePlatformPassword updates the hash but leaves all sessions valid. Logout deletes only the current session. Sessions expire after 30 days; reads check expiry in the DB. No reset tokens, verified email, suspension flag, logout-all or throttling. Login errors distinguish nonexistent/passwordless users, allowing enumeration. Login password input has no server maximum before scrypt.
3. **Hashing:** built-in scrypt with random salt, timing-safe comparison and hashed random session tokens is real, but no security verification is implied. Keep legacy verification compatible; review explicit resource parameters and a maintained implementation when building. Do not invent a new algorithm or force-reset stored hashes.
4. **Authorization:** writes require getCurrentPlatformUser; deletes constrain authorId and profile updates target current user. No church authority exists. Basic Auth admin must not be reused as scoped church authorization. No recovery or privileged reauthentication flow exists.
5. **Projection:** reads include whole PlatformUser rows (including passwordHash/email) into server components. These components are not client components, so this is not evidence of a proven browser leak. Explicit select/DTO boundaries and payload tests are required before adding private fields or client components.
6. **Caching/CSRF:** feed/search/profile are force-dynamic; identity uses React cache. No persistent private cache observed. No custom cross-origin override found in Next config. Server actions and SameSite=Lax are mechanisms, not an executed CSRF test. Verify Origin/Host behavior on the installed version before release. Revalidation currently mostly targets feed/profile.
7. **Search/data races:** query length unbounded; people order unspecified; post order lacks unique tie-breaker. Reaction read-then-create/delete can race despite unique index. Profile posts/likes unbounded; comment count is length of six fetched rows, with only three rendered. Website values are not restricted to http/https. Names/interests lack complete length bounds.
8. **Privacy/analytics:** global AnalyticsTracker covers platform paths; API records referrer, user agent and hashed IP. New church/case identifiers must not flow into general analytics. API input length/type bounds and default salt need tightening. No consent/recovery email delivery verified. Current policy does not implement adult-only eligibility.
9. **Accessibility:** auth/settings/search/comment inputs rely on placeholders; reaction button has only count text, no descriptive accessible label or pressed state. Layout has nested main. Mobile bottom navigation exists, but keyboard/mobile/contrast testing has not run.

## Baseline checks

| Check | Result | Limits |
|---|---|---|
| git status/log/remote and ls-remote | Passed | Remote main equals local HEAD; production SHA unknown |
| npm run lint | Passed, exit 0 | No behavior tests |
| npm run build with DATABASE_URL and DIRECT_URL overridden to dummy loopback port 1 | Passed, exit 0; compilation, types, 21 static pages | Does not exercise dynamic DB paths; existing .env loaded but DB targets overridden; no migrations run |
| Build warning | Nonfatal | caniuse-lite seven months old; no update installed |
| Public platform/search via web tool | Blocked | Safe-open errors; no live result claimed |
| Automated integration/auth/migration/restore/mobile tests | Not run | No existing harness/fixtures or verified isolated database; no framework installed |

No application code changed, dependency installation, live signup, email, migration, deployment or publication occurred.

## Stage 2A update (September 7, 2026 local)

The attached 06_Prompt_2A_Account_Security.txt authorizes bounded local account
implementation and tests. It does not authorize publication, production reads,
real email, or church features. The full source baseline above remains historical.
Implementation branch: codex/account-security, based on 68b4190. Local commit
f027758 independently closes legacy claiming and corrects its README/UI guidance.
Full account foundation is committed locally as e8b370c, with no push/deployment.

Implemented account foundation:

- Registration is insert-only. Duplicate registration has a consistent response
  and cannot change name, category, hash or sessions. New registrations require
  normal login; there is no implicit claim or auto-login path.
- New `/api/platform/account` POST boundary delegates to actual Prisma services
  in `lib/platform/accounts.ts`. It validates trusted origin and JSON/body/input
  bounds, applies persistent global/IP/subject limits, and returns no raw grants,
  password hashes or authentication contacts. Session token is issued only in an
  HttpOnly SameSite cookie.
- Existing scrypt hashes remain usable. New hashes use Node scrypt N=131072,
  r=8,p=1 with explicit 160MiB maxmem. Existing 8..128 UTF-16 character limits
  remain, including Unicode. Login input is bounded before expensive work.
- Credential version and user row locks serialize session issuance, password
  changes and grant consumption. Successful change/reset increments version,
  invalidates all prior sessions and outstanding grants, and requires login.
  Wrong passwords and merely requesting recovery do not revoke access.
- Separate RESET_PASSWORD and VERIFY_EMAIL grants: 256-bit random token, SHA-256
  stored representation, 30-minute expiry, atomic single consumption. Reset does
  not silently count as email verification. Existing emailVerifiedAt is NULL.
- Local-only file delivery sink is verified; production mode rejects that sink.
  Real delivery has no enabled adapter yet and remains blocked. This is distinct
  from working waitlist marketing integration.
- Recovery links use URL fragments, which are not sent in HTTP requests. The
  client clears the fragment; only explicit POST consumes it. Recovery responses
  are no-store/no-referrer/noindex, and recovery paths are excluded from general
  analytics. No public debug mailbox or token-returning endpoint exists.
- Feed/search/public-profile queries now explicitly select public profile fields;
  the session read projection excludes login email/passwordHash. Existing public
  content and signed-in introduction behavior are preserved.
- Account forms have persistent labels and useful errors. Broader navigation,
  search-category, policy and church changes remain deferred.

A concrete Next Server Action denial-of-service advisory prompted a patch from
15.5.12 to 15.5.21 and matching eslint-config-next. No Prisma major upgrade or
framework replacement. See release documentation for primary sources and remaining
dependency audit limitations.

Final local evidence: 18 service/HTTP checks passed on patched Next, along with
lint, production compilation, fresh migrations, synthetic upgrade and synthetic
backup/restore. Account pages received a limited desktop/mobile visual spot-check;
complete device/accessibility testing and external email remain unverified.
See QA_REPORT.md for exact scope and RELEASE_READINESS.md before any release.
