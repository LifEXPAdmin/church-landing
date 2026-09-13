# Notification settings: categories, channels and current authority

Settings must distinguish event records, saved conversation choices and delivered
notifications. `SocialEvent` explicitly stores canonical intents without copied
text or recipient preferences; it is not a notification queue. The existing
comment service retains COMMENT_CREATED and COMMENT_MENTIONED source intents and
adds one permission-checked COMMENT_ACTIVITY intent per immediate recipient. The P1 owner
now adds canonical adult message/request/report/founder preferences, authorized
in-app projections, an idempotent device outbox and timezone-aware quiet hours.
See [the phone contract](PHONE_NOTIFICATION_CONTRACT.md) and
[the verified release](MESSAGING_RETENTION_REPORT.md). Saved preferences do not
grant contact/reviewer authority or establish physical delivery. SMS, optional
social email, digests and unrelated source categories remain unavailable.

| Category | Existing source / sending capability | Current channel and control |
| --- | --- | --- |
| Replies and mentions | Canonical comments and selected mentions, with one immediate recipient intent; `ConversationPreference` retains DEFAULT/FOLLOW/MUTE per owner/post. | Independent opt-in phone categories. Thread mute stops delivery. Comments remain on their source post; no unified Activity inbox, email or all-follower delivery is claimed. |
| Likes | Existing desired-state post/comment reactions. | No notification sender or category preference; unavailable. |
| Follows and friendships | Canonical follows and consented invitation relationships. | No notification sender or category preference; unavailable. Friendship confirmation remains its existing signup flow. |
| Messages and contact requests | Canonical adult conversation/request services and shared events. | Independent in-app and optional device push choices. New messaging remains paused pending authenticated founder/report coverage; existing history and settings retain current authority. |
| Report activity | Canonical selected-evidence report/review records. | Separate in-app/push choices; every event and open rechecks current report scope. Intake remains paused pending the actual reviewer appointment. |
| Founder announcements | Deliberately previewed/sent canonical founder messages to explicitly selected eligible recipients. | Separate announcement opt-out and optional push category. Personal replies remain independent. Actual founder appointment still gates sending. |
| Church announcements | Existing church-authored posts and source access. | Feed publication only; no announcement notification subscription or sender. |
| Prayer updates | Current prayer post type and permitted engagement. | No separate notification sender/preference; never infer delivery or ranking from prayer activity. |
| Events | Existing event/RSVP/volunteer services. | No notification reminder/digest sender; joining an event is not consent to an unimplemented channel. |
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
It shares SocialPreferences versions and exact social receipts with the existing
contact choices. New phone-category opt-ins require current eligible account and
provider availability. A denied OS permission is a separate browser state; it
does not silently change in-app preferences. The explicit Enable action requests
permission only after a user tap. Settings never offer an email or SMS toggle.

Quiet-hour start/end minutes use an explicit IANA zone. Overnight, DST gaps and
repeated boundaries are defined in the phone contract and checked before each
provider attempt. In-app state remains available during quiet hours. There is no
undocumented urgent-category exception. The shared settings controller preserves
unsaved values, version conflicts and exact retries. Founder opt-out never blocks
personal reply alerts. Source bodies are not copied into delivery records.

Broader grouped activity, author bells, all-follower/reaction channels and digest/email
support remain with their existing foundation tasks. Do not expose unsupported
controls or mark those tasks complete from this P1 implementation.
