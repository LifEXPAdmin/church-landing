# Account data controls

## Profile/image extension — September 10, 2026

The local profile-controls work adds appearance and personal image metadata to
the explicit export contract, including bounded crop coordinates and authorized
relative delivery links. Provider paths, fingerprints and image bytes are
excluded. The total archive limit is now 4 MiB to fit the hosting response limit;
the per-collection cap remains 2,000. This extension is unpublished. See
[PROFILE_CONTROLS_REPORT.md](PROFILE_CONTROLS_REPORT.md).

## Historical account download checkpoint

September 9, 2026 · `codex/account-data-controls`, based on published main
`b9a2443240b1d52d96cd1be903c3257266ae230d`.

## Private account download

Account settings now provides **Prepare account download**, followed by an
explicit **Save account data** link for a JSON file. The form confirms the current
password, obtains an authorization valid for 60 seconds, then retrieves the
owner's allowed data. The authorization is signed with a purpose-specific HMAC
and bound to the current session and credential version. It stays in the POST
body and page memory, never a URL, cookie, server file or browser storage.

The account API rechecks the active session, suspension, expiry and credential
version under the existing user lock. Another account, another sign-in of the
same account, a tampered or expired authorization, and revoked access cannot use
the download. Exact-origin, body-size and durable request limits still apply.
The attachment uses no-store, no-referrer and nosniff headers and a fixed filename.
Preparing/downloading does not alter account data or create a sign-in.

The generated file has a one-minute browser-memory download window, with its object
URL revoked by the expiry timer, replacement or leaving the page. Pending requests abort
when the component unmounts. A saved file is under the user's control; subsequent
account revocation cannot recall an already downloaded copy.

### Export contract

The file identifies its format, version, generation time and included scope.
Explicit database projections include only:

- The owner's account/profile fields, verified-email state and adult acknowledgment.
- Authored posts and comments, own likes and following usernames.
- Own church connection state and directory sharing choices/contact details.
- Own support request submissions and the owner's non-redacted replies on those
  requests, plus their coordinator-sharing start/revocation dates.

Excluded: credentials, raw tokens, session metadata, private limiter/security
records, capability grants and internal audits, other users' content or contact
details, staff replies, and church/staff operational records. Work authored while
acting as support staff on someone else's case is not a personal submission.
Browser-only reading preferences and unrelated historical waitlist subscriptions
are separate from this authenticated account export.

At this historical checkpoint, bounds were 2,000 rows per collection and 10 MB total. Exceeding either
returns an explicit error with no partial archive. A scalable large-account
export remains separate work; there is no fabricated complete export on overflow.
The exported records are read during the short request transaction; the file is
not an immutable snapshot of future edits or a comprehensive legal data-access
fulfillment service.

### Related correction

Password changes now also reject a suspended user's existing session before
verifying or modifying credentials. This makes that sensitive action consistent
with export, session controls and the existing sign-in/suspension boundary.

## Verification checkpoint

All **96 isolated service/HTTP checks passed**, including five new export groups,
production build/type/runtime traces, upgrade/restore/fresh migrations and account
restart tests. Lint passed. The new groups cover owner-only projection, current
password, cross-account/cross-session replay, tampering/expiry,
suspension/revocation and credential changes, explicit overflow, and production
HTTPS attachment/origin behavior.

An actual browser flow with a fictional local account passed wrong-password
rejection, keyboard submission, focused feedback, file preparation, explicit save
and expiry/removal of the download link. The downloaded JSON was inspected and
contained the intended fixture profile without credential material. Widths of
320, 390 and 1440 pixels showed no horizontal overflow; the 390px panel was also
reviewed visually. Header logout succeeded, and the temporary tab was closed.
No browser error logs were returned during the completed export flow.

The initial browser attempt encountered a local fixture database listening on the
wrong port after restart. Restarting that disposable database on its configured
loopback port resolved the setup error; the repeated browser flow passed. Browser
testing used local development HTTP, while the production server/API checks used
locally verified HTTPS. No physical-device or live personal-account export is
claimed. The final production build/type/runtime-trace check passed after browser
testing; the fixture servers are stopped.

### Publication

Application commit `19c5850b931fd75ce4ea365206c654fc79c3ddff` is published on
production deployment `dpl_ChL5CKaPNJSvz3jxJpMhk7XgzsLy`, READY at
`2026-09-09T23:13:15.489Z`. The exact Git SHA and canonical alias were verified.
Eleven live HTTP checks passed at `2026-09-09T23:14:52Z`, including rejection of
anonymous, forged-owner and foreign-origin export requests. No live personal
export was requested. A report-only follow-up may redeploy the same application.

## Remaining account work

The download does not implement email ownership changes, deactivation/deletion,
Google linking or real recovery-email activation. No schema, migration, dependency,
live account creation, real email, analytics or support-intake change is needed
for this slice. Continue the broader queue using its existing specifications and
record actual configuration and human/device-dependent acceptance separately.
