# Photo viewing and phone guidance

12 September 2026 · Verified locally; production identity recorded after release.

Profile avatars and covers open the shared permitted photo viewer. Published post
galleries use the same viewer in saved order, with caption/alt text, a current
photo indicator, Previous/Next, swipe and keyboard controls, and bounded zoom.
Only opened photos request large derivatives. Current account/source access is
rechecked on entry and foreground; unavailable photos are concealed. Close,
Escape and Back preserve page position and focus. Feed avatar links keep their
existing behavior. This release does not add photo retention or new upload rights.

An existing friend's invitation scan shows the current friendship, Open profile
and Share your own QR without another Connect prompt. Remaining email/adult
requirements are explained separately. Verification entry retains a validated
return path; foreground checks refresh eligibility without a forced reload.
Exact-body retries, removal tombstones, blocks and account guards remain intact.

Menu and invitation pages show a dismissible Home Screen banner for Apple mobile
guidance or an actual available install prompt. Permanent Menu help remains after
dismissal. Safari instructions cover More/Share, Add to Home Screen, Open as Web
App where shown, Add and Edit Actions. Embedded-app guidance includes a selectable
copy-link fallback. Device hints select help only; synthetic events and accepted
clicks are not physical installation evidence. No service worker is introduced.

## Verification

- Production-mode local build, type check, focused lint and runtime trace audit
  passed: 116 traces, 9,385 entries and 283 server JavaScript files.
- Nineteen focused service/HTTP cases passed: four gallery/sharing, thirteen
  invitation and two real HTTPS image-boundary cases.
- Eighteen browser groups passed: eight invitation, five installation and five
  photo-viewer groups. Fixtures use actual processed images and current services.
- Browser coverage includes ten photos, long captions, keyboard/Back/focus,
  320/390/1440px reflow, reduced-motion nested feed swipes, removed images,
  withdrawn source posts, account switching, unverified existing friends,
  unchanged retries after a lost response and truthful install capability.
- Release-content validation passed both cases. Product version is
  `2026.09.12.5`; the maintained guide includes photo viewing and updated help.

The QR browser retry test initially lacked the isolated certificate trust. It
passed after using the fixture certificate through NODE_EXTRA_CA_CERTS. There
were no final browser page errors. Automated tests use fictional isolated data;
physical-device acceptance remains separate. No schema, provider configuration,
church permissions or production application records changed for this slice.

## Production receipt

Product `2026.09.12.5`, application
`14b31e1b10c4ea1e068d13e2b1ff594d3864d3e8`, is live on READY deployment
`dpl_GGvKFZ1q8jY7xXXb9MUWQzG7Rmu6`. The canonical domain independently
matched it. Twelve live checks passed at 05:18 UTC on 12 September 2026, including
version/notes/guide, downloaded QR decoding, safe signup return, simulated iPhone
help, private media and maintenance gates. Zero application writes, browser page
errors or deployment error entries were observed. All 28 production migration
checksums match; no migration was applied. Physical enlargement/installation
acceptance and operational church verification remain separate.
