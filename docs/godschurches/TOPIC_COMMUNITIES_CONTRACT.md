# Public topic communities

Implementation contract · September 15, 2026 UTC · verified live in 2026.09.14.18

See [complete release and acceptance evidence](TOPIC_COMMUNITIES_ACCEPTANCE.md).

Topic spaces are public communities around a shared subject. They use the existing
canonical posts, comments, reactions, private drafts, reports and review decisions.
They grant no church or platform capability. Fictional examples belong only in the
isolated verification environment.

## Identity and participation

An eligible verified adult account can create at most three communities per day
and own at most twenty active communities. Names are 3–80 characters, unique after
Unicode normalization, whitespace normalization and case folding. Slugs are stable,
unique lowercase ASCII words separated by hyphens, 3–60 characters. Description
and rules are required, with 1,000 and 4,000 character limits. Names and slugs remain
reserved when archived; an archive never silently becomes somebody else's page.

Public discovery and topic pages require no account and perform no membership
writes. Joining explicitly accepts the currently displayed rules; following is a
separate private choice used for the Topics I follow stream. It reuses the
canonical post reader; the four existing feed modes remain unchanged. Neither choice enables
phone delivery. Membership and follows are bounded to 200 records per account;
left records retain their version and moderation restrictions. Public member lists
are not provided. Managers receive paginated current members, not contact details.

Joined, unrestricted eligible members may publish and reply as themselves. Topic
posts are public, use viewer replies, and have an immutable topic destination.
They cannot carry a church identity, church audience, event, schedule or repost
destination. Existing posts can still be reposted outward when the author permits
it and the original remains readable. Leaving does not erase authored posts.
Restricted members cannot add participation; their existing topic posts/comments
are excluded by the shared reader predicate. Private unsave, unfollow and ordinary
account/data-removal rights remain available.

## Scoped management

The owner can edit identity/rules, archive/reopen, nominate a joined member as
moderator or successor, cancel a nomination and revoke a moderator. A nomination
grants nothing until the named eligible member explicitly accepts it while the
nominating owner and invitation version are still current. Ownership acceptance
removes the former owner's management role. There is no guessed successor.

Owners/moderators can restrict ordinary members and lock/unlock discussions with
a fixed reason and audit evidence. They cannot edit another author's words or
erase them as an author. Content removal/restoration uses the existing scoped
report review and author decision/appeal system. Topic reports about the community
itself are reviewed by platform report reviewers. Reports about topic posts and
comments are available to current topic managers and platform report reviewers;
church-private sources retain their separate church authority.

Every command derives the account from its current session, uses an exact immutable
request receipt and version checks, and rechecks current authority before replay.
Revoked roles, account suspension/deactivation, blocking, removed sources and stale
rules fail safely. Topic visibility and author restrictions apply before pagination,
counts, previews, HTML/RSC serialization, search, feeds and original repost hydration.

## Finishing and recovery

Complete guest account returns, private draft destination preservation, accessible
desktop/touch controls, loading/empty/error/conflict/retry behavior, existing feed
integration, export/erasure and protected restoration in this feature cycle.
Recovery must never restore a revoked role, membership restriction or removed topic
from an older backup. Capture isolated service and actual built-browser evidence,
bounded query/bundle costs, a fresh protected upgrade and installed recovery, then
the exact READY/canonical/live release and private task readbacks. Physical-device
and real operator acceptance remain separate from simulated browser evidence.

Restoration uses the existing traffic-disabled quarantine. Topic manager roles and
unaccepted offers are retired; topic ownership is flagged for current verification.
The content-free protected journal carries the minimum topic security version and
moderation outcomes. Replaying a newer permission change quarantines an older
topic snapshot; it never guesses a successor or reconstructs missing membership
decisions. Only a verified current recovery source and legitimate ownership review
may establish permissions before traffic resumes. Account deletion retains active
topic ownership as a handoff exception; archive or hand off the topic beforehand.

## Earlier foundation and interface checkpoints

These retained implementation checkpoints are superseded by the verified release
linked above; their pending-stage descriptions are historical.

Public discovery, topic reading, creation, followed posts and private management
pages now use the canonical composer/cards/report review. Joining and following
remain separate. Current rules, explicit public-post confirmation, accepted role
offers, bounded member/history pages, public sharing and retained-page visibility
guards are implemented. Topic restrictions continue after verification loss;
negative private choices remain available. The expanded isolated gate passes 38
checks and types/focused lint pass. Full HTML/RSC, built browser and release
acceptance below are still pending; this checkpoint is not a feature completion.

The isolated 54-migration upgrade preserves existing account, follow, post and
comment values after excluding the explicitly added nullable topic columns from
the comparison. Ten topic checks and 25 existing draft/review/retention checks
pass, including direct boundary requests, two public topics, original-scope report
review, stale role consent, restrictions, safe account returns and recovery replay.
The dump/restore check passes. These are local foundation checks, not a complete
feature or a production release. Public pages, member management UI, expanded
integration/HTML/RSC/browser tests, costs, full gate, release and reconciliation
remain in this same feature cycle. The later interface checkpoint above supersedes
the earlier statement that the pages had not yet been implemented.
