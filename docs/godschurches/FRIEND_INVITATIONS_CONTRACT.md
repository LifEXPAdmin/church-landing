# Personal friend invitations

Implementation contract, September 12, 2026. Not yet released.

An eligible verified adult account explicitly enables a 30-day reusable invitation.
One opaque 256-bit token is stored per owner; rotation and revocation invalidate
old versions and pending acceptances without deleting existing friendships. The
purpose-specific route grants no access by itself. GET, previews and scanning
are read-only. Tokens never appear in exports or client logs.

Friendship uses both canonical PlatformFollow edges plus a consent receipt.
It grants no additional church, contact, messaging or photo access. A one-way
follow is never called Friends. Either participant can remove friendship using
the existing relationship control. Removal and blocking mark all relevant consent
records REMOVED, delete both edges and invalidate private-control versions under
the shared lifecycle gate. REMOVED is permanent for this pair's old invitations;
rotating an invitation cannot override it. Reconnection after removal is outside
this release. Account deactivation revokes invitations and removes these pairs;
account deletion cascades invitation/consent rows and canonical edges.

Signup binds an explicitly accepted invitation in the transaction creating the
new account. A unique signup-recipient key prevents another tab from replacing
its chosen inviter. Duplicate email/username registration never updates consent.
Invalid invitations leave ordinary signup usable. Verification completion retries
only that server-bound choice, including cross-browser email links; a failed
connection attempt does not undo verification. The existing adult acknowledgement
also completes pending consent after its eligibility transaction commits, using
its unchanged policy. A failed connection never rolls back verified email or
adult eligibility. Existing
members must explicitly Connect; signin or scanning never grants consent.

Every connection revalidates account eligibility, current invitation version,
expiry, revocation, bilateral blocks and removal records inside the existing
shared lifecycle gate. Both edges and their consent receipt commit atomically.
Authenticated writes use existing same-origin and per-owner rate limits, strict
field parsing, owner matching, expected invitation versions and exact-body
SocialOperation receipts. A retried receipt describes the original operation;
interfaces must read current state before claiming an active friendship. No
unconditional delayed callback or GET creates a new acceptance.

A signup acceptance is permanent for its initially chosen invitation version.
Expired/revoked or deliberately removed acceptance is not silently replaced by
another tab or a newer code. The person can continue using their account. General
website sharing contains no inviter and never creates relationships.

Verification must cover concurrent acceptance/retries, both edges, signup decline,
cross-browser verification, ordinary signup, stale removal callbacks, bilateral
blocks, deactivation/deletion, expiry/rotation, wrong-account requests, exact-body
conflicts, export exclusions, account/permission gates and decoded QR destinations.


## Interfaces and operational limits

`/platform/invitations` is the owner-only My QR code and signup-status entry.
`/platform/invite/[code]` is a read-only welcome; `/platform/signup` accepts only
its explicit primary choice. `safeAccountReturn` allowlists these exact paths.
`GET/POST /api/platform/friend-invitations` uses the existing private response
headers, cookie session and per-domain 240-attempt/15-minute rate limit. Commands
are enable/rotate/revoke (current invitation version), accept (opaque code and
explicit consent), and retry-signup (only the account's previously bound choice).
The required accountId is an equality guard, never a source of authority.

One current code per account; 2,000 incoming consent records, 2,000 records when
adding an explicit recipient action, and the existing 2,000 social-setting cap.
Receipts use the shared 20,000 operation limit. No automatic pruning. Account
export includes the owner's invitation metadata and accepted-consent metadata,
without reusable codes, other participants' private data or operation receipts.
The additive migration checks self-pairs, positive versions, allowed states and
that signupRecipientId matches recipientId. Preserve these custom constraints.

QR rendering keeps its displayed aspect ratio square. Before a personal PNG
is downloaded, the owner and current URL are rechecked. A replaced/revoked code
cannot be copied from an unchecked stale owner response. The safe update guard
retains an unresolved exact request until its result is confirmed. An HTTP
rejection permits checking status and discarding that rejected request; an
unknown network outcome keeps the exact retry and navigation/update guard. Physical camera/mail/provider acceptance is separate
from isolated browser and service evidence.

## Release and rollback

Apply the additive migration only after the protected production backup restores
and its candidate migration preserves existing data. The older application can
serve during this empty-table migration. Once invitation consent exists, a blind
rollback to code that lacks removal/suspension hooks is unsafe. Prefer a forward
fix; a UI rollback must retain these services, lifecycle hooks, consent records
and removal history. Never drop the tables or restore an old database to undo a
UI change. Existing private-draft reply permissions and publication access checks
remain unchanged and covered by their original contract.
