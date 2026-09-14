# Personal profile post pin

## Implementation checkpoint — September 14, 2026

The local 2026.09.14.15 candidate adds a single owned published post pin to the
personal profile. The optional introduction and church notice pins retain their
existing owners. Production remains the verified four-feed release .14 / c83b192.

Private SocialPreferences stores the selected canonical post and a separate pin
version. The current account owns changes; source access is checked before even
an exact receipt replay. Replacement is versioned and concurrent choices cannot
silently overwrite each other. Pin changes do not edit the post, timestamp,
audience, engagement, profile introduction or global feed order. Account export
includes the owner's selection; existing account erasure removes it. A deleted
post clears the foreign key; hidden, withdrawn or inaccessible posts are excluded
by the current profile reader. Ordinary reposts retain their source protections.

The owner menu reads status only when opened. It explains replacement, preserves
uncertain request bytes after closing/concealment, checks the current account,
and protects unsent work before a placement change. Profiles render the same
canonical card with a Pinned label above chronological posts. The selected card
is excluded before pagination; later pages do not repeat it. Member previews use
the original content note and safe excerpt. Anonymous profile gates remain.

Seven isolated service groups pass: canonical post/engagement preservation;
pin/replacement/unpin and exact replay; 66-post pagination with an old pin;
current owner/audience/status/replay checks; church membership, member previews
and blocks; concurrency, stale unpin and foreign-key deletion; repost-source
revocation; and own-data export. The first run exposed an invalid fictional
church-post fixture; its audience linkage was corrected and all seven groups
pass. Initial types and focused lint pass.

Complete fresh full-gate, browser, additive/protected recovery, final measured
costs, exact deployment/live acceptance and private reconciliation remain in
this feature cycle. No production pin, account preference or user content has
been changed for this implementation checkpoint.
