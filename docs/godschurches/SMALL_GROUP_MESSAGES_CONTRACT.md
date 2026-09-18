# Small-group messages and broader direct-message release

Contract review, 18 September 2026. This resolves the bounded membership design;
it does not implement or activate group messages, expand direct-message consent,
or authorize child access. The limits below are conservative engineering choices
for a later implementation, not a claim of prior owner approval or legal policy.

## Current foundation and scope

The existing [adult contact contract](ADULT_CONTACT_CONTRACT.md) remains the
authority for two-person conversations. `adult-contact-policy.ts` checks current
adult eligibility, recipient request audience and bilateral blocks.
`adult-message-policy.ts` explicitly authorizes one of two stored participant IDs;
`adult-messages.ts` owns ordered text, exact receipts, private visible-read state,
mute, archive and clear-for-me. A third participant cannot be added through that
API. Keep its pair uniqueness, founder welcome exception and existing history.

Gather group membership and church duties confer no personal message authority.
Do not convert a Gather discussion or two-person conversation into a private group,
copy its bodies, or grant access from a client participant list. A future group
needs a distinct conversation kind and explicit membership authorization using
the current account, relationship, report, receipt and notification owners.
Support messages remain separate. Text only; attachment, presence, public read
receipt and family expansions retain their own gates.

## Consent and limits

Group invitations require a separate, versioned personal choice, initially
NOBODY, with FOLLOWED and EVERYONE options for otherwise eligible adults.
FOLLOWED means the invitee follows the inviter. Existing direct-message choices
are not migrated into this choice. Every invitation needs explicit acceptance;
an administrator, founder, parent, shared church or group cannot accept for someone.

A proposed roster contains three to eight eligible adults including the creator.
All proposed members explicitly approve that exact roster and its plain-text
purpose before creation. Thereafter an addition requires the newcomer and every
current member to approve the proposed roster. Until committed, the old roster
continues; the invitee sees no history, activity or live member status. Display
only each proposed adult's currently permitted identity, the inviter and purpose,
after the existing members consent to that disclosure. No bulk contact lookup.
For initial creation, first obtain each invitee's consent to show their identity
in the roster preview; the initial invitation shows only the creator and purpose.
After all agree to that disclosure, each reviews and accepts the complete roster.
Preview disclosure consent alone never grants membership or messaging consent.

Allow one pending roster proposal per conversation, and count its reserved places
toward eight. Expire proposals after fourteen days by server time. Use the existing
five-per-ten-minutes and twenty-per-day sender invitation budget across both
personal requests and group invitations, plus twenty outstanding outgoing and
one hundred incoming per account. Count each invited recipient, not one bulk
operation. Respect seven-day same-inviter decline cooldown; new group IDs cannot
evade it. Current text size, send budget and bounded pagination stay unchanged.
None of these group counters or settings exists until its consuming service ships.

## Membership decision table

Every transition uses current eligibility, bilateral blocks, the current roster
version and exact operation receipts inside the canonical permission transaction.
Concurrent additions, sends and removals must serialize; client timestamps never
define access. Failed proposals neither send messages nor queue future acceptance.
Any committed membership or administrator change cancels all outstanding roster
proposals and role offers. An unrelated old approval cannot authorize a new roster.
Blocking also cancels those proposals and offers, releases their reserved places,
and advances the consent epoch. Bind every approval to both roster version and
consent epoch; a pre-block approval cannot be reused after unblock or resumption.

| Transition                                         | Authorization and resulting access                                                                                                                                                                                                                                                             |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create proposal                                    | Eligible creator proposes the bounded roster; each person must permit invitations from the creator. No group history or sending exists yet. The creator accepts administrator responsibility explicitly.                                                                                       |
| Accept proposal                                    | Only the named adult accepts their own current invitation. Commit only when every required approval still matches the current roster, eligibility, invitation policy and all-pairs block checks. Creation starts with no copied history.                                                       |
| Decline, withdraw or expire                        | A recipient declines their own invitation; proposer withdraws the proposal. Any decline or expiry cancels the entire proposal and all its approvals. No partial automatic group or addition.                                                                                                   |
| Add member                                         | An active administrator proposes one addition. Existing members and newcomer approve the exact new roster. On commit, the newcomer's readable interval begins at the next message sequence, excluding all older messages and context. Others keep their existing intervals.                    |
| Leave                                              | Any member leaves without administrator permission. Close their interval at the last committed sequence and immediately stop sending, new messages, roster updates and alerts for them. No penalty or required successor blocks leaving.                                                       |
| Remove member                                      | A current administrator can remove a non-administrator with an explicit confirmation. Close that person's interval exactly as leaving. An administrator cannot remove another administrator; they may leave themselves. No removal retracts copies already received.                           |
| Reinvite or rejoin                                 | Requires a fresh proposal and full consent, subject to current preferences, blocks and cooldown. Create a new readable interval; never reveal messages between departure and rejoin or reopen old consent through an exact retry.                                                              |
| Promote administrator                              | An active administrator offers the role to a current member; that member explicitly accepts the current offer. Maximum two administrators. Role offers expire with the same fourteen-day bound and cancel on membership change. No extra history access.                                       |
| Demote or transfer                                 | An administrator may relinquish their own role. Transfer is recipient acceptance followed by atomic role change; it cannot force responsibility on someone. No administrator may demote the other. If none remains, close sending and membership changes; do not silently appoint a successor. |
| Last administrator leaves or becomes ineligible    | Revoke their authority immediately. If another eligible administrator remains, it continues. Otherwise close the conversation; remaining eligible people retain their permitted history and may independently consent to a new conversation.                                                   |
| Roster shrinks below three                         | A two-member remainder may continue as the existing group, with the same group policy and no conversion to the canonical pair thread. Fewer than two active eligible members closes sending and invitations.                                                                                   |
| Block within roster                                | Atomically freeze new sending and additions for the entire conversation. Preserve already authorized retained history. Tell other members only that sending is unavailable, without disclosing the blocker, target or direction. Leave and authorized removal remain possible.                 |
| Recover after block                                | Unblocking alone never restores sending. An administrator proposes resumption of the current roster; every remaining member accepts afresh and every pair must pass current block/eligibility checks. Start a new consent epoch without widening history intervals.                            |
| Suspension, deactivation or lost adult eligibility | Deny that account every read, write, export and receipt replay immediately; close its membership interval and revoke all proposals/roles. Remaining eligible members keep their own history; apply minimum-member and administrator rules. Reactivation requires fresh membership consent.     |
| Account erasure                                    | Revoke access and roles first; use the existing erasure/selected-evidence policy, anonymize retained authors as Deleted member, and never restore access from a backup or receipt.                                                                                                             |
| Close conversation                                 | Each member may always leave; an administrator may explicitly close sending and invitations for everyone. Closure is permanent for that conversation, cancels pending proposals and preserves only permitted retained history. No auto-reopen.                                                 |
| Mute, archive or clear                             | Personal only. Mute suppresses eligible alerts; archive changes the inbox; clear advances that person's hidden prefix. None changes another person's membership, consent, receipt choices or retained history.                                                                                 |

## History, revocation and evidence

An eligible former member can read only messages in their own committed membership
intervals, less their cleared prefix. This is retained history, not continuing
membership: deny later messages, new roster metadata, snippets, counts, searches,
notification links and cursors outside those intervals. An added administrator
does not gain old history. The initial context/roster is visible only to its
consenting audience; later members see their accepted context, never old proposals.
Do not allow administrators to enable old-history sharing in the first expansion.

Keep one canonical body. For each message, retention must consider all recipients
entitled at its send sequence, including eligible former members, rather than
assuming the current roster or two participant columns. Apply the approved
[retention and deletion policy](MESSAGING_RETENTION_POLICY.md): clear is personal,
erase unretained text within its deadline, preserve only scoped report evidence
and holds, and replay revocations before a restored database serves traffic.
The implementation must prove this multi-recipient accounting before activation;
this contract does not change approved retention periods or erase other copies.

Reporting accepts only a selected item the reporter may still read. Current
authorized reviewers receive that evidence, not the entire group or unrelated
messages. Recheck access at every export, notification projection and delivery.
Cancel undelivered intents when membership ends; exact send receipts cannot
deliver a message to a new roster. Polling/reconnect must discard stale projections
on identity, membership or consent-version change, without persisting private text
in browser storage. Do not promise end-to-end encryption or removal of screenshots.

## Direct-message choices and activation evidence

Ordinary DMs retain NOBODY/FOLLOWED/EVERYONE request audiences, explicit acceptance
and bilateral block precedence. EVERYONE still means eligible adult requests;
it is not unsolicited delivery. Changing a request preference invalidates affected
pending consent, preserves already accepted conversations, and never unblocks
someone. The narrow founder welcome reply consent stays separate. Group membership
does not permit a DM between its members. No additional automatic-accept option.

Before enabling groups, verify every table row against real service and browser
behavior: third-party/cursor guessing; concurrent accept/add/remove/send; stale and
changed-body retries; a newcomer probing older history; a removed member probing
new history; rejoin gaps; block/unblock and resumption; last administrator exits;
recipient/account replacement; rate limits across group IDs; minimum-size closure;
selected reporting; interval-scoped exports; alert cancellation; erasure, cleanup
and protected restoration. Preserve the existing two-person regression suite.

The full implementation must include accessible invitations and role consent,
visible roster changes, leave/block/report controls, truthful history explanations,
failed-write recovery, server enforcement, configuration and meaningful mobile
checks. Validate actual reviewer/retention operations and combined release before
activation. Child or unknown-age accounts remain denied independently of these
adult decisions; a family approval alone is not implemented enforcement.

This document changes no schema, route, runtime configuration, provider or user
preference. Current source checks and existing two-person tests establish the
reused foundation only. New group behavior and safety acceptance remain open.
