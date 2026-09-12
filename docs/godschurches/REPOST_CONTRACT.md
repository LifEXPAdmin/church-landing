# Attributed repost contract

## Reference and permission model

Plain reposts and quotes are PlatformPost records with a nullable PLAIN/QUOTE kind and an original-source foreign key. Existing posts remain ordinary posts. A plain entry stores no source text, media, scripture, link preview or participation objects; a quote stores only its author's added words and independently attached photos. Source photos remain at the source endpoints under current media policy. Account export includes only the owner's entry, commentary and reference.

Version one accepts public source posts only when the original author has explicitly enabled the existing allowReposts setting (default false). Anonymous readability is an upper bound even for approved members; restricted event sources are excluded. Current viewer blocks, source author account state, withdrawal, audience and permission apply at publication and every projection. A personal source blocking the original reposter also makes the retained reference unavailable to other viewers. Feed discovery additionally respects source mutes/snoozes; direct links remain governed by access policy.

Entry links normalize through at most ten readable public references to one original, with a visited-ID cycle guard. An intermediate quote's commentary is never copied. Self references are rejected by the database. Removing a source sets its reference to null while retaining the entry kind, allowing a neutral unavailable placeholder without old source details. Existing source edits and Edited wording project through. Quote authors can retain and edit their own words after their source becomes unavailable.

## Commands and destinations

The private no-store repost endpoint uses existing social request, owner, origin, rate and exact-body receipt boundaries. Creating a repost requires a verified adult account. A personal destination or an approved church destination is explicit; any church destination requires current PUBLISH_CHURCH_POSTS, including posting personally on that church page. Church author and destination must match. The source version is checked before creating a plain entry.

The shared authorization lock and partial unique index permit one active plain entry per speaking identity, church destination and source. Two authorized church publishers share one logical church identity. Exact retries return the original receipt; a changed body with the same key fails. Undo requires the entry's current version and owner or current church publisher, withdraws only the entry and leaves the source intact. Replaying an old create receipt after Undo cannot resurrect the entry. A deliberately new repost can create a new entry and publication time.

Plain entries do not support editing, photos, polls or a separate discussion. Their Like, Comment, Bookmark and external Share controls use the original source. The service also normalizes Like and Bookmark aliases to avoid a duplicate private saved record. Quotes have their own discussion, reactions and saved state. Share stays an external canonical link handoff. No new notification event or outbox is invented before its owning contract exists.

## Existing private drafts

PrivateDraftPayload and the existing composer whitelist support optional quoteSourceId. Save/read/list/resume/retry/conflict retain this reference without copying source content. Older snapshots omit it and remain ordinary posts; there is no inferred source or new draft backend. Publication resolves the reference again inside the existing atomic draft publication transaction. A revoked source, church access or missing reply choice fails without consuming the draft. The existing VIEWERS/CHURCH_MEMBERS values, legacy null requiring deliberate review, versions, fingerprints and exact request bytes are unchanged. Published quote source identity is immutable; another source requires a new post.

## Verification and release scope

Focused service tests are in tests/reposts.test.ts; controller recovery coverage extends tests/draft-controller.test.ts and preserves tests/post-workspace.test.ts. Browser rendering and integrated release evidence are recorded separately in REPOST_REPORT.md. A service contract checkpoint does not establish live deployment or physical-device acceptance. The additive migration must pass a production-backup restore rehearsal before production application.
