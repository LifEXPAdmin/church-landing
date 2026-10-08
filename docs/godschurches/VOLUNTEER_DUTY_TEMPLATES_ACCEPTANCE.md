# Ordinary volunteer duty templates

## Scope and behavior

Church volunteer coordinators can maintain reusable duty descriptions at `/platform/serve/templates`. A template contains only a title, duties, requirements and commitment. A new opportunity can deliberately copy those four fields into its unsaved draft before the coordinator reviews and saves it through the existing opportunity workflow.

Applying a template changes no contact, capacity, schedule, applicant, assignment, permission or screening state. Existing opportunity editors omit the picker, preserving the rule against changing duty descriptions once applications exist. Leadership training, screening provenance and clearance remain outside this ordinary-template checkpoint.

## Boundaries

- Current eligible, connected volunteer-coordinator authority is checked for every read, write and receipt replay. Applying also requires current edit authority on the source recruitment post and the same church as the template.
- Strict four-field input rejects unknown fields, malformed text and oversized values without truncation. Limits are 100, 2,000, 1,000 and 300 UTF-16 code units respectively. PostgreSQL independently enforces maximum lengths and a positive version.
- Saved descriptions carry immutable church ownership and optimistic versions. A church can maintain up to 200 active templates, with 20 small cards per page. List responses omit duty bodies.
- Mutation identities preserve the exact original request on uncertain replies. Stale versions require review. Removing a template scrubs its text and leaves independently saved opportunities unchanged.
- Current-owner reads use the existing shared authorization lock. HTTP requests require the expected-account header, strict query/body fields and private no-store responses; writes also enforce the canonical origin and existing rate limit.
- The interface conceals private controls during loss of access or visibility while retaining local drafts and uncertain requests for their original owner. A late template response cannot overwrite changes made while it was loading.
- Protected recovery journals contain metadata only. Replaying a newer control scrubs and quarantines a stale or missing row; equal or newer rows remain unchanged. Recovery cannot reconstruct a missing church owner.

## Migration and local checks

`20261008002000_volunteer_duty_templates` adds the church-owned template table and extends the existing protected-control kind and scope constraints. There is no account-identity foreign key and no package or lockfile change.

The populated migration preserved all 165 existing table fingerprints and added one table. A backup of the resulting 166 tables restored with identical data. All 128 migrations applied to a fresh database containing the same application tables plus the migration ledger, 167 tables total. Temporary verification databases were removed. The first fixture startup incorrectly expected the populated dump to include that ledger; its assertion failed, its owned database was stopped, and the corrected startup is retained separately.

Sixteen focused groups passed: four input, nine service and three protected-recovery groups. These include exact retries, revoked authority, same-church source checks, projection-only application, database Unicode bounds, active-template capacity and removal, content-free journals, out-of-order replay and deleted church ownership. The initially added two-church-membership test fixture violated the existing single-church constraint; the corrected test uses each church's actual coordinator and proves an otherwise editable source cannot import the other church's template. Failed evidence is retained.

Completed local acceptance on 8 October 2026 UTC:

- Full TypeScript, focused lint, copy, source-security and diff checks pass.
- All 41 existing application, availability, shift, reminder and notification regression groups pass, with no skips.
- Node 24.20.0 production build `l0MRuUnpbHppHXvQuvlOG` is bound to 1,712 unchanged source and migration inputs. Emitted hydration, all 270 runtime traces and public-build security checks pass.
- Four actual trusted-HTTPS groups pass, including exact receipts, strict filters/body limits, no-store headers, origin/account pinning and revoked authority before replay.
- Seven browser journeys pass: keyboard authoring/reload; four genuinely unsaved fields retained across concealment; a committed lost response recovered only by its original account with one stored operation; four-field application with contact/capacity/shift and database state preserved; a delayed response unable to overwrite a newer draft; ordinary explicit opportunity persistence and no picker on existing edits; template removal and current-authority concealment. Removal leaves the saved opportunity unchanged.
- The browser checks assert save, apply and removal status focus before helpers move it. The 320px layout has no horizontal overflow at both 16px and 32px root text. Screenshots were inspected, with no page errors or external browser requests. Lifecycle events and enlarged text are bounded simulations, not physical-device or full zoom conformance.

Two initial production builds failed in Next's font URL-extension parser. Fresh standalone and diagnostic build captures contained valid font URLs; subsequent normal builds passed without application or dependency changes. The exact failing response was not captured, so its cause remains unconfirmed. Both failed logs and the diagnostic result are retained.

The initial browser fixture attempted a second discussion on one event and was corrected to add an opportunity to the existing discussion. Exact nested-label selectors also included populated textarea/option text; the runner now selects the controls by their accessible roles and names. Private rehearsals preserved the original built-source receipt. The corrected canonical runner was included in a fresh production build before the final complete HTTPS/browser run. No product changes or weakened assertions were needed for these fixture corrections.

## Integration and remaining acceptance

This branch follows the media transcript checkpoint. Integrators must apply the migration, regenerate Prisma and reconcile schema/retention changes with the release owner's branch. Ordinary templates do not fulfill the separate leadership screening gate. The combined task remains open.

Local acceptance does not establish merged, deployed, live, provider, enforced-MFA or physical-device acceptance. The designated release owner retains combined integration and live verification; hosted source-security failures are not waived.
