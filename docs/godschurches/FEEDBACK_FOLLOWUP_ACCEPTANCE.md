# Selected feedback follow-up acceptance

September 15, 2026 UTC. This is an **unreleased feature-31 checkpoint**. Continue
31.4 weekly product review and shared 29/30/31 acceptance before the complete
protected upgrade and canonical production release. No production migrations,
configuration, consent, accounts, case data or outbound sends occurred here.

## Implemented behavior

An explicit staff reply, status explanation or suggestion decision may create one
native recipient event. Contact permission and independently dated case channels
must precede that update. Ratings, receipt creation and unrelated choice edits do
not generate alerts. Current requester eligibility, current source ownership,
unredacted source evidence and current channel consent are rechecked. Reading a
case suppresses pending external follow-up. Unsubscribe and re-subscribe cannot
deliver an earlier update.

Reviewed idea status changes use the existing twenty-recipient fanout. Original
subscriptions stay with their ideas; a recipient has one event per source version.
Late subscriptions and late merges cannot receive older updates. Current public
publication and the entire merge path remain required; unmerge and contributor
withdrawal remove future access. Public status explanations remain separate from
private feedback text.

Activity has a feedback category with generic summaries and current private/public
destinations. Per-source in-app choices filter before pagination and unread counts,
so an email-only choice creates no unavailable Activity placeholder. Notification
preferences add feedback in-app/phone choices and an explicit feedback-email
control. Older supported clients preserve newer choices. Quiet hours cover phone
alerts and feedback email. Direct settings links and searchable help describe the
actual controls. An unavailable channel can still be switched off.

Email extends the existing NotificationDelivery queue, leases, retry state and
diagnostic retention. It does not create a second outbox. Phone identity remains
device-bound; email identity is immutable and bound to the current recipient's
zero-based credential version. Credential change or account restriction cancels
pending email. A separate unique email-event index closes nullable-device uniqueness
gaps. The existing queue callback and maintenance dispatcher handle both channels.
Shared account-mail transport retains its existing bounded retry behavior.

The optional email template contains no private body, rating, contributor name,
attachment or public-idea title. It uses a stable delivery key, original source
destination and a direct link to unsubscribe controls. Email expires 23 hours
after its event, before Resend's documented [24-hour idempotency window](https://resend.com/docs/dashboard/emails/idempotency-keys).
Delivery rechecks source access and preferences immediately before the bounded
provider call; an already submitted message cannot be recalled. Phone delivery
retains its existing at-least-once generic-alert semantics.

Contact dates and the email preference participate in owner export, erasure and
protected recovery. Restored older email choices are off pending review. Existing
restore quarantine already cancels all pending delivery rows and fanout jobs.

## Verified evidence

Private evidence is under
`/Users/lydiamccuen/Library/Application Support/Godschurches/unified-20260914/`.

- `feedback-followup-checks-final.log`: 17/17 pass — nine selected-follow-up
  scenarios, six real worker interruption/lease/recovery scenarios, two bounded
  message/comment-source scenarios. Tests cover a local email sink, provider lost
  acknowledgment with identical payload/key, concurrent workers, current consent,
  actual mocked phone acceptance, account credentials, read receipts, expiry,
  source withdrawal, twenty-plus-recipient fanout, late merges/subscriptions,
  reversal, protected preference recovery and SQL identity guards.
- Earlier unchanged suites also pass: six account-delivery, six feedback-intake,
  eleven reviewed-idea, five notification-integration and nine outbox scenarios.
  Initial aggregate logs preserve their passing rows and the repaired failures.
- `feedback-followup-browser-final.log`: four HTTPS Chrome groups pass at 320px.
  Actual keyboard controls, unavailable-channel withdrawal, lost save response
  with identical retry, staff reply to generic Activity to owned receipt, and
  contact withdrawal are exercised. Browser errors and unexpected discard prompts
  are zero. Screenshots and result JSON are in the preview fixture's
  `feedback-followup-browser` directory.
- `feedback-followup-preview-build-final.log`: production-mode build passes;
  186 traces, 42,916 entries, 473 server JavaScript files. The repaired renderer is
  unchanged: 173,096 bytes, SHA-256
  `647e9e5fbb96baa9ebe3cf0aa8d816f57e0e46354f2b8ad0fb9db18029e29f15`.
- `feedback-followup-types-final.log`, `feedback-followup-lint-final.log` and
  `git diff --check` pass. All 1,053 application/data/schema/configuration files
  match the preview in `feedback-followup-source-comparison.json`.
- Both isolated databases have 83 migrations. The three new migrations preserve
  existing phone rows and add channel dates/identity, an extended ownership guard,
  and support for native credential version zero. Production remains untouched.
- `feedback-followup-cost.json`: seven warm loopback samples for five updates in
  one case measure Activity median/max 9.14/11.80 ms, 27 SQL commands, 547 bytes.
  No-feedback Activity measures 6.65/7.14 ms, 17–18 commands, 296 bytes. Five staff
  reply transactions with a queued local email range 15.01–18.43 ms and 58–59
  commands. Five fixture emails are queued; external sends are zero. These are
  isolated service timings, not production latency or hosting capacity.

Initial failures are retained: suggestion-only fields in a general-feedback test,
missing explicit merge review, an older recovery fixture missing its new channel
date, the device-only SQL guard and the incorrect positive-only credential bound.
Browser checks were corrected to open the actual notification control, await the
saved response, select visible inputs and handle a native full-document refresh.
No checks were weakened to permit unreviewed publication or unconsented delivery.

## Activation and next work

`FEEDBACK_FOLLOWUP_ENABLED` defaults off. Production activation requires the actual
operator/notice and protected-recovery prerequisites, the existing delivery queue,
and verified relevant provider/device access. Feedback email also requires the
configured account-mail provider and a current verified eligible account's dated
email preference plus its per-source selection. This checkpoint uses only local
sinks and injected provider responses; it establishes no real requester delivery
or physical-phone acceptance.

Finish 31.4's admin-only weekly product review, source-scoped feedback coverage,
ratings, repeated suggestions/high-impact bugs and manual learning annotations.
Then finish shared 29/30/31 lifecycle, reports, narrow/keyboard checks, protected
upgrade and the exact deployed/canonical/live verification. Keep the parent and
31.3 open until feature acceptance. Continue eligible priorities in this same
Extra High run; final batch review stays last.
