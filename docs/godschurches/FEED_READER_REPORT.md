# Focused My feed reader

## Integrated reader candidate — September 10, 2026

Home and My feed now use the audience-aware post service, including frozen
cursor/anchor handling. The early community mode includes all currently
eligible posts while preserving church privacy and publication checks. The
following mode retains personal, followed and eligible church selection.

Opening full-screen no longer remounts the post forms. A stable modal wrapper
retains the same mounted posts, makes outside siblings inert, traps keyboard
focus, and restores document scrolling and the opener on close. It follows
the [WAI modal interaction pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/).
URL changes retain Home's reading mode and selected post. Page animations target
the newly visible mounted card, with reduced-motion overrides. At narrow
font-relative widths, navigation places the counter above the buttons and
removes decorative icons to keep enlarged labels readable.

Chrome verified unsent comment preservation through opening, both directions,
closing and Back/Forward; text-input arrows, Tab/Shift+Tab containment and focus
restoration; guest engagement prompts without writes; and actual Mobile-mode
320/390px layouts at 200% OS text/reduced motion. Native touch-style drags on
post text turned in both directions. Long-post scrolling stayed inside the
reader, a short vertical pull stayed open and a deliberate pull returned Home.
All emulation settings were restored. Physical phone gesture feel remains open.
The full integrated suite passed 374 tests with two expected disabled-email
skips; the final CSS build and 29 affected HTTPS checks passed with no failures.
Publication follows this candidate checkpoint; the earlier published reader
receipt below describes the pre-integration release.

## Published release — September 10, 2026

Application `7fdaf6a1cbb88f87ab4451f91586a4d803a8c226` is published on READY
production `dpl_DrpPVcC5FY7yVth5RfsDaM5h5zBU` through the existing GitHub
integration. Exact canonical serving identity and all 17 live read-only checks
passed at 20:19 UTC, including account availability, Home/feed HTML and RSC,
Menu, empty feed and protected Settings. Actual signed-out live browsing paged
through both available public authors at 390-pixel width, kept the background
locked without horizontal overflow, and closed to normal Home scrolling.
No real post, like, comment or account was changed during release verification.
No browser or deployment error rows were returned.

Chrome device emulation was also exercised through its native UI on the built
isolated app. Native drags on post text (where mouse paging is disabled) verified
both touch swipe directions, a small vertical drag staying open, a larger
vertical drag closing to Home, and a long-post touch scroll reaching 2,195 pixels
while the background stayed fixed. Device emulation and viewport overrides were
turned off afterward. This verifies browser touch-event handling; physical
phone browser chrome and the owner's preferred gesture feel remain follow-ups.

## Implementation — September 10, 2026

`codex/focused-feed-reader` builds on the published early-community/account release
`3d931bd`. My feed has a dedicated public route, `/platform/feed`, and entries in
primary navigation, Menu and the Home feed. Home keeps its normal List/Pages
reading preferences and scrolling. Opening the reader from Home retains the
selected post and captures the scroll position; Close, Escape, deliberate drag
and browser Back restore ordinary Home browsing.

The native modal fills the browser viewport, makes the background inert and
locks document scrolling. It uses the existing public post cards and server
query, with one rendered post at a time. Short left/right swipes turn posts;
a larger outward vertical drag from a scroll boundary closes it. A gesture
started inside a long post remains a reading scroll when it reaches the edge.
The handle also supports mouse dragging. Horizontal trackpad gestures turn once
per gesture; vertical wheel scrolling reads inside the post. Controls, text
selection, multi-touch and browser edge gestures are protected. Visible
Previous/Next/Close, arrow keys, focus restoration, safe-area padding and reduced
motion are supported. No Fullscreen API permission is requested.

Post IDs and finite pagination stay in the URL, older sets stay in My feed,
and mutations return to the selected focused post. The account-return allowlist
accepts only the known feed route; public author projections and all existing
server authorization still apply. Missing posts and empty sets have useful
states. No account, audience, ranking, schema or dependency changes are included.
The previous Following switch and separate unpublished role/audience work remain.
Broader Home design and future selectable/ranked feeds are separate work.

## Verification checkpoint

Three focused gesture/return-path checks passed. The development verified-HTTPS
run passed 15 checks: gesture boundaries, both email entry checks, all six public
browsing/privacy/account-return checks (including Home and My feed HTML/RSC),
and all four entrance/legacy-route checks. No production writes were used.

Actual fictional Chrome checks at default desktop, 390 x 844 and 320 x 640
verified the modal, controls, no horizontal overflow, arrow paging, a small
mouse drag returning in place, a larger mouse drag closing, trackpad paging,
long-post internal scrolling, likes, comments and unchanged selection while
typing arrow keys. Close/Escape and browser Back/Forward worked, focus returned
to Open My feed, and a normal visible click restored the exact 317-pixel Home
position. Semantic locator clicks initially moved the button into view before
opening, so the exact restoration check used the already-visible button.
No browser error/warning rows were returned. Physical iPhone/Android touch,
browser chrome gestures and the desired feel still need real-device acceptance;
resizing a desktop browser is not a physical-device test.

Final production build, lint and TypeScript passed. Runtime audit passed with
87 traces / 6,301 entries / 209 server JavaScript files. The production HTTPS
run and corrected remaining entrance group passed the same 15 checks with no
unresolved failures. The private runner initially supplied runtime production
variables to fixture creation, which correctly refused them; the runner was
corrected to keep its isolated test-sink contract while the actual server runs
in production with email disabled. The application and fixture guard were not
weakened. No schema/dependency changes required migration work for this reader.
The built production app also passed actual browser end-of-set/older-page
navigation: 30/30 exposed Read older posts, opened 1/19 in My feed, and keyboard
paging advanced to 2/19. Publication and live verification are recorded above.
