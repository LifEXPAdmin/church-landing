# Community church listings and corrections

## Implementation — September 10, 2026

`codex/church-community-listings` adds the community-listing portion of shared
church onboarding. Official representative claims, verification, organization
structure and the full church pilot remain separate unfinished work.

An eligible signed-in adult can search for an existing church, start a private
draft, save incomplete information, reopen it, and review a public preview before
explicit publication. A name and either a ministry service area or a city/region
with its country are required. A building, website, denomination and public
contact are optional. New public pages say **Community listing · Unofficial**;
legacy operator-created listings say **Church listing · Unverified**. These labels
describe page management rather than the church's legitimacy or beliefs.

The published projection includes only public church facts. Sign-in contacts are
never copied into public contact fields. Adding a listing creates no church
connection, capability, appointment or verified-representative badge. Public
connection readiness is a boolean calculated from current eligible reviewers and
their actual grant dependencies; reviewer identities stay private. Members retain
their existing connection controls even when no new requests can be reviewed.

Possible duplicates, corrections and submissions with repeated description links
require a separate eligible reviewer holding `REVIEW_CHURCH_LISTINGS`. No grant is
seeded by the migration or conferred by a profile category. If no independent
reviewer is available, submission fails clearly and preserves the private draft.
Ordinary distinct community listings can publish immediately after confirmation.
Matching churches are never merged automatically; a reviewer must explicitly
confirm that a proposed new page is distinct. The search is a likely-match check,
not a guarantee that all differently named duplicates can be identified.

Corrections reuse the Church ID and URL, compare canonical versions under the
shared transaction lock, and preserve decision history. Drafts are owner-only;
submitted/needs-information records are visible to authorized listing reviewers.
The reviewer cannot approve their own submission. Saved edits, decisions,
withdrawals, publication replay and concurrent submissions use version/idempotency
checks. API origin/session/body/rate checks apply before transactional eligibility
and authorization. Creation is limited to ten drafts and submission to three
distinct records per contributor per rolling 24 hours, alongside API rate limits.

Private account downloads now include the owner's listing drafts/submissions with
an explicit public-field allowlist. Credentials, request keys, other contributors'
drafts and operational audit identities remain excluded. Deactivation preserves
records and public church facts, ends access, and prevents an inactive
contributor's pending submission from being approved. The privacy page and
download description explain this behavior.

## Routes and data

- `/platform/church-listings/new`: search and begin a community or correction draft.
- `/platform/church-listings`: the owner's saved submissions, with pagination.
- `/platform/church-listings/[id]`: edit, preview, submit, withdraw and read history.
- `/platform/operator/listings`: the permission-gated review queue and decisions.
- `/api/platform/church-listings`: authenticated listing reads and commands.

The additive migration extends `Church` with public fields and a canonical
version, and introduces `ChurchListingSubmission` and `ChurchListingDecision`.
Constraints preserve valid kinds, positive versions, correction references and
published canonical references. Existing accounts, church links and grant records
are retained. Listing review does not establish trusted verification evidence.

## Locally verified — publication pending

All 170 applicable checks passed (172 total, zero failures, two intentional
disabled-delivery skips), including migrations, fresh setup, backup/restore and
restart. Final lint, TypeScript, production builds and runtime checks passed.
Eight listing service groups cover ownership/eligibility, explicit
public confirmation, no authority grants, duplicate/concurrent publication,
independent correction review, canonical-version conflicts, revocation, partial
drafts/validation, export/deactivation, request boundaries and public reviewer
readiness. Actual development and production HTTPS listing checks passed in
the final full regression run. Publication and live verification are pending.

The actual fictional browser journey exercised sign-in return, search-first
creation, incomplete draft persistence through reload, a ministry without a
building/country, explicit preview/publication, a pending correction leaving
public facts untouched, and an independently reviewed correction retaining the
same church URL. Browser verification found a push/refresh race after review;
successful listing transitions now load the next document directly. The final
browser run passed create/save navigation and keyboard approval returning to
the queue, with the completed submission removed. Signed-out reading, safe
correction return, Back, 320/390/1440px reflow, light/dark visual inspection and
console checks passed without browser warnings or errors.

Browser form testing uses the production UI with the real account/listing
boundaries configured for isolated loopback development transport. It does not
bypass account authorization or browser certificate warnings. Separate actual
production HTTPS tests verify cookies, headers and private HTML/RSC behavior.
No fictional record is sent to production. Real representative verification,
staffing, provider delivery and physical-phone acceptance are not established by
these tests.
