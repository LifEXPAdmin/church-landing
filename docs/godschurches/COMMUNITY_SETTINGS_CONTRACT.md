# Communities and interests settings

September 18, 2026. The current Gather release makes adult group membership,
named invitations and their separate notification category available. This
finishing integration connects those existing owners through the Settings
registry. It adds no stored preference, permission, API, query, migration or
delivery path. Existing stable Privacy and My church destinations are retained.

## Ownership and extension slots

| Preference slot | Canonical owner and current disposition | Readiness gate |
| --- | --- | --- |
| Group invitations | `GatherGroupMembership`, `group-reads.ts` and `groupCommand` own named invitations and deliberate acceptance. `SocialPreferences.contactRequests` and `adult-contact.ts` own the receiving audience, initially NOBODY. The Communities folder links to both without copying values. | Adult Gather membership and current invitation authority are released. Both adults must be eligible; bilateral blocks and the inviter's current leadership remain authoritative. Changing a contact preference does not join a group. Youth/family participation remains unavailable until its separate safety contract is implemented. |
| Membership and roster | `GatherGroupMembership` owns private membership and separate roster consent, initially off. My group choices remains its canonical screen. | Current membership and accepted rules are required; removal, departure, archival and authority changes retain the Gather contract. No event or Settings link grants group access. |
| Event participation and RSVP display | `CalendarResponse`, `calendar-reads.ts`, `calendar-commands.ts` and `calendar-access.ts` own per-event responses and disclosure. Current calendar reads project only the actor's own response. `PostVolunteerSignup` and `post-participation.ts` retain their existing commitment owner. Navigation to calendars and commitments is available. A persistent personal RSVP visibility default is **not implemented**. | An RSVP-default adapter must wait for a canonical saved preference, explicit supported audiences, organizer/read projection and current permission checks. It must never disclose private group membership or widen an existing event. Calendar sharing is a different operation, not a substitute. The broader RSVP-default integration remains open. |
| Group and event notifications | `SocialPreferences`, `notification-preferences.ts` and `PushSubscription` own the existing group/event categories, current device and quiet hours. Link `notifications.availability`; do not duplicate its form or state. | Supported categories already exist. Phone delivery requires explicit category consent and a current device; reading and membership never enable it. Current source access is checked again. |
| Artist updates and music playback | Future musician-follow contract owns artist relationships and per-artist update consent. The approved media preference owner must own playback choices. No active Settings registration or placeholder control. | Music search/follows, independent artist-alert editing and supported media preferences must exist first. General person-follow notifications are not evidence of an artist capability. |
| Creator identity and storefront alerts | Future storefront/profile contract owns creator identity and personal shop alerts. Storefront policy and management remain organization administration with current roles. No active Settings registration. | Owner-profile linkage, storefront roles and notification capabilities must exist before showing personal controls or an authorized administration switch. A personal alert may never change storefront policy. |
| Online Foundry participation | Future online Foundry project/profile contract owns founder visibility, collaborator requests, mentor-contact eligibility and project alerts. Contact must reuse canonical consent and blocks. No active Settings registration. | Approved project disclosure audiences, collaborator/contact and alert capabilities must exist. Financial participation and physical hubs stay separately gated. |

## Navigation and state

Settings, Communities and interests presents My group choices and My group
invitations. Related personal settings link the existing contact form,
commitments, calendars/sharing and notifications. Static labels participate in
search; private member, invitation and response data are not loaded for this
folder. Church administration remains under My church and its assigned duties.

The existing Settings owner check, loading/retry and concealed stale-account
states apply. Linked canonical screens retain their empty, denied, dirty,
saving, saved, retry and conflict behavior. Account return accepts the registered
folder and discards action/private query parameters. Future capabilities remain
absent from navigation and search rather than appearing as nonworking controls.

## Acceptance and release

Verify folder/search/Back, every destination, guest sign-in return, current
account concealment, empty invitations, unchanged privacy/defaults and current
contact/notification save paths on an isolated fictional database. Check narrow
and enlarged layouts. Existing Gather and calendar privacy/service acceptance
remains applicable because this integration changes no owning service.

Local and live results are recorded in
[the implementation receipt](COMMUNITY_SETTINGS_IMPLEMENTATION.md).
