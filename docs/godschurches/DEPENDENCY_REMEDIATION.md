## First catch-up candidate, 8 October 2026 UTC

The artist privacy candidate from `27e81cc` now combines the reviewed compatible
security repairs without importing unrelated feature stacks. Next and its lint
configuration are 15.5.27 from `89001b`; the four hydration renderer checksums
remain unchanged. Sharp 0.35.5, its matched platform/libvips records and
source-map-js 1.2.2 come from `535778a`. The scoped selector-parser 7.1.6 override
comes from `9b85fbe`. Every replaced lock record was matched against its reviewed
source, and unrelated records were preserved.

The fresh lock-only audit after these changes reports seven high package
findings, all from the unpatched braces advisory GHSA-vfj7-8cjw-p6xm. It reports
no other advisory. This is not security clearance: the full audit remains fatal,
and no exception is activated. Source validation passes; clean installation,
hosted signatures/static checks, combined build, artist service/recovery,
HTTPS/browser verification and canonical production acceptance remain required.
The dated release entry is candidate content, not evidence of publication.
