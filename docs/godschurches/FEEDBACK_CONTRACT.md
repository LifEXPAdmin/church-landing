# Feedback and product follow-up

September 15, 2026 UTC. Implementation in progress; nothing in this candidate is
released. The current serving application is the platform measurement core in
[its acceptance receipt](PLATFORM_METRICS_ACCEPTANCE.md).

## Native intake checkpoint

The first local candidate adds `FeedbackSubmission` to one canonical private
support case in the same transaction and exposes a private feedback boundary.
Rating-only, text-only, bug and suggestion inputs share native stable receipts;
My-feedback queries filter their owned source before pagination. Contact/channel,
reviewed-idea and attribution choices are separate and versioned. Staff questions
require contact permission. Source metadata participates in owner export,
redaction and erasure.

Whole-case redaction now has a distinct recovery outcome from an unrelated admin
metadata edit. Replay clears the immutable original case text and feedback even
when a newer admin marker arrives first; later replies/resolutions remain separate.
Earlier ordinary admin controls keep their original narrow meaning. This repairs a
source privacy gap within this feature; it is not a production redaction action.

Six new native/HTTP scenarios and six retention scenarios pass. The previously
run ten admin and seventeen support scenarios also pass. Final types and focused
lint pass. Initial server-only test import and control-payload assertion failures
are preserved with their corrections. Two new migrations reach only the
isolated fixture, from 69 to 71. The notice version is retained with each receipt.
Selected-message redaction has a content-free recovery control and preserves a
newer resolution, including after repeated replay. No production schema, feature setting, account,
case, grant, consent or outbound delivery has changed for feature 31.

The foundation is checkpointed for continuation, not complete feature acceptance.
Forms, selected private attachments, durable prompt claims/preferences, reviewed
public ideas, subscribed delivery, digest/report integration, full lifecycle and
browser/release acceptance remain in this same feature cycle.

## Existing owners and required boundaries

The voluntary form and My feedback pages are now connected locally through the
native request/retry component and the owner-checked API. Menu and Help link to
them; account entry preserves only their validated destination. Ratings, bug and
suggestion fields, reviewed coarse context and separate choices are included.
Private reads conceal retained forms during access checks; source changes require
review before applying retained entries, and unconfirmed requests keep their
original key and payload. Staff cannot request a response with contact permission
off. Twenty-five focused intake/navigation checks, types and focused lint pass.
These are source checks, not browser or release acceptance. Private attachments,
the rest of the feature cycle and complete browser acceptance remain in progress.

One accepted submission is one existing `SupportCase`. `SupportOperation` owns
the client request key, fingerprint and stable retry receipt; the case transaction
also creates its feedback metadata. Existing requesters, generation-bound support
owners, private replies, status transitions, audit, redaction and protected recovery
remain authoritative. Feedback never becomes a moderation report or church claim
implicitly. Menu and Help will route those intents to their existing services.

The permanent form accepts general feedback, a bug or a suggestion. Ratings are
optional integers from one to five; meaningful text alone is valid. A rating-only
submission creates an honest receipt. Bug expected/actual/steps and suggestion
outcome/helped audience remain ordinary private case text. Optional technical
context has only a declared product version, coarse browser/device and a bounded
safe error reference. No URL, page text, automatic screenshot or raw user agent is
accepted. Contact permission, channels, permission for a reviewed idea summary,
and public attribution are distinct choices, off by default.

Existing support intake availability and recipient/notice generation checks remain
in effect, with a separate feedback activation flag. Engineering uses isolated
fixtures while actual operator readiness stays explicit. The new shared intake
contract does not depend on completing the later operational acceptance task.
An unavailable intake never claims a saved receipt or displays an automatic prompt.

## Feature cycle

Finish the native intake and private receipt contract, then its Menu/Help forms,
recoverable unsent state and permission-bound selected-image attachments. Extend
the existing private image processing/storage/garbage lifecycle; never expose a
case attachment through a member photo library or public derivative. Existing
support has no case attachments today, so merely linking its current form is not
completion of this requirement.

The prompt uses the released measurement contract: seven-day account age, three
eligible sessions separated by thirty minutes and one current ordinary action.
Reliable current opt-in coverage is required; prayer acknowledgments are excluded.
Use one current account-wide claim across campaign versions. An expiring
reservation is not an exposure; a visible sheet confirms its stable exposure key.
Dismissal suppresses thirty days, response ninety days, and never-ask persists
across devices and campaign changes. Concurrent changes preserve the strongest
suppression. Quiet navigation excludes onboarding, recovery, prayer, reading,
editing/uploading, errors, other dialogs and unfinished forms, with restored focus.

The public board stores a separate reviewed summary, with private source links
and current explicit publication consent. Attribution is separate. Votes are
unique per eligible account and removable. Merges preserve private receipts and
subscriptions, deduplicate votes, and expose only the public destination. Released
status requires a real versioned release entry. Publication, reversal and source
privacy changes must be audited and rechecked at read/delivery time.

Follow-up uses existing activity and outbox controls with explicit subscriptions,
channel choices, unsubscribe and stable event keys. It never sends because of a
low score. Fixtures use test sinks only. In-app receipts, stored replies and actual
delivery are separate facts. No automated staff message or task is created.

The admin-only weekly view reuses current case permissions, manual tags and
duplicate groups. It separates messages, cases and distinct people; includes
traceable themes, unresolved bugs and reopened fixes; and provides deliberate
product-review annotations. Shared reports consume real ratings and shown prompt
exposures, separate voluntary submissions, and apply coverage/suppression. The
weekly view is an application feature, not a scheduled assistant automation.

## Acceptance and release

Complete frozen-clock A3 boundaries, concurrent claims/preferences, rating-only
and text-only intake, exact failed retries, removable/failed private uploads,
cross-account/source denials, reviewed/consented publication and merges, distinct
votes, actual release evidence, selected-channel delivery and opt-outs, current
privacy after restore, and narrow/keyboard focus and draft recovery. Reconcile
actual feedback counts into A2 and shared A1–A3. Perform the established production
and HTTPS regression gate, protected upgrade, release/configuration and exact
canonical/live checks before claiming the feature complete. Real provider,
operator and physical-device prerequisites remain separate and explicit.
