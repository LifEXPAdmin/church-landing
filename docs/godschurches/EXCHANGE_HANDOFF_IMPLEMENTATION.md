# Exchange inquiries and handoff implementation

## Local implementation checkpoint, September 16, 2026

This is unfinished local work following verified `2026.09.16.11 / ea0c977`.
The candidate product version is `2026.09.16.12`; it is not a deployment receipt.
The [reviewed handoff contract](EXCHANGE_HANDOFF_CONTRACT.md) remains authoritative.

Implemented locally: explicit per-listing named receiver consent; current adult,
contact, church audience and appointment epoch checks; bounded private inquiries;
atomic single selection and versioned pickup agreement; completion, cancellation,
private no-show reason, expiry and explicit owner reopening. Operational pickup
text is hidden before confirmation and removed on ending, except deliberately
selected report evidence. Exact request receipts contain no private bodies.

The shared relationship writer revokes active inquiries on blocks, account
restriction and narrowed pending-contact consent. Mute retains the established
contract: it changes discovery, not an accepted commitment. Other church managers
can withdraw a listing without gaining another receiver’s private inquiry history.
Current source checks, explicit reporting, participant clear, account export,
permanent deletion and restrictive recovery use their existing owners.

The additive migration creates three tables and leaves existing listings’ inquiry
entry disabled. Database partial unique indexes independently enforce one active
inquiry per listing/inquirer and one selected/agreed hold per listing. The delayed
work queue retains its deployed identity, with opaque handoff envelopes, persisted
dispatch recovery and a separate dated phone category. No Exchange email or new
provider is introduced. Private personal defaults seed a new personal draft only
by deliberate action; pickup text is copied separately into an unconfirmed plan.

Local acceptance so far: 95 migrations, populated upgrade preservation and
isolated dump/restore; 21 focused input, database, service, HTTP and queue consumer tests pass.
The related Exchange suite reports 106 passes, zero failures and zero skips. These cover concurrent selection, stale/exact retry,
block/unblock, expiry settlement, database constraints, case evidence/purge,
missing/older-row recovery, church receiver replacement, exports/deletion,
queue failure/duplicate reminder, independent phone consent and HTTP account/origin
boundaries. TypeScript passes. The resource registry’s two tests pass. Website
copy passes. Lint has zero errors and 35 existing fixture-script warnings.
All fixtures are fictional; production application writes and recipient sends: zero.

A full 20-inquiry personal incoming page initially required 285 SELECTs. Batched
participant and pair inputs with the same canonical listing/receiver checks reduce
that to 31; five isolated samples improve from about 104 to 109 ms to 24 to 37 ms.
This is local service evidence, not hosted latency. A dedicated current-source
regression compares bounded summaries with private detail after contact narrowing,
church-connection epoch changes and blocks.

The interface is implemented locally using existing private snapshot, unsaved-work
and uncertain-save controls. Required next work: complete browser
acceptance (including lost responses, account changes, mobile/enlarged/dark views),
measure affected query/bundle costs, repair any failures, run the frozen complete
gate, protect the upgrade, publish through the established release process, verify
exact READY/canonical/live behavior, update installed recovery and reconcile the
private feature/settings/shared adapter tasks. Do not close this feature yet.
