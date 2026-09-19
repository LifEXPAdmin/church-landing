# Profile customization and Settings integration

Integration note, September 19, 2026: section ordering is accepted in release
2026.09.18.13. The next profile-event candidate adds one explicit canonical
occurrence selection, with current source projection and a preserving writer;
its full gate and live acceptance remain open. See
[profile event links](PROFILE_EVENT_LINKS_REPORT.md) for current evidence. The
baseline inventory below retains its original source boundary; later Settings
work must consume these compatible owners rather than copy their forms.

## Verified baseline and scope

September 19, 2026 inventory against integrated `1fbcf9f`. Profile appearance,
photos, introduction, About/Posts order and typed optional text sections already
have working canonical owners. This inventory defines only the remaining
Settings presentation and extension boundaries. It adds no editor, endpoint,
schema, preference store, media upload path or new disclosure authority.

Read alongside [typed modules](PROFILE_MODULES_CONTRACT.md),
[profile settings](PROFILE_SETTINGS_REPORT.md), the
[Settings inventory](SETTINGS_INVENTORY.md) and
[Settings contract](SETTINGS_CONTRACT.md). The separate new-module ordering
candidate is not integrated in this baseline. Consume its accepted controller
when integrating that later extension; do not call its unmerged JSON shape live
or make this independent inventory wait for that unrelated integration step.

The original optional skills/service-profile vision does not turn supplied
profile skills into credentials, verified service history or church endorsement.
Keep those future source-owned features distinct from the current plain-text
skills list. Likewise, adding a Settings entry never enables a missing module.

## Current typed values and media references

| Customization               | Current accepted value/owner                                                                           | Boundary to preserve                                                                                                                                        |
| --------------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Accent palette              | `PROFILE_PALETTES`: `sage`, `blue`, `warm`; labels Sage, Sky, Sand                                     | `validProfileStyle` server allowlist, no user CSS/color string or injected style.                                                                           |
| Cover treatment             | `PROFILE_BACKGROUNDS`: `plain`, `soft`, `lines`                                                        | Fixed CSS treatments, separate from a cover photo. No arbitrary URL, image shader or opacity input.                                                         |
| Main section order          | `PROFILE_ORDERS`: `about-first`, `posts-first`                                                         | Existing About/Posts order remains independent from ordering sections inside About.                                                                         |
| Introduction                | `ProfilePresentation.introduction`, plain text at most 1,000 characters                                | Optional welcome above About/Posts; separate from a pinned canonical post.                                                                                  |
| Biography                   | `PlatformUser.bio`, optional plain text at most 500 characters                                         | Existing account profile field; no HTML or duplicate biography in module JSON.                                                                              |
| Testimony                   | Typed `ProfilePresentation.modules.testimony`, at most 2,000 characters                                | Optional member-visible text; blank omits the section.                                                                                                      |
| Skills                      | Typed modules array, at most 10 distinct nonblank values, each at most 60 characters                   | Case-insensitive duplicate rejection; text is not certification or an assignment.                                                                           |
| Links                       | Typed modules array, at most 3 `{label,url}` values; label 80, URL 500 before/after normalization      | HTTP/HTTPS only, no credentials or whitespace/control characters; ordinary user-authored anchor, never an automatic embed/fetch.                            |
| Profile avatar and cover    | Current canonical `PROFILE_AVATAR` / `PROFILE_COVER` media owner and approved photo library references | Existing ownership, purpose, crop, current audience, image processing, version and retry checks. Never arbitrary image paths/provider URLs in profile JSON. |
| Pinned post                 | Existing personal profile-pin owner and canonical post reference                                       | Recheck current source and owner; no copied post body or independent section pin API.                                                                       |
| Selected event              | Current candidate: one canonical occurrence reference, explicit choice and profile save                | Each viewer needs source detail access; no copied event, calendar audience, RSVP or busy-only details.                                                      |
| Featured media              | `PROFILE_MODULE_SLOTS` explicitly unavailable                                                          | No writable value, blank tab, misleading toggle or profile grant. A real adapter/selection/current audience projection must precede activation.             |

The style's TypeScript object alone is not a trust boundary: the server validates
enumerated palette/background/order values through `validProfileStyle` and
rejects unknown profile fields. Current modules require exactly testimony,
skills and links, with optional order and selected-event reference; they reject unknown slots, invalid URLs, unsupported controls
and lone surrogates. Malformed stored module JSON fails closed to empty sections.
The editor never evaluates authored HTML, CSS or scripts.

The original name/role/location/website/interests fields retain their existing
profile owner. Sign-in email, directory contact values/consent, current church
membership and private location disclosure are separate authorities. Appearance
must not import, reset, infer or widen any of them. There is no generic per-section
audience or independent hide-with-retained-content switch in this baseline:
empty typed content currently removes its section. Do not relabel clearing text
as a reversible visibility toggle.

## One controller, routes and preview

`app/platform/profile/me/page.tsx` loads the current authorized editor through
`profile-session.ts` / `profiles.ts.getProfileEditor`, wraps it in the existing
private snapshot guard and renders `ProfileEditor`. That component owns text/
image dirty/busy state, the Back/discard dialog and separate avatar/cover controls.
Its one `ProfileForm` holds the current presentation version, location version,
typed module draft and latest-saved conflict review.

`settings-registry.ts` already registers `profile.information`, labelled Edit
member profile, as a linked setting to `/platform/profile/me`. The editor already
has Back to Profile settings. `SettingsPage` keys the workspace by destination
and current account, preserving the existing Settings routing/authentication
boundary. These are completed integrations to reuse, not new missing screens.

The missing focused appearance entry should use the registry's linked-setting
pattern and lead into the same shared editor/controller, focused on its existing
Make it yours group. Add an accessible group anchor and preserve the approved
Settings return path through sign-in where required. Do not create a separate
form copy, use local storage as the source of truth or silently post a partial
profile from a Settings toggle. Any future Settings-hosted view must mount the
same controller with one authoritative draft, not synchronize two editors.

Current palette/background controls immediately update the local style swatch;
the whole visitor/member audience preview reads the saved server profile.
These are different kinds of preview. Keep the swatch's unsaved state explicit
after a change and identify the last confirmed saved state. Do not imply that a
swatch proves the audience, source access or successful persistence of a draft.
If a larger draft preview is added, render the same typed content/components and
CSS with clearly unsaved values; never load hidden contacts or source media to
make it look complete.

Preserve `getVisitorProfilePreview` selecting only name/username. A member
preview has no assumed church connection or source-management powers; actual
member reads revalidate account/block, location, image and pinned-post access.
Back/focus and account changes retain the current private snapshot protections.
An appearance editor must not expose member-only profile details to visitors.

## Save, conflict and scoped default behavior

The single save owner is `accounts.ts.updateAccountProfile` through
`POST /api/platform/account` with `operation: update-profile`. Preserve same-origin,
expected-account/current session checks, field allowlists, presentation version,
independent location version and module recovery controls. Style writes supply
the required full typed style fields; optional-field omission is not an excuse
to erase unrelated fields through a new partial form. Reuse the current full
profile draft serialization and latest-saved conflict review.

Image operations stay separately saved, versioned and retried through their own
media owner. Pending photo selection blocks text submission until saved or
discarded; a failed upload retains text and its stable upload attempt. Do not
bundle image deletion into a palette change. Unknown/lost text-save responses
remain unconfirmed; retain local entries, re-read the current owner/version and
use the existing conflict flow instead of inventing an exact-retry guarantee
that the profile text endpoint does not have.

Define Restore appearance defaults narrowly: change only the current draft's
palette to `sage` and background to `plain`. It is a visible unsaved draft change
until the normal Save succeeds. Preserve name, biography, introduction,
About/Posts order, typed modules and their future accepted order, pinned post,
photos/crops/history, contacts, location/audience and unrelated Settings choices.
Preserve other unsaved edits too; the reset is not a fetch-and-replace of the form.
There is currently no dedicated appearance-reset action; implement this behavior
within the same controller, without a second mutation API or blanket default
object spread. Restore browser display defaults remains separately owned by
reading preferences and must not change profile appearance.

After a confirmed save use the existing controlled navigation/guard release.
Failed validation, denied access, stale version and temporary errors remain
distinguishable; a conflict keeps the draft and requires deliberate review of
the latest saved profile. An account change conceals the old draft and denies
its later writes. Preserve export/erasure and opaque module recovery receipts;
this inventory creates no new recovery category.

## Section extensions and readability

Current typed modules render inside About in testimony/skills/links order, with
empty sections absent. The separately tested ordering candidate defines its own
compatible decoder, exact permutation, editor and member rendering. Once A1
integrates/accepts it, the Settings section entry consumes that same versioned
controller and available-slot inventory. Do not submit its future `order` field
to this baseline, copy its logic into Settings, or reset stored ordering through
an older client payload.

Calendar, music, storefront and service modules become selectable only after
their own canonical source, explicit owner selection and current audience/read
adapter are implemented and accepted. New optional modules start hidden without
reordering existing sections. Hiding a reference affects presentation only; it
must not delete an event, media record, saved collection or opportunity. Losing
source access conceals its content immediately and cannot fall back to copied
metadata. Define safe retained reference/restore behavior with the source owner
before enabling a hide control. This is not permission to accept arbitrary
`ResourceReference` values because the registry knows their names.

The current fixed light/dark palette paper/ink pairs, opaque content surfaces
and readable type scale remain owned by `profile-style.ts` and `platform.css`.
Respect the reader's light/dark preference, enlarged text, reduced motion and
data saver. Supplied photos are decorative media with current authorized
delivery; missing/removed covers fall back to the safe preset without covering
profile actions. Do not add transparent text panels, animated backgrounds,
arbitrary fonts/colors, autoplay media or custom scripts under this inventory.
Later bounded transparency needs composited-background contrast and full control
readability evidence, not a claim based only on a foreground color or screenshot.

## Acceptance of the later Settings work

- The focused Settings appearance/section entry reaches the shared authorized
  controller, supports keyboard focus and returns safely through sign-in and
  Back. No duplicate profile/editor/persistence owner appears.
- Changing each accepted palette/treatment updates the local preview and marks
  it unsaved; ordinary saved profile reads remain unchanged until Save. Check
  fresh reload, conflict/latest review, a lost response and account switch.
- Restore appearance changes only the two named draft values, preserving saved
  and unsaved biography, introduction, section order/modules, image selections,
  private contacts/location and unrelated settings. The existing save gate
  resolves photos and versions without silently overwriting another session.
- Only actual available typed slots can be submitted; unknown/missing source
  modules remain unavailable. After ordering integration, keyboard moves and
  order-only dirty state reuse its accepted behavior. Source hide never deletes
  source data; source revocation and export/restore boundaries remain tested.
- Every allowed light/dark preset, narrow/enlarged layout and missing-image
  fallback keeps text and actions readable. Reduced-motion/data behavior and
  current visitor/member/source privacy survive the complete journey.

This candidate is an inventory/contract only. Later UI work must run its actual
browser and regression gates; historical reports and passing foundation tests
alone do not establish new Settings behavior or live acceptance.

Twelve existing checks passed for style allowlists and light/dark palette
contrast, typed module rejection, versioned owner writes and legacy preservation,
member/preview disclosure, invalid appearance/contacts/stale sessions, Settings
scope/private-value omission, scoped browser reset, linked owners and registered
sign-in returns. Source/contract review, relative links/private-data, website-copy,
formatting and diff checks passed. No client bundle, runtime query, provider,
dependency or configuration changed; no performance improvement, new browser,
build, full-suite or production result is claimed for this inventory.
