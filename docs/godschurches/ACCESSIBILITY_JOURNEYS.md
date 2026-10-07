# Accessible resource journeys

This audit follows installed listing, media and reading-settings journeys from
their entry points through correction, saving, reading and return. It reuses the
current source services, private read guards, retained requests and data-saver
controls. It does not add a second validation or navigation system.

## Journey coverage

| Journey | Actions and recovery |
| --- | --- |
| Exchange item | Create an incomplete private draft, identify a publication error, correct and save it, publish, filter the listing results, read, edit and return. |
| Media catalog | Create a draft, correct an invalid public source URL, review the source and rights, publish, find the catalog item, read and open/close its public QR. |
| Feed settings | Find settings through search, change resource choices, save, inspect the resulting feed, open focused reading, use Previous/Next and return with the feed state retained. |
| Reading and photos | Save reading, motion and data preferences; open a real attached photo, deliberately load its larger version, zoom, fit and return to its opener. |

The browser runner uses Tab, Shift+Tab, typing, Enter, Space and Escape. It records
settled focus before its next navigation helper can move focus. Phone checks use
a 320 CSS-pixel viewport with root text enlarged to 200 percent. This is text
resizing, not a physical-device or browser-zoom test. Light and dark text samples,
focus indicators and reduced-motion behavior have separate checks.

The runner is `scripts/qa-accessibility-journeys-browser.mjs`. Run it with
`node --import ./tests/register.mjs` and the ready isolated fixture directory as
its argument. That directory must provide `browser-env.json` and `test-env.json`,
an independently built HTTPS application and the fictional test database. Set
`NODE_EXTRA_CA_CERTS` to its certificate. The runner creates fictional accounts
through the existing registration, verification and sign-in services, blocks
external requests and saves private JSON evidence and screenshots in the fixture.

## Repairs

Listing text errors now name Title, Description, Requested items, Service area,
Availability or Self-stated qualifications. The existing text validator still
owns normalization and limits; incomplete private drafts remain valid. A
submitted result receives keyboard focus, while background access/version reads
do not. Creating a draft navigates to the existing editor page with a focusable
Manage listing heading.

The media source input uses its existing validation result for its error
description and invalid state. An attempted save with an invalid URL returns
focus to that input. An accepted save restores focus to its status only after
the current owner's refreshed editor is available. Blur, offline, page hiding
and owner changes cancel stale focus requests. Scripture errors describe the
existing named passage group without marking every individual passage invalid.

Feed-settings errors expose a focusable submitted result without changing the
pending request or retry rules. Successful navigation uses the existing
`#feed-choice` destination, so the next Tab starts at the feed choices. Narrow
More feeds controls and the media fieldset may shrink within their containers
when text is enlarged.

Photo actions that remove or disable their focused button move focus to the
existing photo surface. This covers loading the larger photo, fitting it,
reaching maximum zoom and reaching either gallery boundary. If a failed photo
has no surface, the existing Close photo control is the fallback. Recovery runs
only from the currently focused action; background reads do not request focus.
A failed image also returns focus to Close before removing its focused surface,
but only while that source and document remain visible, focused and online.
An error cannot move focus from another control.

No database query, schema, dependency, source permission, publication review,
consent or collection behavior is added. Focus bookkeeping stays inside the
existing components. The source and request owners remain authoritative.

## Verification and limits

The baseline reproduced unnamed listing errors, lost result focus, unassociated
media URL feedback and horizontal overflow at enlarged text. Early runner
failures involving native-select keys and traversal beyond the browser viewport
are preserved separately from product findings. Native keyboard type-ahead was
calibrated in this macOS Chromium environment.

Thirteen input groups and three affected listing-service groups pass against the
isolated fixture. The retained Media regression passes thirteen groups covering
privacy, account replacement, retained retries, source rights and lost receipts.
Its original offline recovery assertion predated the existing explicit sign-in
recheck; a private runner adaptation uses that visible action and preserves the
original failure. One deliberately activated external source attempt was blocked
by the runner, with no unexpected provider attempts or browser runtime errors.
The final production build `RCbozOrrM57wufobQ6s-F` passes types, copy, hydration,
runtime tracing and source-security checks. All 1,046 production/configuration
file hashes match its frozen build receipt. Repository lint passes with 39
existing warnings; the final photo repair and journey runner pass focused lint.

All seven browser journey groups pass with zero findings, runtime errors or
external requests. Each theme has 16 evaluated text-contrast samples and nine
focus-outline samples. Nine sampled surfaces fit a 320px viewport with 200
percent root text. The photo check confirms a decoded 240px preview and an
explicitly loaded, decoded 1000px larger image, with no original-image request.
Saved reduced motion works while the operating-system preference is off. Real
gallery boundary and failed-image checks verify both focus recovery and that a
delayed error cannot steal focus after the user moves to another control.

Earlier failed attempts remain in private evidence. They include the corrected
reading-provider selector and native keyboard traversal, followed by actual
photo focus defects repaired in successive production builds. Visual review
covered the narrow editor, settings, QR and photo screenshots. This preserves
the distinction between runner corrections and product repairs.

This is bounded installed-screen acceptance. Unbuilt modules, changes owned by
other concurrent feature branches, screen-reader interoperability and actual
Samsung/iPhone acceptance are not established by these scripted checks.
Integration, inherited hosted security gates and combined live acceptance remain
open.

The audit uses W3C guidance for [error identification](https://www.w3.org/WAI/WCAG22/Understanding/error-identification.html),
[focus order](https://www.w3.org/WAI/WCAG22/Understanding/focus-order.html),
[text contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html),
[text resizing](https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html) and
[reduced interaction animation](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html).
These checks do not constitute a platform-wide conformance claim.
