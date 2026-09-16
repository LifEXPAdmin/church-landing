# Visible notifications and adult tag review

September 16, 2026. Implementation is in progress; this document is not a release
receipt. Production remains the independently verified feedback release described
in current state. Complete the entire feature before its canonical release.

## Existing owners and completed prerequisites

Reuse Activity, SocialEvent, SocialPreferences, the durable notification outbox and
its bounded fanout. The shared resource registry and gap audit are implemented.
Typed ImageView, MediaAsset, PostPhotoReference and readableAssetWhere already
provide the required photo attachment/source contract. Tags consume that contract;
the broader future cross-feature attachment catalog remains separate and partial.
No new universal permission service, notification engine or image copy is needed.

The shared signed-in header exposes Notifications without changing the five main
destinations. Its scalar count never preloads private source descriptions. Poll
only while foregrounded, clear stale account/path counts, recheck identity around
requests and refresh after read changes. Browser-channel invalidation carries an
account identifier only; focus/polling remain available when that API is disabled.

All/Unread and categories retain the Activity route. Manual unread is a separate
personal reminder, never a reversal of message reads or an old delivery's read
suppression. Mark-all clears reminders only through its captured allocation
boundary. Exact retries cannot overwrite later choices. Source revocation leaves
generic owned history without a name, body, image or destination.

## Source integration

Explicit post mention selections persist in private drafts. Draft save produces
no alert; publication and scheduled execution use current adult consent, bilateral
blocks and source access. A recipient has one canonical mention intent per post,
including after edits/retries. An older client cannot silently drop a saved draft's
selected mentions. Reopened selections resolve current permitted names without
storing a name copy in the draft; current blocks, consent and adult eligibility
also govern this bounded lookup. Existing comment consent behavior remains with
its current owner.

A newly opened church volunteer role creates one bounded fanout through the
existing worker. Eligible current church members must have enabled that church's
bell before the source action. Follow/membership alone, later opt-in, self-actions,
closed/ended sources and current mutes do not grant an alert. The destination
identifies the exact role on the source post. Phone choices remain independent.

## Adult photo-tag contract

Only current verified adult accounts and permitted canonical photos participate.
A current photo manager requests a named adult's review. Pending requests are
private to the requester and recipient, and never an approved public association.
Accept requires current access and the reviewed image version; decline/remove
remain possible without exposing a source whose access was lost. Rejected or
removed requests cannot be retried into approval or repeated using another key.

An approved association requires the viewer's current source access and the
tagged adult's current source access. Preserve the original church restriction
when a source later becomes broader. A tag never grants image/post access or
copies the file. Removal disappears from photo/profile surfaces and notifications;
it does not delete another person's content. Protect removal and restrictive
preferences against restoration of older backups through the existing journal.

Adult request choices, private received/sent review, photo-manager controls,
approved profile associations, export/erasure, current-access event adapters and
initially-off phone choices belong to this feature. Child/family tag controls stay
unavailable behind the separate policy gate.

## Acceptance and remaining external gates

Service/UI integration now includes photo review, manager and profile links, adult
privacy choices, account export/erasure and protected controls. Source descriptions
retain anonymous reaction/prayer behavior; named actors are shown only on consented
friend, mention, message and tag sources. Friend acceptance creates one inviter
alert, never a self-alert. Volunteer confirmations open the exact owned signup,
including canceled or out-of-month reservations, while revoked source details stay
concealed. Signed-out return links discard prior-session actions and cursors.

Source-action-to-center browser checks, safe Back/reload, cross-tab reads,
narrow-screen/text-zoom layout, unavailable/retry and identity changes pass.
[Acceptance evidence](NOTIFICATION_CENTER_ACCEPTANCE.md) records the complete
staged gate, protected upgrade, exact READY/canonical release, live read-only
behavior, unchanged original data, migrations and installed recovery. Required
engineering and release integration are complete. Retain physical-phone and
actual cross-device acceptance separately; family tagging remains unavailable.
No production fixtures or real outbound sends were created for acceptance.
