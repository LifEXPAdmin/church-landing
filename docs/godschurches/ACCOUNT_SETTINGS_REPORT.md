# Account folder integration

## Existing service map — September 12, 2026

The Account folder consumes the previously completed account services. It does
not add identity or session authority. See [Settings](SETTINGS_CONTRACT.md),
[session controls](SESSION_CONTROLS_REPORT.md), [email changes](ACCOUNT_EMAIL_CHANGE_REPORT.md)
and [account test guidance](ACCOUNT_TEST_GUIDE.md).

| Control | Existing owner and confirmation/error boundary |
| --- | --- |
| Name and optional member profile fields | Profile form / account update-profile service; current owner, version/conflict review, retained failed input. Public name is distinct from private contact. |
| Username | Chosen and uniqueness-checked at signup. No username-change service exists; Account displays the current value and this limitation. |
| Sign-in email | AccountEmailChange / account-email-change service; current credential, newest single-use link, requesting owner, expiry and uniqueness. Pending requests preserve current sign-in and profile/directory data. Failure retains input; uncertain delivery gives verification guidance. |
| Verification | Existing request/consume account-grant flow; opening a link does not verify. Settings reports current confirmed status. |
| Password and connected method | Existing account confirmation, credential service and Google provider gate; sensitive changes retain their existing version/revocation contracts. |
| Devices and sessions | Existing owner-only list and credential-confirmed sign-out of all other sessions. Current session is pinned first; labels are approximate, creation/expiry are not last-used data. Unknown device stays unknown; location is unavailable. |
| Data and lifecycle | Existing reauthenticated export/deactivation controls in Your data. No new generic mutation or deletion authority. |

No accepted username-change capability can satisfy an account edit's taken-name
and retained-input check. That part remains open for a separately reviewed rename
contract, including existing profile URLs, references and uniqueness. Signup
validation is not evidence of a working account-rename flow. Likewise, existing
sign-out-all-others cannot be represented as per-session target revocation.

## Current increment

The Account folder and its detail summary show name, username, masked sign-in
email, current verification status and supported actions. Unverified contact has
an explicit verification entry. Profile/directory disclosure remains separate.
Session revocation now follows confirmed success with a fresh authoritative list.
If that read fails, the message distinguishes successful revocation from a failed
refresh. An uncertain revocation still offers a read before another deliberate
action and is never automatically retried. Password and email-change guidance
point directly to their Settings detail routes.

Product `2026.09.12.11` is live. Fourteen
focused session/email service and HTTPS groups passed, along with the disabled
email HTTP group (two enabled-delivery groups deliberately skipped) and two
release-content groups. Five built-HTTPS browser groups cover masked summary,
verification links, current/unknown-device labels, wrong-password recovery,
confirmed and uncertain revocation, failed post-revoke refresh, exact folder
links, pending email preservation and disabled-delivery guidance. No browser
JavaScript errors; 320/390/1440px with doubled text and keyboard passed.

Type/build and scoped lint passed with no new errors/warnings. The build verified
121 runtime traces, 10,289 entries and 299 server JavaScript files. The earlier
monolithic-Settings HTML assertions were updated for the actual detail route and
private-context loading; hydrated controls pass their browser assertions. One
initial assertion used an incorrect expected route title; its corrected current
label passed. No backend, schema, provider or production identity change is part
of this increment. Full enabled-delivery/provider and physical-device acceptance
are distinct from these local checks.


## Publication

Application `1d085e68273de74354607fa4a60b34c10018cec1` serves from READY
deployment `dpl_7mnPaWncWJK5YGaar5jB1XKoy47A`. Independent canonical assignment
and serving product/build identity match. Nine live read/browser checks passed
at 12:41:56 UTC with zero application writes or browser errors; the scoped runtime
query returned zero error rows. Account identity, sessions and email detail links
preserve sign-in returns; public release notes, guide, Menu version and private
API gates hold. The protected encrypted backup/restore remains current, with
30 matching migrations and no production data/permission change.

Account username changes remain an unimplemented contract requirement. Next is
method-aware Security navigation through the existing confirmation/recovery
services. Parent and owner/device acceptance stay open.
