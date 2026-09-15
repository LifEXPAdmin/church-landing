# Dynamic public sharing images

15 September 2026. Implementation candidate for `2026.09.15.3`,
`public-sharing-cards`. Exact release and live acceptance remain in progress.

The existing public-preview endpoint accepts `format=png`. Its canonical
public-only projection supplies bounded title/description and the current kind;
caller copy, image URLs, sizes, contacts and private source media are ignored.
The shared paper/olive/ink layout, existing Church mark and bundled Noto Sans
produce actual 1200×630 PNGs. Ordinary HTML metadata wiring is preserved and now
points to the eligible current image. Static generic fallback is shared with
unavailable, member-profile, renderer/service-failure and unsupported-font cases.

Both the initial and post-render read recheck current source and viewer scope.
Former public image URLs become generic on restriction, withdrawal, removal,
cancellation, blocked viewing or an in-flight source change. Browser/CDN responses
are no-store; the shared optimizer excludes this route. No resource image or copy
is kept in Blob, disk or memory caches. Third-party caches already holding a copy
cannot be erased or controlled by these server rules.

The installed Sharp dependency renders text from a bundled licensed font without
remote font/image requests. Latin, Greek and Cyrillic are supported; missing glyphs
use the generic card while HTML preserves the original public title. Font bytes,
coverage, runtime traces, output size, rendering time and bounded source reads
must be recorded before release. No new table, worker, scheduled task, service or
runtime package is introduced. The static/React SVG and PNG paths share one layout.

Initial image/source service acceptance passes 23 of 26 checks. Three tests hit
the retained protected-recovery guard because the private runner reused a fixture
directory outside its new checkout. Correcting only the runner's owned fixture
paths makes those three pass. The failure remains preserved. Source restriction
during rendering and actual production HTTPS metadata/PNG checks are added to
the complete gate. Wide and square default/church samples have been inspected.

The existing Copy/native Share/QR, repost/quote, Bookmark and sign-in-return owners
are reused. Current production browser and exact live checks still need to pass.
Physical phone/self-draft preview, native share/crop and referral acceptance retain
the existing owner prerequisites; simulated browsers do not close those criteria.
Final batch review remains last.
