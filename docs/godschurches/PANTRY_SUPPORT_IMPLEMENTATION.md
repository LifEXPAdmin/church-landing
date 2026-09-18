# Church pantry and private assistance implementation

## Local acceptance, September 18, 2026 UTC

The public hub, explicitly assigned coordinator, private requests, pickup
capacity and outcomes, stock history and reviewed replenishment are implemented.
The [contract](PANTRY_SUPPORT_CONTRACT.md) defines current consent, privacy,
retention and recovery boundaries. Partner referrals remain separately gated.
Production remains Church Needs 2026.09.18.2 until the release receipt below exists.

Twenty-two isolated service checks pass. They cover ordinary-member denial,
current duties and consent, exact retries, capacity races, booked-session edits,
private outcomes and notes, notification delivery policy, public-projection
invariance, clear/report retention and purge, export/erasure, protected recovery,
HTTP origin/account pins, database constraints and actual replenishment
publication, link authority and closure. The initial publication fixture correctly
failed without a listing moderator; its separate reviewer grant is now explicit.

Eleven production-mode browser groups pass using fictional local accounts and
supplies. Actual forms configure the hub and stock, create pickup sessions,
submit and retry a lost request reply, assign and confirm pickup, record an
outcome, create a reviewed replenishment draft, clear ended private details and
revalidate revoked coordinator access. Another recipient cannot retrieve the
private request. Phone-width, dark appearance and enlarged-text views are checked;
these are browser emulation, not physical-device or actual fulfillment evidence.
Existing Church Needs browser regression passes ten groups in the same environment.

The browser exposed successful database saves whose new view did not reach the
page. Removing the new pantry loading boundary resolves the reproduced pantry
save flow. The attempted shared history timing adjustment did not resolve it and
was reverted. Shared save/history helpers retain the released implementation.
The final browser script contains no investigation-only tracing or hooks.

TypeScript, changed-file ESLint and authored-copy checks pass. The isolated
20-recipient queue uses 51 SELECTs rather than 579, with identical output hashes
across five measurements. Median time in that fixture changes from 174.35 ms to
21.01 ms; this is not a production latency claim. Reads remain bounded and reuse
canonical permission predicates inside the shared read transaction.

A fresh encrypted production-copy rehearsal at 06:42:25 UTC upgrades 97 to 98
migrations. All 135 original table/column fingerprints match, protected control
replay passes and plaintext restore files are removed. Production is unchanged.
The additive migration introduces five pantry tables and the explicit assistance
capability; it assigns no capability to existing members.

Full isolated regression, exact production release, canonical assignment, live
acceptance, installed recovery registry and private task reconciliation remain
required. No pantry completion or live availability is claimed yet.
