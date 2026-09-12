# Data settings and current lifecycle scope

September 12, 2026. The Data folder consumes the existing account confirmation,
export and reversible deactivation services. It adds no storage or permission
authority. Settings context remains owner-scoped, private and revalidated on
return; unknown or denied context never supplies editable defaults.

## Supported actions

| Entry | Owner and consequence |
| --- | --- |
| Browser permissions | `navigator.permissions.query` reads camera, microphone and geolocation status only. The browser/device owns changes. No hardware, location request, recording, account write or telemetry is triggered. |
| Sharing choices | Existing profile, relationship and church-directory controls retain their own audiences, versions and current access checks. |
| Sign-in methods | Existing password/Google credential management. A Google identity is authentication, not general OAuth access to account data. Provider gates and last-method protection remain in place. |
| Download | `account-export.ts` requires current purpose-bound confirmation and a short-lived proof tied to the same active session and credentials. The browser holds a private object URL for one minute, revokes it on expiry/unmount and requires fresh confirmation afterward. |
| Deactivate | `account-lifecycle.ts` requires current credentials and explicit intent under its existing access/owner locks. It hides personal content and ends sessions while retaining records for legitimate reactivation. |

No permanent-delete, general connected-app revocation, optional data-use consent
or history-clearing service exists. No such action or fake switch is enabled.
Deletion remains gated on retention and each enabled resource owner's lifecycle
and transfer contract. Deactivation is not a substitute for permanent deletion.

## Browser status

Allowed, blocked and ask-before-use are distinct from unreported status. Missing
API, unsupported permission name, query failure or an unknown returned state is
unreported; it never implies grant or denial. Status refreshes on return, explicit
check and supported change events; obsolete results/listeners are discarded.
Permission is scoped to this browser/site and does not publish profile location
or grant church/account access. Current uploads use a file picker; no live camera,
recording or automatic geolocation feature is enabled by this display.

Guidance was checked against primary browser documentation:
[Permissions query](https://developer.mozilla.org/en-US/docs/Web/API/Permissions/query),
[Chrome site permissions](https://support.google.com/chrome/answer/114662),
[Safari on iPhone](https://support.apple.com/guide/iphone/iphb01fc3c85/ios), and
[Safari on Mac](https://support.apple.com/guide/safari/ibrw7f78f7fe/mac).
Physical installed-app/OS permission acceptance remains separate from Chromium
verification and mocked API states.

## Resource coverage and remaining ownership gates

Export keeps its existing explicit owner projections and format. It includes
personal profile/presentation and linked identity, authored posts/comments,
personal image metadata/references and named albums, private post/comment drafts,
saved collection organization, own social/conversation preferences, friend
invitation records, personal polls/own ballots and volunteer signups, personal
calendars/events/shares/responses, church-directory preferences, own church claim
and listing drafts/submissions, and own support submissions. Raw invitation
tokens, credentials, sessions, staff/church operations and other people's content
are excluded. Saved items do not copy their source posts. Image bytes are not
embedded and media links still require current access. Browser reading choices
and permission status are outside the account export.

Bounds remain 2,000 rows per category and 4 MiB, plus the existing 50-album and
100-entry-per-album limits. Exceeding a bound fails explicitly; no partial archive
is labeled complete. The Settings summary does not invent asynchronous request
tracking or a hosted download URL.

Deactivation retains personal images/albums and their source audiences for
reactivation, plus private drafts/collections and authored records. It revokes
friend invitation codes, calendar/event shares, current sign-ins, pending email
changes and account grants; directory/coordinator sharing ends. Going/Maybe event
responses become Declined. Reactivation does not revive those revoked states.
Poll ballots and volunteer signup records remain stored; no automatic volunteer
cancellation is promised. Existing active-account policy controls visibility.

Church positions, capabilities, contacts, operator/support grants, retained case
ownership and enabled intake ownership block deactivation until legitimate
handoff/revocation. The existing server response gives that next action. Personal
account closure must not delete church-owned media merely because the person
uploaded it. Media retirement still follows current reference/privacy rules; no
retention behavior changes in this folder.

Exchange listings, storefront, family/dependent accounts and Foundry resources
have no enabled lifecycle authority here. Their resource owners must define
retention, export, deletion and required transfers before integration. No legal
deadline, automated church transfer or new permission decision is inferred.

Private draft `replyAudience`, legacy confirmation, current access, optimistic
versions and exact-body retries remain governed by the post workspace contract.
