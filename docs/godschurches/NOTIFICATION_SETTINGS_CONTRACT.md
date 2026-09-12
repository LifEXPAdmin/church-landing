# Notification settings: categories, channels and current authority

Settings must distinguish event records, saved conversation choices and delivered
notifications. `SocialEvent` explicitly stores canonical intents without copied
text or recipient preferences; it is not a notification queue. The existing
comment service writes COMMENT_CREATED and COMMENT_MENTIONED intents. There is
no current category preference, notification inbox, outbox, quiet-hours or digest
service. No in-app, push or SMS channel may be presented as enabled by those rows.

| Category | Existing source / sending capability | Current channel and control |
| --- | --- | --- |
| Replies and mentions | `comment-commands.ts` creates comment/mention intents; `ConversationPreference` stores DEFAULT/FOLLOW/MUTE per owner/post with versions. | No delivered notification channel. Per-conversation choices remain editable on the post, without claiming inbox/email/push delivery. |
| Likes | Existing desired-state post/comment reactions. | No notification sender or category preference; unavailable. |
| Follows and friendships | Canonical follows and consented invitation relationships. | No notification sender or category preference; unavailable. Friendship confirmation remains its existing signup flow. |
| Messages | No active direct-messaging capability. | Unavailable; no message, SMS or push switch. |
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

The activity/preferences/outbox foundation must define recipient eligibility,
essential versus optional classification, delivery deduplication, current-access
rechecks, abuse bounds and channel/provider gates before category integration.
Quiet hours and digests additionally require timezone semantics. The current
Notifications screen truthfully points to conversation controls and unavailable
channels; full category on/off summaries remain blocked until actual preference
and sending capabilities exist.

This mapping introduces no new channel, schema, provider activation, subscription
or outbound message. It records existing code and explicit missing capabilities;
delivery and physical-device notification acceptance remain separate.
