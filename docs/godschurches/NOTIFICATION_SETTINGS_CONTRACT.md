# Notification settings: categories, channels and current authority

Settings must distinguish event records, saved conversation choices and delivered
notifications. `SocialEvent` explicitly stores canonical intents without copied
text or recipient preferences; it is not a notification queue. The existing
comment service retains COMMENT_CREATED and COMMENT_MENTIONED source intents and
adds one permission-checked COMMENT_ACTIVITY intent per immediate recipient. The P1 owner
now adds canonical adult message/request/report/founder preferences, authorized
in-app projections, an idempotent device outbox and timezone-aware quiet hours.
The September 15 integration extends those owners to twelve independent Activity
and phone categories, explicit author bells and current church/commitment outcomes.
See [the integration contract](NOTIFICATION_INTEGRATION_CONTRACT.md),
[its acceptance](NOTIFICATION_INTEGRATION_ACCEPTANCE.md) and
[the phone contract](PHONE_NOTIFICATION_CONTRACT.md). Saved preferences do not
grant contact/reviewer authority or establish physical delivery. SMS, optional
social email, digests and unrelated source categories remain unavailable.

| Category | Existing source / sending capability | Current channel and control |
| --- | --- | --- |
| Replies and mentions | Canonical comments and selected mentions, with one immediate recipient intent; `ConversationPreference` retains DEFAULT/FOLLOW/MUTE per owner/post. | Independent opt-in phone categories. Direct replies and mentions appear in Activity. Explicit thread FOLLOW also adds future replies; a separate conversations phone category starts off. MUTE suppresses that thread’s Activity and phone delivery. Current source access is always required. |
| Reactions | Canonical desired-state post/comment reactions and private prayer acknowledgments. | Independent Activity and initially-off phone choices. Current undo/source access is checked; grouped prayer acknowledgments do not identify participants. |
| Follows and friendships | Canonical follows and consented invitation relationships. | No notification sender or category preference; unavailable. Friendship confirmation remains its existing signup flow. |
| Messages and contact requests | Canonical adult conversation/request services and shared events. | Independent in-app and optional device push choices. New contact/sending require current reporting coverage; history and settings retain current authority. |
| Report activity | Canonical selected-evidence report/review records. | Separate in-app/push choices; every event and open rechecks current report scope. Scoped intake is enabled after authenticated reviewer appointment and still checks current coverage. |
| Founder announcements | Deliberately previewed/sent canonical founder messages to explicitly selected eligible recipients. | Separate announcement opt-out and optional push category. Personal replies remain independent. Sending requires the currently authorized founder and explicit selected-recipient preview/send. |
| Author posts | Canonical personal and church-authored publication. | Explicit person/church bell, independent of Follow, favorites and membership. Separate Activity and initially-off phone category; current access and source-time consent prevent backfill. Scheduling creates no alert until actual publication. |
| Prayer updates | Canonical prayer updates and explicitly saved prayer follow-up. | Independent Activity/phone preferences and current saved-prayer choice. Current source access, update/opt-in/device dates and withdrawal are enforced. |
| Church connections | Canonical connection, role and direct-capability outcomes. | Independent Activity and initially-off phone choices, with current scope at delivery/opening. Optional choices never hide the actual request or access result on its own screen. |
| Commitments | Changed canonical event occurrences and volunteer commitments. | Independent Activity and initially-off phone choices for currently eligible participants. Current RSVP/reservation and source-time participation apply; no reminder or digest service is implied. |
| Marketplace | Exchange capability remains inactive. | No notification sender or category/channel setting. |
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
The twelve categories are messages, requests, reports, founder, replies, mentions,
conversations, prayer, posts, reactions, church and commitments. Legacy clients
cannot erase expanded choices. Protected recovery quarantines unreconciled
notification choices and author bells before delivery resumes.
New phone-category opt-ins require current eligible account and
provider availability. A denied OS permission is a separate browser state; it
does not silently change in-app preferences. The explicit Enable action requests
permission only after a user tap. Settings never offer an email or SMS toggle.

Quiet-hour start/end minutes use an explicit IANA zone. Overnight, DST gaps and
repeated boundaries are defined in the phone contract and checked before each
provider attempt. In-app state remains available during quiet hours. There is no
undocumented urgent-category exception. The shared settings controller preserves
unsaved values, version conflicts and exact retries. Founder opt-out never blocks
personal reply alerts. Source bodies are not copied into delivery records.

Optional email/digests, security-event alerts and future unimplemented marketplace
or feedback sources retain their owning feature prerequisites. Actual locked-phone,
tap/reply and physical cross-device acceptance remain separate from engineering
and provider execution evidence.
