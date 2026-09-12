# Settings registry and adapter contract

September 12, 2026. Read the [inventory](SETTINGS_INVENTORY.md) and
[resource boundary](RESOURCE_CONTRACT.md) first. This defines the initial
searchable settings implementation; it does not activate every proposed setting.

## Registration and scope

`lib/platform/settings-registry.ts` owns stable destination IDs, folder IDs,
labels, descriptions, curated search aliases, scope, value type, default,
persistence owner, exact existing read/write boundary and capability key.
Navigation is derived from registrations. Related folders link the same ID;
they never introduce a second preference store. A folder's label can change
without changing the setting ID or saved value.

`settings-contract.ts` defines adapter value/error shapes and exact scope
equality. Browser presentation choices remain in `godschurches_reading`, without
account identifiers. Personal settings bind the locked current account. A church
setting binds one explicitly selected church and its current capability. A
church rule never overrides the browser cookie, personal disclosure or another
church's preferences. Personal directory consent remains the member's own
choice tied to their approved connection; it is not a church administrator's
general default. Family and nonchurch business scopes are inactive.

The initial adapters reuse existing components and endpoints. The navigation
registry contains only labels/descriptions and service ownership, not private
values. UI capability keys are presentation hints derived on the server, never
new grants. Server mutation handlers remain authoritative on every request.
There is no generic settings mutation endpoint or generic policy precedence
engine. Loading navigation does not fetch credentials, private contacts or
another person's settings.

## Defaults and existing explicit choices

| Family | Existing/default behavior | First-use explanation |
| --- | --- | --- |
| Browser display | System appearance, Pages, comfortable text, reduceMotion=false and reduceData=false | Saved on this browser only; system reduced-motion preference still applies independently. |
| Relationship privacy | mentions=EVERYONE and showRelationships=true; absent row version 0 | These are the existing defaults for eligible social interactions, not public contact disclosure; explicit choices are preserved. |
| Profile style | sage/plain/about-first, empty pinned introduction; absent version 0 | Only typed palettes/backgrounds/order; full member profiles still require sign-in. |
| Directory | Not listed; optional email/phone absent; each audience ONLY_ME | Joining a church does not opt into its member directory. Sign-in email is separate. |
| Optional contacts/location | No new public phone/email/address/precise-location field | Directory contact sharing uses its existing restricted audience. No device permission or precise location is requested. |
| Calendar sharing | No calendar/event shares until deliberately added | BUSY reveals availability only; DETAILS requires separate explicit sharing/current access. A display choice never publishes a schedule. |
| Notifications | No enabled category, push, digest or quiet-hours setting | Existing conversation follow/mute controls are separate; no notification delivery is promised. |
| Future family/payments/messaging | Inactive; no stored default is created | No public toggle or automatic enrollment. Owning readiness gates remain required. |

Registration defaults document existing behavior. They do not write missing rows,
rewrite explicit choices, normalize queued retries or backfill older drafts.
In particular, old missing reply permission remains unresolved and cannot publish
until deliberately chosen and saved. PUBLIC/CHURCH post audience and reply
audience remain separate. No global default-post-audience setting is introduced.

## Effective values, permissions and errors

An actual value adapter returns `SettingValueState` only after checking the
current account/scope through its existing service:

- `ready`: requested value, effective value, browser/account/church/default
  source, editable=true and the existing version (null only for an unversioned
  browser choice). No invented timestamps or versions.
- `locked`: the same value metadata only if readable, editable=false and a
  concise reason. A legitimate display policy can constrain a readable value;
  the initial implementation does not invent church/family overrides.
- `forbidden`: no requested/effective value, no hidden version or private source
  metadata; explain how to review access. This is different from a service error.
- `unavailable`: no value or interactive toggle; relevant provider limitations
  may have a useful explanation. Unbuilt/future feature registrations stay hidden.
- `error`: current values are unknown; preserve local work and offer a read
  retry. Never replace a failed private read with a default shown as confirmed.

Before writing, the owning handler still enforces its same-origin/session,
current church role, lifecycle, input and concurrency contract. Scope/account
switches invalidate pending reads and concealed private values. Blur/return
refresh uses the existing settings controllers; a stale role never authorizes a
write. Search uses approved static labels/descriptions/aliases, never values,
email addresses, hidden roles or private church details.

## Saving, upgrade and reset

Keep the existing operation boundaries. The advanced Display form stages a
local preview before explicit Save; the footer appearance shortcut persists
immediately. Both use the same five-field browser cookie and say saved only
after exact readback. Failed saves retain the applied choices, lock form edits
until retry/discard and resend the same choices. Preview/discard never writes.
Independent
safe toggles may use their current immediate-save path. Multi-field privacy and
directory/profile forms retain explicit Save, versions and current validation.

Relationship privacy retries resend the exact original body and mutationId.
After an ambiguous response, resolve that request before editing or sending a
new one. A conflict fetches current state separately and requires deliberate
review. Do not silently rebase an old sensitive preference over a newer one.
Other account operations retain their established reauthentication, one-time
tokens and recovery guidance; do not wrap password/email/deactivation commands
in a new generic replay cache.

Discard restores the latest confirmed local snapshot. An observed newer server
version is presented for deliberate acceptance; it is not silently written over.
Unsaved/unknown-outcome work remains protected against Back, navigation and the
safe update notice. A navigation label or release note cannot resolve a draft.

The first restore action is limited to the five named browser display fields in
`displayResetFields`. Show the exact defaults and browser-only scope before
confirmation, then verify cookie persistence. It cannot reset relationship
privacy, contacts, directory consent, account security, church roles, photos,
family policy or any server setting. No global reset exists.

Stable setting IDs are independent of persisted field names. Renaming a label,
moving a folder or adding an alias preserves the same adapter, persistence key
and explicit choice. Removing a capability hides its controls but does not
delete/reset values or disable its existing privacy/lifecycle enforcement.
A genuine stored-field rename/default migration requires the owning service's
versioned migration and a focused preservation test; registration is not a
migration. Do not normalize stored choices on read or silently drop unknown
queued request fields.

## Verification and release

The initial interface uses `/platform/settings`, registered folder paths and
registered control detail paths. Existing feature-owned editors keep their own
destinations. `/api/platform/settings` is a private, current-session read of
navigation context only; it has no generic write operation. Its expected-account
check and the existing church-tools adapter prevent a stale page from selecting
another account or retaining revoked management links. Context read failures
conceal controls while retaining local edits for retry. Account switches discard
the old account's mounted context instead of transferring its state.

Search and Back history contain only static setting names and the user's bounded
query, never preference values or church-role details. A bounded in-memory map
restores folder scroll and focus and is cleared when the account changes. The
new controls reuse existing reauthentication and draft/update protection providers.
See [Settings verification](SETTINGS_REPORT.md) for actual runtime evidence.

Verify the initial registrations against actual service/component paths and
current gates before opening dependent navigation work. Test scope separation,
denied/error shape, inactive modules, aliases and reset boundaries. Then verify
the built Settings home/folder/detail/search paths, authentication returns,
account switch/revoked church roles, exact retry/conflict/discard, narrow/enlarged
text, keyboard focus and update protection with isolated fixtures.

No new schema/provider configuration is required for this registry. Preserve the
existing release workflow, product notes and serving identity check for the
user-visible Settings release. Physical assistive-device/owner acceptance is
separate from automated keyboard, role and live read-only checks.
