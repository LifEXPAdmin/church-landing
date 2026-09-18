# Healthy-use settings and private tracker preferences

## Scope and existing owners

September 18, 2026 definition candidate on integrated `bea3ba3`. This document
defines how one Healthy use settings folder presents optional adult reminders,
supported finite clip sequences, private reading preferences and separately
managed family rules. It adds no setting, timer, player, tracker, family scope,
permission, migration or data collection.

The accepted [adult reminder contract](HEALTHY_USE_CONTRACT.md) owns reminder
defaults, timing, idle/session behavior, quiet hours and prompt actions. Consume
that contract without a second timer or preference owner. `settings-contract.ts`
owns scoped requested/effective values; `settings-registry.ts` exposes only real
adapters and working routes. `notification-preferences.ts` owns the existing
quiet-hours window and its named zone. `reading-preferences.ts` owns only display
choices; it is not usage history, tracker privacy or a reminder schedule.

The baseline has no healthy-use runtime, finite clip player, Bible tracker or
family enforcement resolver. Existing feed Bible Pages, analytics measurement,
notifications and ordinary media controls do not satisfy those capabilities.
The [family launch decision](FAMILY_LAUNCH_DECISION.md) keeps child capabilities
closed pending their named review and operational gates. This definition does
not resolve or bypass them.

## Distinct choices and truthful labels

| Control family                      | Owner and initial choice                                                                                                           | What the interface may claim once implemented                                                                                                      |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Adult Word reminder                 | Current adult account; independently off by default; 30 active minutes suggested after opt-in, whole-number override from 5 to 240 | An optional reminder in this browser session. Continue, snooze, dismiss, disable and ordinary adult access remain available.                       |
| Adult Kingdom-service prompt        | Same account owner, independently off; 60 active minutes suggested, same interval bounds                                           | An optional invitation to time away or service, not evidence of work completed, faith, attention or spiritual worth.                               |
| Quiet hours                         | Existing notification-preference owner and saved zone                                                                              | Optional prompts pause according to the accepted shared schedule. It is not a ban on app use, and essential recovery/verification stays available. |
| Finite clip sequence                | Future clip-navigation owner, consumed by the supported player                                                                     | Automatic continuation stops at the chosen bound of two or three related clips. This is not a daily allowance, provider-wide limit or device lock. |
| Reading reminders and plan defaults | Future tracker/plan owner, personal and off by default                                                                             | Only supported scheduling/default choices. Disabling reminders or changing a plan retains independent reading history.                             |
| Reading progress                    | Future reading-record owner; private                                                                                               | Only the current owner sees recorded progress. No public visibility toggle exists without a separate explicit sharing capability and choice.       |
| Managed family limit                | Future accepted current family resolver                                                                                            | Only its verified enforcement coverage, current policy source and authorized actions; an adult reminder never stands in for a family rule.         |

These are control families, not newly registered setting IDs. The implementation
must use one canonical adapter per stored preference and record its actual owner,
supported scope, read/write actions and unavailable states before registration.
Do not add placeholder switches, disabled provider promises or an empty healthy-use
page to make the folder appear complete. Unsupported families are omitted from
ordinary settings search/navigation; any intentionally shown availability
explanation must plainly say what is unavailable and must not display invented
effective values.

## Requested, saved and effective states

Use the existing `SettingValueState` distinctions. A current authorized read may
provide requested/effective values, source, version and editability. A forbidden,
unavailable or failed read supplies only its non-sensitive reason; it does not
carry a former private value for the UI to hide. Loading cannot be rendered as
“Off”, zero minutes or “No history”. Absence of a stored preference may use the
owning adapter's documented default only after that owner has established access.

Form edits are drafts until the canonical versioned save succeeds. Show the last
confirmed effective account choice alongside a failed/unsaved edit when still
authorized, with explicit retry, discard and stale-version recovery. Exact-body
retries apply once; another account's request, changed retry body and revoked
session fail under the source service. A newly loaded session uses the saved
account values, not another account's client draft. Conceal and clear private
forms/counters on account switch or authority loss; a previous successful response
does not authorize replay or browser Back content.

Disabling an optional adult prompt may dismiss this session's prompt immediately
even if account persistence fails. Say that the saved choice still applies on
reload and elsewhere until saved. Do not label this local dismissal “Saved” or
claim that another device stopped. A failed quiet-hours read pauses optional
prompt timing, as the reminder contract requires, while leaving ordinary access
available. Never reset unrelated notification choices, display settings, reading
history, clip preferences or a family policy through this folder's save/reset.

The existing types have no active family scope/source. A future family adapter
must extend the accepted scope contract through its owning reviewed change; do
not cast a guardian rule to `source: "account"` or `source: "church"`, accept an
untrusted guardian ID, or treat a local `locked` flag as enforcement. Display only
the policy information that the current subject/guardian is permitted to see,
without exposing contact details, disputes or private evidence.

## Adult reminder and clip behavior

Reuse the reminder contract's monotonic foreground estimate, trusted interaction
and five-minute idle window, hidden/suspended-time exclusions and disclosed
tab/reload scope. A saved interval is not an elapsed-time total. Reading without
interaction may be undercounted; never ask people to prove attentiveness. No
background telemetry, cross-device total or analytics consent follows from
enabling a prompt. Quiet-hours zone and daylight-saving behavior stay with the
existing notification owner; changing date display or traveling does not silently
change that schedule.

The prompt remains nonblocking, politely announced, dismissible and respectful of
unsaved work, enlarged text, reduced motion and recovery/MFA interactions. All
actions are optional for an unrestricted adult. Accepting or declining one must
not alter church duties, visibility, account eligibility or a perceived measure
of salvation, spiritual worth or service. Do not add streak pressure, completion
badges, shame, competitive scores or notification bursts after quiet hours.

The future clip setting accepts only two or three, with two as the initial saved
default when that owner first exists. The source owner returns a finite currently
authorized set no larger than that bound; a shorter set stops at its real end.
Playback completion does not silently fetch another set or reset the bound.
Retrying/seeking an item does not manufacture another position. Revoked or failed
items use the player owner's current safe unavailable/retry state and cannot
cause unbounded replacement fetching. The source owner defines sequence identity
and counts; settings never recompute that authority from cached cards.

At the end, offer Leave, Return to source, or an explicit action to choose another
finite set. Deliberate adult continuation is allowed and is not a failure of a
daily limit, since none is promised. After a successful save, the current supported
runtime checks the new bound before its next automatic item; a lowered bound
already reached stops that continuation without interrupting the current item.
Raising the bound does not append items to an existing finite set: a new explicitly
chosen set uses the new maximum. Other sessions apply their next current preference
read; do not claim immediate cross-device enforcement. A player that has not yet
loaded the current value must say so and pause automatic continuation until it can.
Unsupported external windows/providers are outside this behavior and cannot be
described as controlled. Do not expose this setting until its saved value is
actually consumed and tested by the player.

## Reading privacy and family boundaries

The tracker owns passage/date logs, optional notes, last position and any later
goals. Settings routes link to that owner without copying those records into a
generic preference blob. Private progress stays out of member-profile previews,
church reports, analytics, notifications and search indexes. A reminder preference
is not consent to reading-history collection, public sharing or licensed text
hosting. The display cookie and reading-language discovery choices remain separate.

When a tracker exists, label its summary “Private to you”. No control changes a
whole history to public or grants a church/guardian access to an adult's log.
Sharing requires its own implemented composer capability: individually selected
material, explicit audience preview and current publication authorization. No
note, past entry, count or milestone is included just because the user enabled a
reminder. A reading reminder can be disabled without deleting entries, position,
goals or earlier independently published posts. Inactive/unavailable sharing is
not represented as a working privacy selector.

Future family policy is resolved on the server under current subject identity,
verified guardian scope and the accepted policy version. Child-facing Continue,
Snooze, reset, browser storage edits, clock changes or direct requests cannot
override it. The personal-settings adapter consumes the result and links only to
an authorized family-management route; it does not build another policy engine.
An expired/unavailable family decision must follow the accepted family resolver's
failure behavior, never fall back to unrestricted adult settings. The eventual
family owner must specify that behavior and its essential-access allowlist before
activation; this definition makes no new child-access decision.

Describe enforcement coverage precisely. A device-local adult timer cannot claim
cross-device accounting, continuous attention tracking or a guaranteed hard stop.
Only tested family enforcement may show a managed effective value and the scoped
authority responsible for it. Preserve its separately approved safety/help,
recovery and other essential routes after a limit; a broad “Bible” or “help” label
must not become a feed/discovery bypass. Until those policies and source adapters
are accepted, no family controls or child capability is activated here.

## Implementation acceptance

The owning implementation must complete UI, persistence, direct-request denial,
export/erasure/recovery integration and relevant browser regression together.
No settings row alone completes runtime acceptance. Required cases include:

- Independent adult prompt opt-in/off/defaults and interval validation; saved
  choice survives a new session while elapsed counter scope remains truthful.
- Quiet hours and zone/DST boundaries; idle, hidden, suspension, reload, multiple
  tabs and account switching; no missed-prompt burst or fabricated activity.
- Failed read/save, stale version, exact retry, discard and revocation; private
  data is absent from denied states and old pages after identity changes.
- Bound two and three, shorter authorized sets, explicit next-set choice, failed
  source, revoked source and unsupported player; automatic continuation stops
  only within the verified scope and setting changes describe their real timing.
- Disabling reading reminders preserves history; private tracker data is absent
  from member profile previews and any shared update requires selected previewed
  material through its own current-authority service.
- No client value impersonates managed-family policy. Family-specific endpoint,
  cross-device, essential-access and safety acceptance stay with the independently
  gated family implementation.

This document changes no runtime or configuration and requires no migration,
dependency, provider enrollment or production write. Thirteen existing
settings/format checks pass with zero failures and skips. Copy, document format,
local links, private-reference inspection and diff checks pass. No new build,
browser or full-suite result is claimed. These checks establish preservation of
existing boundaries only; definition integration is separate from timers, clip
navigation, tracker privacy and family enforcement observed in an implemented
interface.
