# Privacy settings: current values and capability boundaries

## Current contract

The Privacy overview consumes the existing owner's SocialPreferences projection
inside the current serialized session read. The relationship reader shares the
same projection. An absent row keeps the established version-0 defaults;
unrecognized stored or transport values fail closed instead of displaying a
permissive fallback. No new preference field, mutation, permission or schema is
introduced. Existing version checks, full-body mutation receipts and retry rules
remain in the relationship command service.

| Topic | Authoritative current behavior | Settings binding |
| --- | --- | --- |
| Mentions | `allowedMention` checks current conversation/account/block rules and recipient choice EVERYONE, FOLLOWED or NOBODY. FOLLOWED means the recipient follows the sender. | Actual saved value; canonical mention/relationship detail uses its existing command. Mention permission never grants post access. |
| Relationship counts | `getMemberProfile` applies showRelationships to follower/following counts for other permitted readers; the owner retains their own review. Default true. | Actual saved value. This does not modify friendship/follow edges or post permissions. |
| Name/profile discovery | The active `communitySearch` People route searches name/username and projects public author labels. Current active-account/block/mute filters apply. The retained `searchPeople` helper includes biography but is not wired into the current search UI. | Explain existing behavior. No search opt-out or QR-only account capability exists. |
| Profile and contacts | Member profile reader, private image delivery and per-connection directory disclosure remain authoritative. Sign-in email is never a contact fallback. | Link to the existing Profile and contact settings. Address sharing and contact lookup stay unavailable. |
| Posts and replies | Post audience and replyAudience are selected in the shared composer and revalidated on publication. Church/event/source access still constrains reads. | Explain per-post choices; no change to existing posts. Private drafts retain their snapshots and unresolved legacy reply-permission handling. |
| Activity/defaults | No independent profile-activity visibility or stored future-post default exists. | No control is offered until an authoritative preference/disclosure contract is implemented. |
| Family/age management | Family-managed/QR-only child accounts are not activated. Current verified-adult participation and church eligibility remain service requirements. | No child switch, parent override or inferred family permission. The adult overview can ship independently. |

Search opt-out/QR-only policy needs a reviewed authoritative account-discovery
capability before integration. Contact lookup remains its separate disabled
extension. Future-post defaults need a scoped preference contract defining
explicit draft precedence, author/church context, revoked access and migration
behavior. They cannot rewrite saved draft bodies or silently widen reply
permissions. Activity visibility likewise needs its own reader enforcement.

The Settings shell refreshes this private context on focus/online and conceals
stale controls while access is being verified. It preserves dirty forms across a
transient read failure and clears an invalid session. The overview links to the
existing editors; it does not perform writes itself.

## Verification checkpoint

Five private-context groups and ten social foundation groups pass, including
effective defaults, both restricted mention modes, other-account isolation,
command/database rejection of unsupported values, current block/mute behavior,
private drafts and versioned retry protections. The database already enforces
its existing choice constraint; no migration was needed.

Five built Privacy browser groups and six Settings browser regressions pass:
actual editor saves and summary readback, failed/unknown reads concealed without
a fallback, account replacement and expired access, private contacts, canonical
links, keyboard/Back, 320/390/1440px doubled text, dirty/reset/conflict and exact
retry behavior. No browser errors. Twenty Settings/navigation/release groups,
types, scoped lint and production build pass. Publication is pending.

See the existing
[Settings contract](SETTINGS_CONTRACT.md), [profile disclosure](PROFILE_SETTINGS_REPORT.md)
and [private draft contract](POST_WORKSPACE_CONTRACT.md). Parent integration,
unsupported capability extensions and owner/device acceptance remain open.
