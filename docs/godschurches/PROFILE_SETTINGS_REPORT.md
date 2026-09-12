# Profile settings and optional disclosure

## Authoritative bindings

The Profile folder reuses the existing editor and photo controls. It links to the
existing church-directory service for separate optional contacts; no additional
profile/contact write API or private contact copy is introduced.

| Field | Requirement and current audience | Service owner |
| --- | --- | --- |
| Name | Required, 2–100 characters. Public contribution identity with username. | Account profile update and public author projection. Username is immutable after signup. |
| Bio, general location, website, interests | Optional; absent/empty values remain valid. Permitted signed-in profile readers. | Account profile update; member profile reader applies current account/block access. Limits: 500/80/120 characters and eight interests of 40 characters each. Website uses http/https. |
| Pinned introduction and appearance | Optional introduction up to 1,000 characters; typed appearance presets. Permitted member profile readers. | Versioned ProfilePresentation through the existing account boundary. |
| Profile photo and cover | Optional; current permitted signed-in readers. History and source photo audiences retain the existing media contract. | Existing media processing, owner/version/request-key checks and private delivery. |
| Directory contact email and phone | Both optional and separate from sign-in email. Each independently ONLY_ME or SAME_CHURCH, default ONLY_ME; listing defaults off. | ChurchDirectoryPreference on the current approved connection; portal sharing command and filtered directory/contact projections. |
| Sign-in email | Private account identity, excluded from profile and directory fallback. | Account email-change and verification service. |
| Street address and child disclosure | Unavailable. No storage field, address audience or child disclosure service exists. | A reviewed ownership, validation, audience, cleanup and age/organization contract must precede expansion. General profile location is not a substitute. |

Church contact choices require verified adult eligibility and a current approved
connection. Listing off resets both audiences to ONLY_ME while preserving the
owner's private values. Leaving/removal clears consent and current directory
access; rejoining does not restore it. The current service supports one combined
pending/approved affiliation. No new selector or multi-church consent assumption
is added. Field audiences never imply public disclosure or organization powers.

The editor groups identity, introduction, appearance and optional contact
guidance. Contact and Settings links use the existing unsaved-change guard.
Images save separately; selected photos must be saved or discarded before text
submission. Failed/uncertain uploads retain text and the stable upload attempt;
profile conflicts retain edits and require reviewing the authoritative version.
The built-browser check found a race between confirmed-save navigation and the
shared photo Back guard's history cleanup. The editor now explicitly releases its
own registration for confirmed navigation, without traversing history at the same
time as the redirect. Other pending panels retain their registrations. Ordinary
Back still preserves unsaved text/photos; explicit discard uses the same handoff.
Public visitor previews and member previews remain their existing filtered readers.

## Verification checkpoint

Five profile service groups and eighteen directory groups passed across their
appropriate fixtures. The accumulated preview fixture exceeded a bounded user
list in one historical test; a fresh database passed that group and all directory
privacy cases. The historical upgrade test requires its original pre-migration
seed and passed there. These are distinct fixture prerequisites, not suppressed
assertions or a product permission change. All 30 migrations also applied to the
fresh isolated database.

Five built-browser groups pass: empty optional fields, required-name validation,
failed and committed-but-lost uploads retried with the exact key/body, one asset
and library entry, avatar/cover readback, biography preservation, native Back and
contact navigation guards, real profile conflict/review/save, reload, keyboard
return, guest boundaries and 320/390/1440px doubled-text layout. No browser errors.
Thirteen Settings/style/release groups, two actual profile HTTPS groups and five
photo recovery browser regressions pass. The recovery script now opens the current
Display detail; its old monolithic Settings route assumption was updated. Largest
text/reduced motion and deliberate thumbnail loading, access withdrawal/recovery,
changed-account concealment and stopped-upload exact retry remain intact. Types,
scoped lint and production build pass (121 traces, 10,292 entries and 300 server
JavaScript files).

Product `2026.09.12.13`, application `13344d9e865e37e74dac2f2f724b5e6921f72160`,
is live on READY deployment `dpl_2R8cQiAh2WCBgtXemEeqvt4qaLXE`. Independent
canonical assignment and serving identity match. Eleven live checks at
13:22:46 UTC passed with zero application writes, browser errors or scoped
runtime error rows. Release notes, Explore links, Settings/profile sign-in
returns, private APIs, the safe update notice and existing draft/photo gates
were checked. Fresh backup/restore and all 30 migration checksums passed before
push; no production migration or content/permission change was performed.

Address/age-policy expansion and broader directory integration remain open. No
schema, permission, provider or production identity change is included. Physical
device acceptance is separate from these isolated browser checks.
