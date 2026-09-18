# Notification settings: categories, channels and current authority

Settings must distinguish event records, saved conversation choices and delivered
notifications. `SocialEvent` explicitly stores canonical intents without copied
text or recipient preferences; it is not a notification queue. The existing
comment service retains COMMENT_CREATED and COMMENT_MENTIONED source intents and
adds one permission-checked COMMENT_ACTIVITY intent per immediate recipient. The P1 owner
now adds canonical adult message/request/report/founder preferences, authorized
in-app projections, an idempotent device outbox and timezone-aware quiet hours.
The September 15 integration added twelve independent Activity and phone
categories, explicit author bells and current church/commitment outcomes.
September 16 adds Feedback and adult photo tags, for fourteen categories; new
friend outcomes reuse Requests. The complete releases are recorded in
[feedback acceptance](FEEDBACK_WEEKLY_ACCEPTANCE.md) and
[the Notifications center receipt](NOTIFICATION_CENTER_ACCEPTANCE.md).
See [the integration contract](NOTIFICATION_INTEGRATION_CONTRACT.md),
[its acceptance](NOTIFICATION_INTEGRATION_ACCEPTANCE.md) and
[the phone contract](PHONE_NOTIFICATION_CONTRACT.md). Saved preferences do not
grant contact/reviewer authority or establish physical delivery. Optional email supports separately selected feedback follow-up plus independent
Likes and direct-reply consent when each provider/feature gate is enabled. These
email choices start off, apply only to future events and never authorize source
access. SMS, other social email, digests and unrelated source categories remain
unavailable. See [the optional email acceptance](SOCIAL_EMAIL_ACCEPTANCE.md).

| Category | Existing source / sending capability | Current channel and control |
| --- | --- | --- |
| Replies and mentions | Canonical comments and selected mentions, with one immediate recipient intent; `ConversationPreference` retains DEFAULT/FOLLOW/MUTE per owner/post. | Independent opt-in phone categories. Direct replies and mentions appear in Activity. Explicit thread FOLLOW also adds future replies; a separate conversations phone category starts off. MUTE suppresses that thread’s Activity and phone delivery. Current source access is always required. Direct replies have a separate initially-off email choice. A permitted mention takes precedence and uses Mentions, which has no email channel; followed-conversation updates also remain in-app/phone only. |
| Reactions | Canonical desired-state post/comment reactions and private prayer acknowledgments. | Independent Activity and initially-off phone choices. Likes on personal posts/comments also have independent initially-off email consent. Current undo/source access is checked; prayer acknowledgments remain outside the email contract and do not identify participants. |
| Follows and friendships | Canonical follows and consented invitation relationships. | A new friendship uses the Requests category with current relationship access. Following alone creates no alert or notification consent. |
| Messages and contact requests | Canonical adult conversation/request services and shared events. | Independent in-app and optional device push choices. New contact/sending require current reporting coverage; history and settings retain current authority. |
| Report activity | Canonical selected-evidence report/review records. | Separate in-app/push choices; every event and open rechecks current report scope. Scoped intake is enabled after authenticated reviewer appointment and still checks current coverage. |
| Founder announcements | Deliberately previewed/sent canonical founder messages to explicitly selected eligible recipients. | Separate announcement opt-out and optional push category. Personal replies remain independent. Sending requires the currently authorized founder and explicit selected-recipient preview/send. |
| Author posts | Canonical personal and church-authored publication. | Explicit person/church bell, independent of Follow, favorites and membership. Separate Activity and initially-off phone category; current access and source-time consent prevent backfill. Scheduling creates no alert until actual publication. |
| Prayer updates | Canonical prayer updates and explicitly saved prayer follow-up. | Independent Activity/phone preferences and current saved-prayer choice. Current source access, update/opt-in/device dates and withdrawal are enforced. |
| Church connections | Canonical connection, role and direct-capability outcomes. | Independent Activity and initially-off phone choices, with current scope at delivery/opening. Optional choices never hide the actual request or access result on its own screen. |
| Commitments | Changed canonical event occurrences and volunteer commitments. | Independent Activity and initially-off phone choices for currently eligible participants. Current RSVP/reservation and source-time participation apply; no reminder or digest service is implied. |
| Feedback | Canonical private cases and reviewed ideas with explicit per-source follow-up choices. | Independent Activity, phone and optional email preferences, subordinate to current source consent, authority and enabled provider/operating gates. |
| Adult photo tags | Consented adult photo-tag requests and approval outcomes. | Independent Activity and initially-off phone choices; current photo access and tag state are rechecked. Family and child tagging remain unavailable. |
| Exchange, Handoffs, Church Needs, Assistance and Groups | Current canonical saved-search, inquiry/handoff, need/contribution, private assistance and group membership services. | Retain their existing independent Activity and phone categories, source consent and authority. No email channel is added for these categories. |
| Account security flows | `accounts.ts` and `account-email-change.ts` request verification, password-reset or email-change grants through `accountGrantDelivery`. | Transactional email on request, only when the configured provider is available. These are required parts of the chosen account action, not optional social category switches. |
| Security-event alerts | No classified password-change, new-sign-in or other alert outbox. | Unavailable until an essential/optional classification and delivery contract is accepted. Account grant emails do not establish event-alert delivery. |

`account-delivery.ts` supports VERIFY_EMAIL, RESET_PASSWORD and CHANGE_EMAIL with
the current one-use, expiring grants and bounded idempotent provider attempts.
Runtime availability is separate from successful sending, receiving or reading.
The isolated test sink is not production email. Essential account action flows
remain separate from future optional category toggles and must not be disabled by
an invented social-notification preference.

Existing optional waitlist communications retain their separate provider and
unsubscribe mechanism. They are not preferences for platform posts, church
announcements, security notices or messages. No preference is copied between
these scopes.

`notification-preferences.ts` owns the supported categories and channel summary.
It shares the SocialPreferences conflict version and exact social receipts with
contact choices. A separate notification revision scopes protected recovery.
The nineteen categories are messages, requests, reports, founder, replies, mentions,
conversations, prayer, posts, reactions, church, commitments, feedback, photos,
exchange, handoffs, needs, assistance and groups. Legacy clients
cannot erase expanded choices. Protected recovery quarantines unreconciled
notification choices and author bells before delivery resumes.
New phone-category opt-ins require current eligible account and
provider availability. A denied OS permission is a separate browser state; it
does not silently change in-app preferences. The explicit Enable action requests
permission only after a user tap. Likes, direct replies and feedback have separate optional email controls, disabled
with an explanation when unavailable. Existing enabled email choices can always
be withdrawn. No SMS toggle is offered.

Quiet-hour start/end minutes use an explicit IANA zone. Overnight, DST gaps and
repeated boundaries are defined in the phone contract and checked before each
provider attempt. In-app state remains available during quiet hours. There is no
undocumented urgent-category exception. The shared settings controller preserves
unsaved values, version conflicts and exact retries. Founder opt-out never blocks
personal reply alerts. Source bodies are not copied into delivery records.

Other optional email/digests and security-event alerts
retain their owning feature prerequisites. Actual locked-phone,
tap/reply and physical cross-device acceptance remain separate from engineering
and provider execution evidence.

## Optional Likes and reply email

`SOCIAL_EMAIL_ENABLED` defaults to false and requires valid account-delivery
configuration. Feedback retains its separate operating gate and per-source
consent. Required account grants and essential notices remain independent.
`notificationEmailSince` stores explicit dates only for `replies` and `reactions`;
missing, invalid or quarantined values fail closed. Older forms that omit
`emailCategories` preserve current consent. Disabling and re-enabling starts a new
consent boundary and cannot revive queued older events.

The existing `NotificationDelivery` EMAIL lane deduplicates by event and rechecks
current source authority, eligible recipient credentials, source-time consent,
read/mute/undo state and quiet hours before every attempt. SQL accepts only the
existing feedback kinds and exact direct-reply/Like kind-category pairs.
Immutable identity, generic content, eight-attempt bound and the existing 23-hour
email lifetime apply. The email includes a delivery link, never copied source
contents or actor names. Opening it requires the recipient's current sign-in and
canonical source access, including after consent withdrawal or source removal.

Protected recovery clears uncertain new email consent along with the other
notification choices. Private account export includes the owner's dated choices.
No new worker, cron, queue topic, dependency or backfill is introduced.
