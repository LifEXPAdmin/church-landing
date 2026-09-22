# Calendar sharing disclosure previews

September 22, 2026. Local implementation, production build and affected service/HTTP checks
pass. Live release acceptance remains pending; production still serves
`2026.09.22.3`.

The existing owner-only calendar and event sharing screens compare busy-only
availability with full event details using an already authorized occurrence.
The busy preview passes only timing fields into its client formatter; the full
preview renders the supplied title, notes, location, online link and organizer.
Both are read-only. Existing forms retain audience, confirmation, version,
retry, conflict and revocation behavior. An independent full-detail share can
still reveal details. The calendar sample is explicitly one active event in the
current month; whole-calendar sharing continues to include future events.

There is no new query, endpoint, store, permission, subscription, provider or
child-account feature. Existing adult eligibility, current membership and
church edit/publication duties remain authoritative. Empty or canceled examples
have a useful explanation without an invented sample or false saved value.

The accepted profile Calendar slot already consists of one selected canonical
event occurrence. Current profile event/module checks pass all 12 cases,
including source disclosure, busy-only denial, blocks, generic previews,
legacy/stale saves, export and protected recovery. That implementation is reused
under the [accepted module contract](PROFILE_MODULES_CONTRACT.md) and dated
[profile-event release receipt](PROFILE_EVENT_LINKS_REPORT.md). A whole-calendar
profile feature is not inferred from an older task title.

All eight built-browser groups pass, including four existing Calendar Settings
regressions and the four new preview groups: Settings entry, an empty
month, actual busy/full comparisons, keyboard expansion and enlarged text;
confirmed BUSY disclosure in another member's HTML and JSON; independent shares
and revocation; and denied unverified, non-adult-acknowledged, outsider and guest
sessions. Previewing performs no write. The browser found and reproduced a
320-pixel enlarged-text overflow in the existing month/time-zone grid. Explicit
one-column sizing, zero minimum widths and a bounded month input repair it.
The initial failure and corrected evidence are preserved privately.

Twenty-five calendar/navigation/Settings/release checks, twelve profile reuse
checks and seven built HTTP checks pass. TypeScript, focused lint, website copy
and the clean production build pass. The build validates 231 runtime traces,
76,843 entries and 573 server JavaScript files; no private fixture is bundled.
The hydration repair remains 173,096 bytes with its accepted checksum. The
prior 199-file regression remains dated baseline evidence. This presentation
change reruns affected checks, with no claim that the full suite was rerun.

The seven runtime source files match the built candidate. Canonical calendar,
profile, permission, preference, schema and recovery owners are unchanged. The
comparison adds no request, query, dependency or persisted value. Rolling back
to the previous application needs no data or schema conversion. No speed
improvement is claimed. Authenticated editing uses fictional isolated records;
production-member editing and physical-device acceptance are not claimed.
