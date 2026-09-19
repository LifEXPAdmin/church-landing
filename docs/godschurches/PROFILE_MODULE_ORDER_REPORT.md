# Optional profile section ordering

## Behavior and compatibility

Members can move testimony, skills and links within About using the existing
profile editor. The order is saved with the same owner and profile version as
the content. Empty sections stay hidden while retaining their chosen position.
About/Posts order, biography, introduction, photos and canonical pins retain
their existing behavior. Calendar and featured media remain unavailable until
their source and audience adapters exist.

The optional order is a bounded three-item permutation inside the existing
modules JSON. Old records use the original order. Old clients that omit the new
field preserve a valid saved order when updating content. Invalid, duplicate or
unsupported identities fail without changing the profile or recovery receipt.
The same module renderer serves real members and permitted member preview;
visitor preview still contains only name and username.

An order-only edit engages the existing unsaved-change guard. Keyboard controls
retain focus after their rows move. Boundary controls remain focusable with
`aria-disabled` and guarded actions. Movement is announced to assistive software.
Save errors keep the local order. Concurrent or uncertain saves require reviewing
the latest stored order before explicitly applying the retained draft.

No schema, migration, package or provider change is required. The existing opaque
module recovery control protects the complete document, including ordering.
Stale restored content is cleared, newer reviewed saves remain, and erased owners
are not recreated. Own account export includes the order. A rollback to the older
strict decoder hides documents containing the unrecognized order field, without
erasing their contents; deploy the compatible decoder and editor together.

## Verification checkpoint

Focused isolated checks cover ordering and legacy content edits, malformed and
stale writes, own export, audience projection, empty sections, text bounds and
protected replay. The profile settings browser regression covers existing image
retry, navigation and conflict behavior. Built browser acceptance additionally
checks order-only navigation protection, keyboard first/last movement, reload,
member/visitor views, invalid input without writes, lost-response recovery and
two-session conflicting orders.

Visual review found movement labels breaking into individual letters at doubled
text on a 320px viewport. Controls now wrap as whole buttons; the browser suite
asserts single-line labels as well as page width. Initial HTTPS transport setup
also needed the fixture certificate in the Node client trust configuration. This
was a test-client setup failure, not a production certificate change.

The final rebuilt browser suite passes eight groups with zero page errors or
attempted external requests. Enlarged 320px and desktop screenshots were reviewed;
automated layout checks also cover 390px. Five existing profile-settings browser
groups pass before the final CSS-only movement-label correction. Nineteen focused
service, profile and recovery checks pass with zero failures or skips. TypeScript,
scoped lint, copy, formatting, diff and the independent production build pass.
The build verifies its hydration repair and 224 runtime traces without private
fixtures or environment files.

On September 19, 2026 UTC, the uninterrupted complete isolated support gate exits
successfully after 49.24 minutes of measured runtime. All 194 discovered test
files pass, with 1,238 passing executions, zero failures or cancellations, and
two expected production-stage skips for development-only email cases that passed
in development. The ordering and protected module replay checks pass within this
run. Coverage includes staged migrations, dump/restore, development requests,
production HTTPS HTML/RSC privacy, an actual process restart and every remaining
discovered regression file. The tested implementation remained unchanged.

Tests use fictional isolated data with external delivery disabled. No production
migration, application write, recipient send, main push or deployment was made.
Integration and verified live acceptance remain open.

## Runtime cost and handoff

Release copy for integration: "Choose the order of My testimony, Skills and Links
in Edit profile. Your saved order appears in About, and empty sections stay hidden."

The renderer sorts at most three enabled sections. Profile reads use the existing
query and bounded JSON; there are no additional requests, database queries,
provider calls, polling or runtime dependencies. The small order array travels
with the existing profile save. Its journal uses the existing bounded recovery
write and protection attempt. No measured performance improvement is claimed.

Integrate the tested commit with the current shared main, verify combined profile
behavior and publish under the integration owner's release lock. Passing this
branch alone does not establish the feature's live acceptance. Physical-device
and future calendar/media behavior are outside this implemented scope.
