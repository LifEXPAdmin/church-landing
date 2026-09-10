# Publishing controls and church post pages

September 10, 2026 · Publishing checkpoint verified locally; not published

The `codex/post-publishing-interface` branch continues local participation at
`f149393`. It adds the actual personal/church composer, controlled topics,
readable paragraphs and simple lists, versioned management forms, and church
post pages. The calendar release remains the published application.

The composer loads current approved church choices through an authenticated
endpoint. Church authorship appears only with the explicit publishing grant;
personal church sharing is a separate choice with an acknowledgement. New church
content defaults to church visibility. Published source events can be selected
from a bounded, paginated list; an existing event discussion is not duplicated.
The displayed audience accounts for a linked event's narrower visibility.

Text and Scripture have visible normalized counters. Excessive text is retained
and rejected rather than silently shortened; at most five supported topics can
be selected. Paragraphs and simple lists use escaped React text. User HTML and
embedded media are inert. Optional link previews remain a later checkpoint.

The publishing API reuses current-session domain permissions, exact-origin and
cross-site checks, bounded bodies, durable account/IP rate limits and stable
creation keys. It does not expose scheduled publication while the durable worker
is unavailable. Failed requests retain form entries. Stale edits require a fresh
permission-checked read and an explicit comparison acknowledgement before the
retained draft can be submitted against the newer version. Changed audiences
require separate confirmation.

Management includes post edits, reply restrictions, discussion closure/reopening,
confirmed withdrawal, and a maximum of three church notice pins with an explicit
UTC expiry within 90 days. Edits preserve poll ballots and volunteer reservations.
The church page reads the same post records under current permissions, separates
active pins from ordinary posts and paginates older posts. Expired notices return
to their ordinary place in the feed. Membership alone never makes a personal post
appear on a church page.

## Verification completed

All 247 applicable checks passed across the full regression sweep and corrected
HTTPS reruns (249 distinct checks, with two expected disabled-delivery skips).
The sweep includes upgrade preservation, complete row/schema/index backup and
restore, fresh migrations, process restart, production builds and the prior
account/church/calendar/support paths. Four new service/boundary groups and two
new actual HTTP groups in each rendering mode cover current choices, forged
identities/origins, limits and retry uniqueness, versioned audience edits with
participation preservation, safe HTML text, pins and church-feed pagination.

Three test assumptions were corrected during verification: the privacy fixture
needed a fresh post after pagination tests filled the first feed page; HTML
escaping assertions must distinguish the non-HTML Flight response; and Flight
contains the authorized client editor reference rather than its rendered button
text. The last full sweep reached 227 passes, two skips and the latter assertion
failure. After correction, all 21 final verified production HTTPS checks passed,
including both editor groups and every remaining participation, support, entrance
and guest group. No application failure remains from these runs. Final lint and
TypeScript passed; the production runtime check covered 87 traces, 6,471 entries
and 213 server JavaScript files without Prisma configuration-loader paths.

Actual fictional browser tests used an isolated production source copy whose
application files matched this checkout, with real local development API
boundaries. Separate certificate-verified HTTPS tests exercised the actual
production transport and cookies. Browser checks covered a retained rejected
3,001-character draft, safe paragraph/list rendering, Scripture, five topics and
a disabled sixth choice, personal/church publication and deliberate church
sharing. Saved creation forms disabled repeated submission; writing another post
reset the draft. A church post linked the existing source occurrence, while an
event with a discussion could not be selected again.

Two independent publisher sessions verified a stale edit, retained draft, latest
saved comparison, explicit review and successful retry. Edited labels, required
audience-change confirmations, narrowed/closed replies and an expiring notice
pin were verified. The church page displayed the notice once. Existing poll
ballots and volunteer reservations survived edits. Confirmed withdrawal hid the
post, while the owner could still cancel the redacted reservation from My
commitments. Database readback confirmed the intended authors/audiences and
versions, one retained ballot, one explicitly canceled reservation and no
implicit RSVP.

Guests could read the public notice, reached Join/Sign in when liking, retained
the correct post destination and could not open the private church post. Actual
320-pixel dark, 390-pixel light and 1,226-pixel desktop screenshots were inspected
without horizontal overflow. Keyboard Enter opened the withdrawal confirmation.
Both browser error logs were empty. Fixture sign-ins/tabs were cleaned up, the
viewport reset and preview/database processes stopped. This checkpoint is local
and unpublished; safe link previews are next.

The broader post assignment still includes safe link previews, reader motion,
durable scheduling, later media/thread/block/report/repost integration and actual
Samsung/device acceptance. No real post, message, vote, reservation or church
permission has been created by this work.
