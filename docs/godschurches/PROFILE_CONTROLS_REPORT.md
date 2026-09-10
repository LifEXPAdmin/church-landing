# Profile photos and readable customization

September 10, 2026 · `codex/profile-controls`, based on image foundation
`35f7a53c8c9e5ff09c1ced2b4764461795953d0b`.

## Implementation

Members can choose, crop, zoom and reposition an avatar or cover; add an optional
photo description; save, replace, recrop the normalized original, or explicitly
remove it. Three labeled keyboard-operable sliders provide the same crop shown
in the preview. Avatars are square/circular; covers use a 3:1 crop. Responsive
WebP derivatives reserve their dimensions and bypass the shared image optimizer.
Missing avatars use initials. Failed image delivery offers a retry. Originals
are fetched only when the member explicitly chooses to adjust an existing crop.

The input limit remains 4 MiB for a still JPEG, PNG or WebP. The browser checks
size and file signatures before exposing a local preview; the server retains
its full decoded-size, animation, orientation, metadata and output validation.
Crop coordinates are normalized and bounded, included in the retry fingerprint,
and persisted with the image. Cropping follows orientation; the normalized full
original remains uncropped so later adjustments retain the full frame.

An actual upload percentage changes to a processing message after transfer. A
failed, stopped or unconfirmed request retains the selected file, crop and
request identity. Retrying checks that same upload. Replacement keeps the last
saved image until the new one is ready; removal requires an explicit choice.
Conflicts offer the current saved image for review before replacing it. Unsaved
photo selections block the text-profile save, and in-flight text saves disable
all profile inputs. Ordinary link navigation and document unload warn about
unsaved work; browser history within the client router is not intercepted.

The profile editor retains name, bio, location, website and interests, and adds
three readable accent palettes, three cover backgrounds, About/Posts ordering
and a pinned introduction of up to 1,000 characters. These are fixed presets,
with no custom HTML or CSS. Each palette has light and dark colors with normal
text contrast, respecting the reader's appearance. Profile prose and interests
use the reader's chosen text size. The profile itself adds no animation.

The member page has stable About/Posts anchors, omits an empty About section,
and has a useful empty Posts message. An optional introduction sits above the
ordered sections. The profile shows only posts the current reader may access;
church-authored posts do not become an individual's personal posts. Existing
post pagination, actions and return destinations remain in place.

## Privacy and persistence

`ProfilePresentation` stores the bounded appearance fields with a positive
version and database constraints. The additive migration
`20260910160000_profile_controls` also adds image crop metadata. Existing account
fields stay in place, and accounts without presentation records receive defaults.
Versioned saves serialize with the existing account/access locks. Competing
changes produce an explicit conflict; the client retains its entries, shows the
latest saved fields, and requires another deliberate save after review. Legacy
text-only updates preserve appearance and advance its version.

Profile page, editor and API reads recheck the current session inside the shared
permission transaction. Guests receive the Join/Sign in prompt before any member
profile query; full profile fields and uploaded profile media remain unavailable
to anonymous requests. Only the owner can open audience previews. Visitor preview
uses a dedicated owner-only reader that returns only the author name/username,
including in development diagnostics, and explains the account gate. Member
preview shows profile details and public post summaries without assuming shared
church connections or allowing an action under a simulated identity.

Account email, credentials and church directory contacts never copy into the
profile. The editor API sends explicit fields, authorized image references and
no-store/Vary headers. Original and derivative delivery continue to check current
access, including revocation, deactivation, changed audiences and replacement.

The owner-only account export now includes presentation and personal image
metadata: crop, caption/description, state and dimensions with authorized relative
image links. It excludes storage paths, provider URLs, request fingerprints and
binary payloads. The total archive cap is now 4 MiB, below the hosting response
limit, with the existing 2,000-row cap and explicit failure instead of truncation.

## Verification

Verification completed locally: 313 distinct automated checks, 311 passing and
two expected disabled-delivery skips, with no unresolved failures across the full
sweep and corrected remaining runs. The sweep stopped at the new profile HTTP
check; its failures below were fixed, then all 24 remaining development HTTP
checks and all 86 production HTTPS checks (84 passing, two expected skips) passed.
The final profile service group also passed again. Fresh/additive migrations and
backup/restore preservation passed before the sweep reached HTTP testing.

Final lint, standalone TypeScript, build and whitespace checks passed. The root
production build passed 90 runtime traces, 7,126 entries and 221 server JavaScript
files, with no private fixtures/environment files or Prisma configuration loader.
The final browser copy was rebuilt from the application source. Final visitor
preview UI, keyboard conflict focus and export copy were checked, and no browser
errors were returned. Fixture servers and test tabs were stopped; browser reading
preferences and viewport overrides were restored.

Initial focused checks passed: five crop/style tests and fifteen profile/image
service and boundary tests. They cover rotated pixel placement and uncropped
originals, extreme crop bounds, invalid presets, contrast, concurrent profile
writes, legacy updates, revoked sessions, member preview audiences, interrupted
replacement/retry and export privacy. Migration applied successfully to the
existing isolated fixture. A full regression attempt found a test assertion
that expected an exact `Vary: Cookie`; Next also adds its router values. The
assertion now verifies that Cookie is present in the combined header. A later
check found that the owner visitor preview rendered minimal text but awaited a
full profile DTO, making unused fields available to development diagnostics.
The dedicated reader and early page branch now return only the minimal identity;
actual HTML and RSC checks pass for both guests and the owner. This was an
owner-preview projection issue; guest profile gates already passed. The editor
text assertion also now accounts for React's HTML comment separators.

Actual browser checks used only fictional accounts and generated image fixtures:
Chrome and the in-app browser, native/file-chooser upload, rotation, keyboard
crop/zoom, lost-response recovery to the same image ID, recropping, invalid and
oversized file rejection, removal/cancel, a large valid cover, profile save/reload,
two-tab conflict review and explicit resolution (including focused review and
retry feedback), guest/member/owner previews,
320/390/1,226-pixel layouts and the largest 24-pixel reading text with reduced
motion selected. A separate member sign-in saw the saved profile and images.

Chrome's extension upload helper lacked file-URL permission. The native chooser
completed the first upload; the in-app browser's supported chooser completed the
remaining checks without changing permissions. This is a tooling limitation,
not proof that application uploads or filesystem access are unavailable.

The browser fixture uses a production UI with real local development account
and image boundaries on loopback HTTP. Separate harness requests exercise the
actual Next handlers and verified production HTTPS. These are desktop browser
checks, not physical Samsung, OS 200% text, OS reduced-motion or device recordings.

## Release and next action

This checkpoint is local and unpublished. Calendar remains the live release.
Production storage is still disabled; no real user image, provider store, email
or message was created during these tests. Post photo galleries/reordering,
church identity controls, reduced-data behavior, durable cleanup activation,
actual private Blob delivery and integrated device acceptance remain later work
under the images/profiles assignment. Wider social release gates remain in force.
The next active priority is the existing password-recovery activation task;
profile work is being saved before returning to that account-access dependency.
