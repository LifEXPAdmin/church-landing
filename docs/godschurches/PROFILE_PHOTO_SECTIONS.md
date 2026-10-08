# Typed profile photo section

8 October 2026 UTC. Implemented and locally tested; integration and release acceptance remain open.

## Contract and reused owners

Existing testimony, skills and links remain the supported plain-text controls.
This extension adds an optional photo section through the same profile editor,
versioned account save and typed modules JSON. There is no additional editor,
uploader, schema, photo audience or provider activation.

`photoIds` is an optional ordered array of at most six distinct canonical asset
identities. Unknown fields, malformed identities, arbitrary URLs and duplicate
references are rejected. A newly selected source must be an owned, READY
`PROFILE_PHOTO` with a nondeleted, nonhidden personal-photo association. The
existing upload processor and permissioned image delivery remain authoritative.
Unchanged unavailable references may be retained or removed without blocking
unrelated profile edits; retaining a reference never restores source access.

The optional module order accepts the original exact testimony/skills/links
permutation or the new exact four-slot permutation including photos. Legacy
three-slot records retain their text order with photos last. A legacy writer
with an explicit three-slot order updates only the text positions of an existing
four-slot order, preserving the photo position. Omitted references or order
preserve saved values. An explicit empty photo array removes the selection.
The compatible decoder, writer and editor must ship together. An older strict
application is not a safe rollback after this new key has been saved.

The owner selects and reorders photos in the existing unsaved profile draft.
Source metadata is transient and current; it is not copied into profile JSON,
local storage, module recovery receipts or text drafts. The normal expected
owner/version, failed-save retention, uncertain-response and explicit
latest-version conflict review remain in force. No new exactly-once profile
save guarantee is introduced. Removing a profile reference does not delete a
photo or change its audience. Appearance-only reset preserves photo selections.

## Current access and display

Member HTML and RSC omit raw selected photo IDs, unavailable counts and copied
photo metadata. A separate bounded current-access read returns only permitted
image projections in saved order, tied to the viewer, profile and presentation
version. It requires the expected account and canonical profile visibility,
then applies the original photo policy together with the nonhidden/deleted
checks. A generic member preview has no owner or church powers: member/public
photos may appear, while Only me and church-only photos do not. Visitor preview
remains identity-only.

The photo section participates in the existing About order. Empty or completely
inaccessible photo collections render no photo heading or unavailable-item
placeholders. Its read observer remains available to recheck current access.
Concealment removes transient metadata and media, invalidates pending replies
and preserves only the original owner's unsaved reference choices in the editor.
Image bytes still pass current canonical derivative authorization. Data saver
uses small previews; larger images require the existing deliberate action.
Current member/block, photo deletion, library hiding, audience and recovery
changes cannot be replaced by cached copies of source content.

## Storage and recovery

Own account export already includes presentation modules and separately owned
photo metadata. Account erasure already deletes the presentation and its owned
media. The existing opaque `PROFILE_MODULES` receipt and replay clear obsolete
restored module JSON and advance the presentation version without copying photo
references into the journal. No export, erasure or recovery owner is duplicated
or modified for this extension. Focused export, erasure and replay tests passed.

## Local acceptance

The final production build `6hcTVGZsbCUFy92YtRVr1` bound 1,720 source inputs
on Node 24.20.0. All 43 focused test groups passed with no skips: 31 isolated
service and regression tests, three real HTTPS groups and nine browser groups.
The browser run used the repository runner unchanged against that build and
recorded no page errors or external requests. Source hashes were checked before
and after each runtime job. Type checking, the production build, copy and source
security checks passed. Full lint reported zero errors and 39 existing warnings.

Coverage includes strict identities and legacy-writer preservation, new versus
retained source validation, generic preview permissions, version conflicts,
current image authorization, export, erasure and recovery replay. Browser checks
exercise picker/save/reload, retained drafts across account changes and offline
state, failed-save retry, appearance reset, keyboard ordering, native Back,
concealment and held fresh reads, ordinary foreground revocation, Data saver,
320 and 1,440 pixel layouts with enlarged text, and a denied photo-only profile
regaining its section without reload. The viewer keeps one history entry while
concealed and refreshes current media permissions when its section refreshes.
The existing photo-library flag hides new selection/display when disabled while
preserving saved references through unrelated edits.

A separate PostgreSQL storage probe combined maximum supported text, links,
featured references, calendar identity and six photo identities. Its JSONB value
used 11,884 of the existing 16,000 byte limit. No storage limit was widened.

Earlier failed runs remain in private evidence. Harness corrections aligned the
existing profile POST account-mismatch status, used native forward/reverse Tab
navigation and headed window focus, explicitly rechecked sign-in after offline
recovery, selected the actual appearance combobox roles, and entered long pages
through their existing section links. Diagnostic passes are separate from the
final canonical acceptance. An earlier unsaved-changes modal was not reproduced
and its cause remains unproven; it was not suppressed by a product change.

The final check used fictional local accounts and generated images. Desktop
window focus and browser Back are not physical-device tests; a 32 pixel root
font is bounded text enlargement, not browser-zoom conformance. No application
schema, dependency, provider or native API change is included. The local app,
HTTPS proxy and database were stopped and their ports verified closed.

The designated release owner still needs combined-source verification and live
acceptance. The inherited dependency advisory gate remains unresolved; this
feature does not waive it. Publish the compatible reader and writer together.
No merge, deployment, production write, provider send or physical-device
acceptance is claimed.
