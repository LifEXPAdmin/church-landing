# Regional presentation and independent location disclosure

September 16, 2026 UTC. Implementation contract for the next increment; it is
not a claim that the controls below are deployed. The current published Language
and location integration is documented in [its receipt](LANGUAGE_LOCATION_ACCEPTANCE.md).

## Regional formats

Use one account-owned date/time preference, version and exact-request receipt.
Date choices are the existing website default, month/day/year, day/month/year and
year-month-day. Time choices are the existing website default, 12-hour and
24-hour. Defaults preserve existing presentation. Every supported choice has a
preview using the same formatter as the actual interface. English is the only
complete interface language; unrecognized or missing presentation text has a
readable English fallback. Content-language filters remain in their existing
discovery owner. No translation provider is needed for these formatting choices.

Keep formatting separate from event/calendar source zones, explicit viewer zones,
device zones, quiet hours and source instants. All-day dates remain calendar dates
and never shift through a viewer timezone. Ordinary visible platform timestamps
use the saved presentation, including calendars, conversations, activity and
account/request views. Machine-readable exports, source timestamps, release
identifiers and deliberately named reporting zones retain their canonical form.

Revalidate owner/version before saving. A failed or unknown result retains input;
retry an identical pending command only. Switching/losing accounts clears private
controls. The next authenticated session reads the same account value. Formatting
grants no role, disclosure or content access. Reuse the existing session read
without another startup request. Include owner preferences in export and erase
them on permanent deletion. A restore may return an earlier presentation choice
but must not restore a privileged proof or alter an event instant.

## Profile location audience

Discovery city remains private and independent of the optional profile text.
The profile owner can retain that text as Only me or share it with permitted
signed-in members. No anonymous, child, inferred-church or family override is
introduced. Existing stored profiles keep their existing permitted-member
visibility until the owner changes it; newly hidden data is absent from member
and generic-member-preview payloads, not merely hidden by CSS.

Use the existing versioned profile edit, account pinning and read boundaries.
Changing visibility does not change the value, discovery choices, relationships
or church membership. A restricted/inactive account cannot publish a broader
audience through an alternate endpoint. A legacy editor without an audience
control can still save an ineligible owner's new location as Only me. Explicit
member sharing requires verified adult eligibility. Export remains owner-only. Permanent
deletion erases the text and preference. Record opaque privacy versions through
the existing protected control journal; never replicate the location text.
Replaying a newer privacy change into an older backup must conceal or clear the
stale location and require deliberate owner review before sharing again.

## Required acceptance

Verify independent date/time choices and exact retries, switched/stale accounts,
new-session persistence, both daylight-saving changes, all-day events viewed
abroad, invalid dates/zones and readable unsupported-language fallback. Verify
Only me through real member/guest/preview HTML and serialized endpoints, current
profile conflicts, unchanged discovery and relationships, owner export, erasure
and protected restore. Use isolated fictional accounts for mutations. Complete
the shared Settings/profile interface, Help/release notes, migration/recovery,
full applicable gate and exact live release before scoped completion.
