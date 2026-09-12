# Mission presentation and Home return

September 12, 2026. Visitors see the approved mission before generic Home/feed
chrome, with the existing signup, community search and anchored About routes.
About and the manifesto introduce the same calling, and both public and platform
footers share one signature. Returning members retain their ordinary Home.

The existing transient registration acknowledgement carries the welcome heading
and working discovery links. It remains a neutral, non-enumerating response:
it does not establish that an account was newly created, sign anyone in,
create a post/follow, or grant church access. Separate sign-in retains its original
intended return. No onboarding persistence, permission or provider change.

Browser verification exposed a repeatable Home return defect. The initial feed
position write could run before the router installed its history integration,
clearing the state that Back needs. Deferring that initial write to the next
animation frame preserves router state and cancels the write when unmounted.
Later position updates and focused-reader transitions retain their existing
behavior. This has a reproduced before/after; it does not explain or close the
separate older intermittent hydration warning.

## Verification

Four built-browser groups pass with no browser errors: empty and populated guest
Home; exact copy/actions and a single footer; 390 by 844 first-screen visibility;
320/390/1440 widths, both themes and doubled text; keyboard order; About anchor,
manifesto/Menu links and actual Back restoration; returning-member composer and
focused-reader Escape/Back; fictional registration acknowledgement, separate
sign-in/return and no church grant. The primary phone action ends at 547px, above
the navigation at 769px. Screenshots were visually inspected. These are automated
browser checks, separate from physical phone acceptance.

Fourteen focused navigation/release tests, scoped lint, types and production build
pass. Runtime trace verification excludes private artifacts. No schema change.
Release status is recorded after independent deployment and canonical live checks.
