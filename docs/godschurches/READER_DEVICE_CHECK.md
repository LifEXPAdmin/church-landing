# Bible-page reader device acceptance

The reader checkpoint is local until a release receipt says otherwise. The
current public website must not be mistaken for the new implementation. Use a
confirmed, reachable isolated fixture preview for populated write tests. Record
its application commit and URL first. Never bypass a browser certificate warning.

## Prepare

Use the existing account/portal fixture harness, with fictional accounts and
providers disabled. Prepare three known posts A/B/C: A contains long paragraphs,
B has a church-only poll and one remaining volunteer place, and C is a public
personal post. Add enough older posts for a second set. Record the post IDs,
fictional account labels and expected order in private test evidence. Keep test
passwords in the private fixture handoff, never in a recording or public report.

Identify the physical Samsung model, Android version, browser/version, date,
viewing orientation and text-size setting. Start with the browser's ordinary
settings, then repeat key checks with enlarged text and reduced motion. No new
paid service is required; use the existing phone and an approved test preview.

## Record two short clips and the results

1. With motion enabled, start on A. Swipe right from the middle of ordinary
   post text to B, then swipe left to A. Each deliberate gesture moves one post;
   the outgoing paper page hinges and casts a changing shadow. Use the visible
   controls too. Record this sequence and the first/last boundaries.
2. Scroll down the long post, select text, pinch to zoom, use a poll choice,
   comment input and signup button, and try the phone's normal edge navigation.
   These must not accidentally turn a reading page. Test the browser's own
   gestures naturally; an artificial event is not physical-device evidence.
3. On B, type an unsent comment and select a ballot option. Turn to C and back;
   switch List/Pages using the visible toolbar. Both entries must stay with B.
   Refreshing or following a link with unsent entries must explain the choice.
   Submit the ballot, comment and a reservation individually. Confirm the
   selected post and saved results after refresh. Verify writes against the
   same fixture records; never test capacity against real volunteers.
4. Open C's author profile and use browser Back. Return to the same post. Open
   an older set, return, and check no first/last boundary wraps unexpectedly.
   Have the test operator withdraw the selected fixture post, then refresh:
   the unavailable message must appear and withdrawn content must disappear.
5. Record a second short clip with reduced motion enabled: turns should be
   immediate. Repeat with the OS motion setting and then the website setting.
   Check ordinary keyboard/focus and the page-position announcement with the
   device's accessibility tools where available.
6. At enlarged OS/browser text (including 200% where supported), read the end
   of the long post, use the poll and reservation controls, and compare List
   and Pages. Text must remain readable without clipped actions or sideways
   page scrolling. Test portrait and landscape, light and dark appearance.
7. In a signed-out browser, read public posts and comments and public church
   pages without an interruption. Member profiles and account actions should
   open the contextual Join/Sign in screen. Church-only post B must be absent.

Save the two clips, observed results, URL/commit, device details and any requested
changes in the private phone-review record. Identify each untested step explicitly.
The engineering checkpoint and the integrated physical-device acceptance have
separate completion criteria; a desktop viewport does not complete this review.

## Current automated and browser workflow

Use `npm run test:support` for the isolated database and real development/
production HTTPS regressions, including reader navigation and action-return
tests. Use the available browser-control surface for actual interactive checks.
The historical `scripts/check-platform-design.mjs` reflects the earlier reader,
contains obsolete selectors/defaults/directions and uses a different browser
transport; it is not current reader acceptance evidence.
