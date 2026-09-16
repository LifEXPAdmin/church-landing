# Exchange inquiries, reservations and private handoff

September 16, 2026. Inspected baseline: verified `2026.09.16.11 / ea0c977`,
report checkpoint `0250b5c`. The existing owner-set Reserved label identifies no
recipient and is not a reservation. There is no inquiry/handoff service at this
baseline. This contract defines missing work, not implementation or live acceptance.

The focused brief and original Exchange steps 076 to 082 distinguish listings,
single-item handoff and quantity/slot commitments. Complete adult inquiries,
selection, agreement, private pickup, completion/cancellation, expiry, reminders
and private no-show recovery here. Quantity allocation, partial fulfillment and
multiple need slots retain their own commitment owner. Existing permitted-item,
adult-only, financial-product and medical-transport exclusions remain. No payment,
escrow, binding sale, shipping or seller-safety guarantee is introduced.

## Existing owners and participants

Reuse owned-session/read transactions, the shared permission lock, current adult
eligibility, exact social operation receipts, durable activity budgets, listing
authority, contact preferences, bilateral blocks, community reports and protected
recovery. Register an inquiry resource only when its actual service exists. Do
not create another relationship, conversation, report inbox or transport owner.

Both participants are current eligible personal adult accounts. New inquiries and
selection also require a currently permitted listing and operational private-report
intake. The receiver's NOBODY/FOLLOWED/EVERYONE contact-request choice governs new
and pending inquiries; missing/invalid consent fails closed. Listing publication,
favorites, searches, friendship, church connection and notification choices grant
no contact permission. Selection accepts this inquiry only; it does not open a
general conversation or change global preferences.

A listing must deliberately enable inquiry entry. A personal listing receives
through its immutable owner. A church Exchange manager may explicitly volunteer
as its named receiving adult; nobody assigns another adult through the listing.
Bind this choice to its consent version and current grant/connection epoch.
Revocation/reappointment cannot revive old consent. Other managers retain listing
management but gain no private inquiry or pickup access. Replacing the receiver
terminates active old handoffs without transferring their history. Real production
appointments and consent are never fabricated for acceptance.

An inquiry has an immutable opaque ID, original listing and two original
participants, versioned state/plan and server dates. Derive actors and recipients
from current session/source authority, never submitted identity or role fields.
Private receiver identity stays inside authorized adult inquiry surfaces, not
public cards, metadata or search results.

## Transition and disclosure table

Every command requires the current expected version and immutable retry key/body.
Completed, Canceled, Declined, Withdrawn, Expired and Revoked are terminal states.

| Current state | Actor/action | Result and disclosure |
| --- | --- | --- |
| No active inquiry | Eligible inquirer sends a short purpose to the permitted receiver | Inquired. Purpose is private to these two adults; no pickup or general conversation access. |
| Inquired | Receiver declines, or inquirer withdraws | Declined or Withdrawn. No hold or pickup disclosure. |
| Inquired | Receiver selects with a proposed window and optional instructions | Selected. Atomically claim the sole listing hold and set listing Reserved. Inquirer sees the window and receiver, with precise instructions still hidden. |
| Selected | Selected inquirer confirms the exact current plan/version | Reserved. Only the two current accepted participants may read private instructions. |
| Selected | Receiver replaces the unconfirmed plan | Selected with a new version. An old confirmation cannot accept this replacement. |
| Reserved | Either participant records completion | Completed and listing Closed once. Identify who recorded completion without claiming independent fulfillment verification. Remove active pickup disclosure. |
| Selected or Reserved | Either participant cancels with a bounded reason | Canceled; release the hold once and leave listing Closed for owner review. Remove private instructions from active views. |
| Reserved | Participants need another window | Cancel, then deliberately reopen/reselect and confirm a fresh plan. No silent edit of agreed terms. |
| Terminal | Current owner/manager explicitly reopens a permitted listing | Listing Active after existing publication checks. Old inquiry/consent stays terminal; a fresh eligible inquiry is required. |
| Inquired or Selected | Server deadline passes | Expired, never auto-accepted. Release any hold once; listing remains Closed for owner review. Show why it expired. |
| Reserved | Agreed window plus stated recovery period passes | Expired with the same release/review rule. Existing private receipt remains available for a deliberate report. |
| Any active state | Block, account restriction, receiver revocation, source withdrawal/moderation or lost required audience/authority | Immediately revoke or conceal pickup/contact/alerts. Settle revocation under the shared lock. Restored account, grant, audience or relationship never revives consent. |
| Reserved | Participant reports a missed handoff | Private no-show cancellation/reason and recovery guidance. No public accusation, score or automatic misconduct finding; formal reporting remains deliberate. |

Enforce one Selected/Reserved hold per listing and one active inquiry per
listing/inquirer in the database. Lock current source and inquiry in the existing
permission transaction. Concurrent selections yield at most one hold and a usable
conflict for the other actor. Listing status commands cannot bypass a hold.
An authorized manager can withdraw a church listing and revoke its hold without
reading private contents. Agreed listing terms cannot be edited until the hold ends.

## Bounds, time and uncertain responses

Plain text bounds: purpose 1 to 1,000 characters; optional pickup instructions
2,000; optional cancellation explanation 500 alongside a fixed reason. Reject
excess input without truncation. No files, remote fetches, executable content,
child details or financial credentials.

Inquired expires after 14 days. Selected requires confirmation within 48 hours
and before the proposed window ends. Windows use future instants within 30 days,
end after start, and last at most 24 hours. Store an explicit supported IANA zone;
reuse the calendar time owner for local/DST validation. Reserved expires 48 hours
after the agreed window ends unless completed/canceled. Display the exact deadline
and owner-review rule before agreement. Expiry does not prove a physical return.

Reuse durable budgets: five new inquiries per ten minutes, twenty per day,
twenty active outgoing, one hundred active per listing and two hundred incoming
per receiver. A declined listing/inquirer pair has a seven-day cooldown. Bound
retained history and paginate incoming/outgoing lists; group permitted incoming
entries by listing. Never expose another inquirer's count or recipient quota.

Exact retry returns a safe ID/version receipt without another inquiry, charge,
hold, notification or availability change. Different input with the same key
conflicts. Check current participant/account authority before receipt replay;
receipts contain no private body. Retain the browser's immutable pending payload,
confirm the original request first and require fresh review after conflicts.
Reuse unsaved/recovery and current-account concealment on resume/sign-out/switch.
Back navigation cannot revive a terminal handoff.

## Private data, reports and recovery

Pickup requires both current participants and the current confirmed plan. A
guessed ID, another manager, declined inquirer, public page or another person's
export grants nothing. Recheck HTML, RSC, API, retained readers and notifications
after block/narrowing/withdrawal. Keep a bounded owned unavailable receipt where
needed for clear, cancellation and reporting; do not disclose its hidden source.

Extend the existing private-report service with an inquiry target and explicit
minimal selected-evidence preview. Do not copy unrelated inquiries, searches or
message history. Private communication uses current platform private-report
authority; church listing moderation does not grant pickup access. Preserve the
approved founder review, scoped hold and 180-day closed-case cleanup policy.

Remove ordinary operational pickup copies on completion, cancellation, expiry or
revocation; retain only explicitly selected case evidence when justified. Provide
participant-local clear for retained inquiry/history; one person's clear does not
erase the other's legitimate receipt. When neither retains the body, use the
approved messaging purge deadline and separately protected deletion/recovery
owners. Permanent account deletion revokes immediately, removes non-exempt data
within the approved deadline and deidentifies retained shared history. Export
only currently permitted owned records, not another inquiry or hidden pickup.

Protect inquiry, receiver consent and settings with monotonic recovery receipts.
Quarantine an older restored plan instead of restoring pickup access, released
holds or old reminders. Missing rows require opaque tombstones against late
original writes. Restored availability needs owner review before advertisement.
Existing 30-day backup expiry remains authoritative.

## Notifications and unlocked settings

Use current Activity/outbox/delivery for inquiry, selection, confirmation,
cancellation/completion and one reminder per current plan/recipient. Give handoff
updates a distinct category; never broaden saved-search phone consent. Phone
consent is dated, optional and requires a current device. No Exchange email.
External previews are generic: no title, person, address, window, reason or quote.
Recheck current source/version, participant, block, category, quiet hours and
device at dispatch; revocation/cancellation invalidates pending reminders/retries.

Reuse the deployed delayed-work queue and persisted recovery dispatch, with
bounded daily recovery and no second provider. Do not promise exact timing or
physical phone receipt. Reads derive expiry by server time and writes settle it
before conflicts even if workers are delayed. Failed dispatch must not corrupt
a handoff or release availability twice.

Finish newly unlocked personal listing defaults in this cycle: supported intent,
audience and explicit general town, private reusable pickup text and existing
contact guidance. Defaults stay owner-only, versioned, exportable/erasable and
protected on restore. Seed only new personal drafts within current permissions;
never rewrite old drafts, inherit inquiry consent, publish a saved address or
implicitly apply personal choices to church listings. Copy pickup text only by
deliberate action in the selected handoff, then disclose only after confirmation.

## Required acceptance

Exercise actual database/service and built browser: simultaneous selections,
stale/exact retries, one active inquiry, receiver/grant replacement and regain,
block/unblock, contact narrowing, listing removal, failed dispatch, expiry/reopen/
no-show, guessed identifiers, account switches, lost replies, mobile/enlarged-text/
dark layouts and private defaults. Prove export/erasure, selected case evidence,
purge and restrictive backup restoration with isolated fictional data.

Complete guidance/release notes, meaningful focused/full gates, protected upgrade,
exact READY/canonical identity, live reads, production fingerprints, migration
registry and installed recovery before closing implementation. No live test grants
or recipient sends. Keep physical delivery and real fulfillment limits explicit.
Continue every unlocked smaller step; final batch review stays last.
