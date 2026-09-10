# Post publishing foundation

September 10, 2026 · Foundation verified locally; not published

The `codex/post-publishing-foundation` branch extends the existing `PlatformPost`
records from the verified calendar release. The local changes are not published.
The full posts, participation and reader assignment remains open.

## Implementation

Posts distinguish an acting account from a displayed church author. Church
authorship requires current approved membership and `PUBLISH_CHURCH_POSTS`.
`MODERATE_CHURCH_POSTS` separately permits scoped discussion control and removal;
an account category or contact title grants neither power. Personal posts may
be deliberately shared with one approved church. Existing posts retain their
public meaning and original content.

One shared reader filters the feed, search, profile counts/pagination and direct
post pages before loading rows. Church posts reach approved members without
requiring them to follow the acting account. A church post displays only the
church identity; its acting account, request keys, schedule and audit fields stay
out of the reader projection. A person's profile excludes church-authored posts.
Private church posts use the production renderer; development reads use the
public projection. Likes and comments recheck the same visibility rules under
the existing transaction gate.

New text accepts up to 3,000 JavaScript string units, Scripture references 120,
and up to five distinct tags from a controlled list. Invalid or excessive input
fails explicitly rather than being shortened. Native form CRLF line endings are
normalized before validation so a multiline textarea's limit matches storage.
Existing stored content is preserved until edited. The existing personal composer
uses the larger limit and a stable submission key. A full author/audience
composer and richer safe formatting remain in the interface checkpoint.

Edits use versions and show an Edited label. Audience changes require explicit
confirmation. Withdrawal also requires confirmation and the current version;
it clears the post text and removes the post and discussion from readers while
retaining restricted ID/action/version audit metadata. Existing dependent rows
remain inaccessible through the parent. Discussion closure and approved-church
reply restrictions apply at the command boundary.

A church may pin up to three published church-authored notices for at most 90
days. Expiry removes the pin from the reader without removing the post. Pin
controls and the dedicated church notice area remain interface work.

An event occurrence has one associated discussion post. Its effective audience
is the intersection of the post and the current published church event. Moving
the event back to private removes the discussion from ordinary readers and
replies. The relation uses the existing stable occurrence ID, so a time change
does not create a second discussion. Calendar details remain on the event record.

Church publication plans store local time, IANA zone, instant, scheduling actor
and version. Ambiguous/skipped local times are rejected. Cancellation preserves
an unpublished draft. The trusted publication function checks the current
version, time, membership, capability and linked event again; a revoked plan
returns to a draft and a repeated job cannot publish it twice. This is domain
state and worker logic, not an activated durable scheduler. Outbox dispatch and
retries must be connected before scheduled publication is available to users.

Owned account downloads include personal post settings and exclude church
operational posts. Full migration/backup checks include the new audit table and
post columns. The upgrade comparison preserves original post fields separately
from explicit checks that new defaults retain public visibility and publication
dates; full backup/restore fingerprints still compare every stored field.

## Verification completed

The expanded regression run passed 218 checks, with two expected disabled-delivery
skips and one stale Home-copy assertion. The feed now includes church communities;
that assertion was updated. The run had already passed upgrade preservation,
complete row/schema backup and restore, fresh migrations, restart, production
build/runtime and post privacy checks in development and production. A subsequent
verified production HTTPS run passed all 12 post, entrance and remaining guest
checks, including the corrected assertion. These are separate runs, not a claim
that the initial full run had zero failures.

Browser testing found and corrected the multiline CRLF limit and a cramped
removal confirmation. After those fixes, all seven database groups passed again,
including exact-limit Unicode/multiline input, excessive input, retry, competing
edits, withdrawal, current audience/capability, closure, pin expiry, scheduler
revocation and event audience intersection. Final lint, TypeScript and production
build passed. Runtime verification covered 85 traces, 6,230 entries and 205 server
JavaScript files. All 13 final certificate-verified production HTTPS checks passed;
the additional test submitted the actual multipart Server Action at the limit,
retried it without duplication and rejected normalized overflow.

Actual browser actions with fictional accounts saved personal posts, a comment
and a like, then verified persistence after reload. A 3,000-character multiline
post remained exactly 3,000 characters in the browser and database. Confirmed
withdrawal cleared another post's body, retained restricted audit metadata and
made its discussion unavailable. Guest/public versus member/private church
reading and displayed church identity were checked. Removal and long-text
layouts were readable at 320 pixels in light mode and 390 pixels in dark mode,
without horizontal overflow. Desktop geometry at 1,440 pixels also had no
overflow; the available screenshot cropped the emulated desktop width, so it
does not establish full desktop visual acceptance. Browser error logs were empty.
The browser used the production UI with real local development account boundaries;
the independent production HTTPS tests establish cookie/transport behavior.
Fictional browser/database processes were stopped and the viewport reset.

Poll ballots, volunteer capacity/signups, the full publishing interface, safe
link previews/media, durable dispatch, full thread/block/report/repost integration,
Bible-page motion and physical-device acceptance remain subsequent work under
the same integrated assignment. No real post, vote, signup or notification was
created by this verification.
