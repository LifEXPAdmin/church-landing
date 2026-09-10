# Poll and volunteer participation

September 10, 2026 · Participation checkpoint verified locally; not published

The `codex/post-participation` branch continues the verified publishing foundation
at `5d55274`. None of these participation changes are published.

Polls use one versioned ballot per eligible account, with single or multiple
choices, a closing time and explicit time zone. Before the first vote an editor
can revise the poll. Participation or closing locks its structure; existing
choices remain recorded when the parent post is edited. Reads return aggregate
counts and only the viewer's own ballot. Current eligibility and church approval
filter the totals and control voting. No voter list is exposed to post authors.

Volunteer roles belong to the post's existing event occurrence and use its
current time. They do not duplicate event facts or submit an RSVP. The explicit
`MANAGE_CHURCH_VOLUNTEERS` capability controls role configuration and bounded
rosters. A transaction serializes the last available place, with stable retries
and version checks. Reserved places count toward capacity until canceled;
closing a role preserves its signups. Role names lock after participation and
capacity cannot shrink below reservations.

My commitments includes volunteer reservations, current event details, private
overlap hints and a changed-details label. Canceled events remain identified.
If post/event access disappears, the owner sees a redacted reservation and can
still cancel it. Withdrawal does not silently discard reservations. Account
downloads include personal polls, the owner's ballots and their own signups;
church operational rosters stay out of account exports.

The interface provides poll configuration/voting, role management, signup and
cancellation, and an explicitly opened authorized roster. Form errors preserve
entries; reservation creation keeps its retry key until the user chooses to add
another role. Poll closing times reject ambiguous or skipped local times.

## Verification completed

The complete isolated suite passed 239 checks, with zero failures and two expected
disabled-delivery skips (241 total). It includes six new participation service
groups and three actual HTTP groups in both development and production, plus
upgrade preservation, full row/schema/index backup and restore, fresh migrations,
restart, build/runtime and existing account, church, calendar and support checks.
An initial run stopped at an older audit-schema assertion; it was updated to
allow the nullable related-record ID while retaining the strict metadata-only
field check. The complete rerun above passed.

Actual browser tests found two display defects: a failed last-place request kept
an outdated availability count, and volunteer commitments ignored the selected
calendar viewing zone. Both were corrected. Afterward, all ten affected
certificate-verified production HTTPS groups passed: participation, calendar and
publishing. The commitments test now verifies the selected viewing zone in the
rendered page. Final lint, TypeScript and build passed; runtime verification
covered 86 traces, 6,369 entries and 210 server JavaScript files.

Fictional browser checks covered poll creation, preserved invalid drafts, one
single-choice ballot after reload/change, and one multiple-choice ballot with
two selections. Independent IAB and Chrome sessions verified final-place denial,
updated availability, cancellation and successful reservation by the other
member. My commitments matched the reservation and displayed the selected
America/Chicago time. The authorized roster showed the current volunteer;
ordinary members had no roster control. Closing a role retained its reservation,
and closing a poll retained its result. Database readback confirmed one role,
one active reservation, the expected ballot versions/choices and zero implicit
RSVPs. Audit records contained only restricted references/action/version data.

Guests read public results, opened an account prompt with the correct return
destination, and could not open the private church post. The 320-pixel dark,
390-pixel light and native 1,226-pixel desktop layouts were inspected without
horizontal overflow. Keyboard role expansion worked and both browser error logs
were empty. Final descriptive poll wording was checked on a fresh build. The
viewport was reset, fictional tabs/sign-ins cleaned up and preview/database
processes stopped. Browser interaction used the production UI with real local
development account/API boundaries; separate verified HTTPS checks exercised
the actual production transport and cookies.

No real vote, signup, event or notification was created. Volunteer roles use the
full event occurrence time; an independent shift-time editor is later calendar
work. Changes to event facts are labeled in the interface; delivery of event
change notices remains part of the later durable outbox work. Full composer,
safe previews, reader behavior, later thread/block/report/repost integration and
physical Samsung acceptance remain open. This checkpoint is local and does not
complete or publish the integrated post assignment.
