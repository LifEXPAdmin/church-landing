# Language and location settings boundaries

September 12, 2026. Focused capability reconciliation, not activation of a new
location or translation service. Read [feed boundaries](FEED_SETTINGS_CONTRACT.md)
and [profile disclosure](PROFILE_SETTINGS_REPORT.md) before integration.

| Scope | Existing authority | Required separation before expansion |
| --- | --- | --- |
| Interface language | App root is `lang=en`; current product copy is English. No complete translation-pack registry or saved locale exists. | A future interface-language choice identifies a shipped, complete UI pack. It cannot change author text, feed filtering or profile location. Never offer unbuilt packs as complete. |
| Content language | Current post/search services do not classify source language or store a personal language filter. Content may use any language its author enters. | A separate content-language preference would filter eligible content only after an authoritative source-language contract exists. It must not inherit a private faith/background choice or change interface language. |
| General discovery location | No private manual discovery-city/radius preference or locality authority exists. Feed remains subject to the feed service prerequisites. | Future city/region input is private discovery context, independent of profile disclosure. Saving it must never populate profile location, a street address, church membership or an event location. Manual entry must work without device permission. |
| Member profile location | Existing profile editor accepts optional free text up to 80 characters through the versioned profile update. Member-profile reads expose it only through existing active-account/block/member rules. | This is deliberately shared profile text, not private discovery input or precise coordinates. Clearing it is supported. The interface must identify its profile audience; do not relabel it as a private city field. |
| Precise device location | No geolocation request or location-storage workflow is activated. | A browser grant is only device permission, not consent to publish or retain coordinates. A later workflow needs explicit purpose, coarse conversion, storage/cleanup and permission-denial behavior. It cannot be required for manual city entry. |
| Date/time presentation | Calendar commands validate IANA source zones. Event cards use the source zone for SSR, then explicitly label the device zone; local browser formatting is existing presentation behavior. | Source event/calendar zone, viewer presentation zone and any future personal format choice are distinct. A region preference cannot rewrite an event's time or imply a home church. No global date/time preference is currently stored. |

These scopes must have separate authoritative fields/capability values when
implemented. No default or migration may derive one from another. The existing
five-field reading cookie contains none of them and must not be extended by a
Settings adapter without the owning persistence contract. Current English UI
and unfiltered author-language content are facts, not invented saved preferences.

The language/location form and regional-format integration remain gated by the
missing localization and private discovery-location capabilities. The current
profile editor can collect a voluntarily disclosed general location without
requesting geolocation, but that does not satisfy private discovery-city saving.
No new language selector, device prompt, coordinate collection, geocoding provider,
faith inference or disclosure toggle is enabled by this contract checkpoint.

Reconciliation inspected the actual app root, schema, profile form/update/export
and member-profile reader, reading preferences, calendar time validation and
local-event display, current search/feed services and Settings registry. This is
code/contract inspection only; it does not claim runtime verification of absent
localization or location features. Parent and owner acceptance remain open.
