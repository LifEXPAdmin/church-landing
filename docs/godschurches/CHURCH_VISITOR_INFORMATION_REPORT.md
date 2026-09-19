# Supplied church visitor information

## Candidate implementation, 18 September 2026

Five optional public fields extend the canonical Church record: service times,
accessibility information, languages, children's program notes and visitor
contact preferences. Their respective limits are 1,000, 1,000, 300, 1,000 and
500 JavaScript string units. Empty values remain empty; legacy records receive
no inferred facts. Public detail pages group present values under **Supplied
visitor information** and ask visitors to confirm schedules and arrangements
directly. Text is escaped and preserves line breaks, without automatic embeds.

The existing community listing, private correction and representative profile
owners remain responsible for editing. Corrections stay private until an
independent current listing reviewer approves them against the canonical
version. Approval updates the existing Church ID and URL. An authorized profile
manager saves privately, previews and explicitly publishes, with current grants
checked again. Clearing a value follows the same review/publication path.
Representative review still requires its separate operating policy and appointed
reviewers; this feature does not activate that production gate.

Long visitor notes are selected only for one explicit church detail, correction
or claim snapshot. Bulk search and connection pickers retain their existing
projection and pagination. The shared public-field projection also carries the
owner's private selections into the existing account export allowlist. No new
permissions, dependencies, provider calls, background jobs or duplicate records
are introduced.

The additive migration `20260918234500_church_visitor_information` adds five
non-null text columns with empty defaults and database length constraints. The
application's Unicode string-unit limits are stricter than PostgreSQL character
counts for supplementary characters. Existing fields and row identities are
preserved. Production migration and protected recovery acceptance remain pending
at this candidate checkpoint.

## Reproduced input defects and correction

Before feature edits, an isolated canonical handler rejected a valid 9,667-byte
multilingual listing at the old 8 KiB ceiling. A lone UTF-16 surrogate passed
validation but failed persistence with a service error; the private draft stayed
unchanged. Listing and claim endpoints now have a bounded 32 KiB ceiling and
reject unsupported controls or lone surrogates before persistence. Valid emoji,
multilingual text and ordinary tabs/newlines remain supported.

Inspection of the representative form found three copies of profile values in
its request. Reproducing that serialization through the actual handler rejected
a valid 21,422-byte profile in a 64,720-byte request. The form now sends public
profile fields once, private authority once and only boolean permission choices
in its scopes object. Dispute state remains explicit. Profile-only saves omit
unused authority and scope values. Independent source review measured a maximum
valid canonical payload below 32 KiB; real browser transport remains a required
acceptance check.

## Checks and remaining gates

Five isolated service/boundary groups pass: blank/default/bounded Unicode;
independent, self, revoked and stale correction review with deliberate clearing;
private incomplete drafts and owner-only export; current representative profile
publication and revoked grants; maximum multilingual requests and malformed or
oversized no-domain-write rejection. The migration applied only to the fictional
local database. Initial missing required fixture summaries and the public
projection return type were corrected; final TypeScript, scoped lint and copy
checks pass. A private pre-migration guard initially compared an INET string with
its CIDR suffix; using PostgreSQL's host projection fixed the guard before any
migration ran.

Built HTTPS owner/reviewer/guest and representative browser journeys, meaningful
combined regression, protected upgrade and installed backup recovery, exact
publication identity and live checks are still open. Implemented code is not yet
a verified live release. Physical-device and real church operating evidence keep
their separate acceptance gates.
