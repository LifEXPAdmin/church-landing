# Social, conversation, media and sharing foundation release

## Implemented scope — September 11, 2026

This batch builds on the private workspace/search/install foundations in
`b49385c`. It adds session-owned relationship/privacy APIs, bilateral personal
blocks and feed/search mutes, bounded threaded comment reads, versioned comment
commands, desired-state Likes, private comment drafts, eligible mentions,
helpful-reply pins and conversation preferences. Existing follow and comment IDs
remain intact. Church publishing identity is distinct from the internal person.

Gallery APIs expose authorized image records, manager capability and provider
availability. Reorder and caption/alt edits share the current post/image versions
and exact-retry contract. Church logo/cover reads reuse the existing media
permission and delivery services. Canonical sharing adapters supply an anonymous
public projection, generic restricted previews, a static 1200 × 630 brand image
and validated comment return paths.

The implementation contracts are [Social foundations](SOCIAL_FOUNDATIONS_CONTRACT.md)
and [Media and sharing](MEDIA_SHARING_CONTRACT.md). They specify the exact
commands, projections, limits, conflict handling, errors and Medium acceptance.
The earlier [Private workspace](POST_WORKSPACE_CONTRACT.md) and
[Installation](INSTALLATION_CONTRACT.md) contracts remain the entry points for
those interfaces. These are implemented server foundations; the new interfaces
are separately scoped Medium work.

## Fresh verification

- Full `npm run test:support`: 406 passed, zero failed, two expected disabled-email
  skips. It includes fresh/populated migrations, account/church/calendar/post/media
  regressions, new social/gallery/sharing/workspace services and actual HTTPS
  development/production/restart checks.
- Final extended `npm run test:social-foundations`: 26 passed, including church
  identity, block/privacy propagation, drafts, mentions, filtered thread cursors,
  gallery conflicts and public-preview restrictions. Dump/restore preserved the
  populated workspace and social records and constraints.
- Final production-mode local HTTPS social/gallery/sharing run: two passed.
  Revoked sessions, cross-origin and owner-injection rejection, exact retries and
  private drafts were exercised against actual HTTP routes.
- Lint and TypeScript passed. Final production build and runtime traces passed:
  103 traces, 8,390 entries, 253 server JavaScript files; no private fixture,
  environment file or Prisma configuration-loader path was packaged.
- Ten browser acceptance groups passed at 320/390px with isolated guest/member
  data: navigation, empty/populated Home, profile dialogs, keyboard/focus/scroll,
  Explore queries and Back. No browser page error occurred. Physical-device
  acceptance and the previously intermittent hydration investigation remain open.
- A fresh encrypted PostgreSQL 17 production backup restored successfully to a
  disposable loopback database. All 26 production migration checksums matched;
  applying migration 27 preserved original-column fingerprints across all 60
  existing tables, with opt-in social records empty. The plaintext restore was
  removed. This rehearsal did not mutate production.

## Release status

The candidate is ready for the authorized production migration and deployment.
The final serving identity, live checks and migration receipt will be recorded
following deployment; local checks above do not themselves establish publication.

## Next Medium batch and retained boundaries

The private task queue adds eleven P2 Medium briefs. After live verification it
contains seventeen immediately executable Medium slices and ten follow-ons whose
remaining dependencies are other Medium slices. Start with draft editor/recovery
and comment thread/composer components, then wire their dependent interfaces.
Avoid repeating the completed permissions/schema work. The private handoff holds
individual task references and dependency order.

Keep broader parent acceptance open: the Blob owner action and real upload
acceptance, full relationship/comment interfaces and integration, repost lifecycle,
dynamic personalized share images, notifications delivery, prayer semantics, feed
ranking and physical-device installation. Canonical social events are metadata
intents; no outbound delivery consumer or email/push activation is included.
Production upload availability stays honest and provider-controlled. Media tagging
approval is separate from text mentions and remains unimplemented. Original
legacy blueprint detail remains a source-reconciliation gap in the private
handoff; mapped legacy steps are not claimed complete by this bounded release.
