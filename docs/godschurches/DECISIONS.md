# Decisions and recommendations

<!-- RELEASE_STATUS_BEGIN -->
## Published release (September 8, 2026, America/Chicago)

The actual account foundation and Stage 2B church portal are published together at
https://godschurches.com/platform. A persistent, signed-out, fixture-only tour is
available at https://godschurches.com/platform/demo. The original landing/feed remain.

Application SHA: 7679e034b93e3a905a7bee92ac6f5c377c2ce42d.
Vercel deployment: dpl_GnAHFqqiDBzheEh6j6ohL4G1P21R, READY; canonical alias confirmed.
Published September 8, 2026 at 16:10:07 CDT (21:10:07 UTC).
This current section supersedes the historical local-only/no-deployment statements
below; it does not retroactively change their results or remove real-member gates.

The user explicitly included routine publication in this and future authorized
build stages unless they say otherwise. Stop before the next feature stage.
No purchases, member imports, email/invitations, real church appointments, auth
bypass or destructive production data changes were performed.

Verification: 44 isolated account/portal tests, five demo fixture tests, lint,
types, fresh/upgrade migrations, production builds, encrypted real backup restore
and upgrade rehearsal passed. Actual local Chromium: 13 journey groups including
320px keyboard/mobile. Live: 28 HTTP checks and 27 browser checks, no page errors
or demo mutation attempts. Two additive production migrations applied; seven
complete. Linux build traces exclude the Prisma configuration-loader request path.
Account/portal functions: Node24, 2048MiB, 60 seconds; hashing was not weakened.

Published is not pilot approval. Real recovery/verification delivery is disabled;
operator identity/provisioning, real church/reviewer appointments, independent
security/privacy review, policy/retention and independent concern routing remain.
No email was silently verified and no demo data was inserted into production.
An actual owner-authenticated production journey was not exercised. Comprehensive
mutation/concurrency tests used isolated fictional records, not live accounts.
See DEPLOYMENT_REPORT.md for exact URLs, evidence, availability and recovery limits.

The application remains the SHA above. Post-verification report changes are a
local documentation-only successor, not a different published application release.

<!-- RELEASE_STATUS_END -->


## Current decisions: Stage 2B (September 7, 2026 local)

The defaults below were accepted explicitly through the user's pasted Stage 2B
prompt. They apply to this development slice, not retroactive consent, legal
approval, real church policy, or appointment of any person. Historical proposal
labels below do not override this current authorization.

| Topic | Current resolution |
|---|---|
| Delivery boundary | Isolated local implementation/testing only. No push, merge, deployment, real data/email, invitation or paid service. |
| Home Church | One combined pending OR approved relationship per person. No new request while approved; explicit leave first. Following is unrelated. |
| Connection meaning | Approval enables church-only access, not certification of formal membership or pastoral office. |
| Re-request | Terminal connections may request again, at most five requests per person/day, subject to account eligibility and API rate limits. Fresh review required. |
| Eligibility | Active account, verified email, and versioned acknowledgment of age 18+. No DOB/ID documents; acknowledgment is not independent age verification. Existing rows remain unknown. |
| Directory audience | Separate opt-in name. Optional separate contact email/phone default ONLY_ME; no login-email copying, addresses, public affiliation or export. Approved eligible members can view without being listed. |
| Withdrawal | Turning off listing clears field-sharing choices; owner-only drafts may remain until leaving/removal deletes preferences. Subsequent responses change immediately; already viewed information cannot be recalled. |
| Lifecycle revocation | Withdrawal/decline/leave/removal revoke same-church grants and dependent contact appointments. Rejoin never restores them. A first request preserves an independently assigned reviewer grant, but never permits self-review. |
| Scoped authority | REVIEW_CONNECTIONS and APPOINT_COORDINATORS are technical capabilities, not pastoral titles. Explicit operator capabilities separately establish churches, manage access/accounts, and appoint relationship owners. |
| Contacts | Primary/backup coordinators require current approved eligibility in that church. Relationship owners need not be church members. Displaying a contact does not confer directory/review/support rights. |
| Appointments | Only fictional appointments are provisioned. Andrew is the only confirmed real Godschurches operator; no real assignment record or staff claim was created. |
| Contact route | Keep published mcdrew169@yahoo.com. Do not add internal phone, allegation intake, promised availability, or an invented independent responder. Independent escalation remains a pilot gate. |
| Concurrency | Portal advisory transaction gate plus actor/target row locks, expected versions and combined partial unique index; current authoritative authorization, not cached token grants. |
| Privacy boundaries | Server-selected DTOs, no-store/no-referrer private routes, no generic platform analytics. Operator responses include only data needed by the actual capability. |
| Private preview renderer | Production build on loopback HTTPS with an ephemeral certificate; no system trust change. New portal pages refuse private reads in non-production renderers after a test demonstrated Next development I/O debug-cookie serialization. Account sink tests remain separate. |
| Dependency choice | Next 15 and Prisma 6 targeted patches only. Do not force deepmerge-ts8 under Prisma 6's exact7.1.5 pin. Residual named risk and release recommendation in DEPENDENCY_REVIEW.md. |
| Product scope | Ordinary support cases, category-search correction, final policies, calendar and social expansion are later work requiring review/instruction. |

The combined index and transaction behavior follow PostgreSQL's documented
[partial indexes](https://www.postgresql.org/docs/16/indexes-partial.html) and
[explicit locking](https://www.postgresql.org/docs/16/explicit-locking.html).
These mechanisms are verified only to the extent of the recorded local tests,
not a proof of all possible production races. Private DTO/authorization choices
also follow Next's [data-security guidance](https://nextjs.org/docs/15/app/guides/data-security).

Real provisioning remains separately controlled: Andrew verifies identity and
documented church authority, approves specific scoped capabilities/contacts and
their audience, and records the appointment through a reviewed release process.
The fictional test bootstrap is not a production command or self-service claim.
Privileged reauthentication/second-factor requirements and a backup operator need
independent review before real appointments. No retention period/entity/jurisdiction
or production authorization was invented to unblock development.

## Historical decisions and Stage 2A notes

Recorded September 7, 2026. Andrew McCuen owns product/operator decisions. Recommendations below are not approvals. Brief release 1.0.0 is dated September 8; source facts are from 68b4190.

| Topic | Status | Decision / recommendation and implications | Owner |
|---|---|---|---|
| Current authorization | Confirmed user direction via Prompt 1 | Inspection/documentation only; stop before stage 2 and publication | Andrew |
| Identity/design | Founder direction | Godschurches umbrella, The Revival movement; dark/gold, plain warm copy, no em dashes | Andrew |
| Scope | Founder direction | Adult reusable church connection/support journey; Beacon intended only, no appointment authorized | Andrew |
| Existing stack | Verified source; recommended reuse | Next/Prisma/Postgres; no replacement, major upgrade or paid help desk | Engineering proposal |
| Legacy claiming | Verified defect; proposed correction | Remove email+username claim path; prove email ownership through recovery; preserve rows/content | Engineering proposal |
| Account recovery | Missing; proposed | Hashed one-use tokens, real verified delivery, revoke sessions; test sink is not real delivery | Engineering; Andrew confirms sender access later |
| Password approach | Existing built-in scrypt | Retain compatible verification; review parameters/maintained primitives; no new custom algorithm | Engineering proposal |
| Adult eligibility | Founder constraint; proposed mechanism | Versioned adult acknowledgment for new private journey, no invasive ID collection; existing age unknown | Andrew reviews mechanism before pilot |
| Home Church | Proposed default, no existing affiliation conflict | One approved Home Church; one pending request; leave-first, no silent transfer; follows remain independent | Andrew review |
| Re-request | Proposed default | Explicit pending re-request with abuse bounds after terminal states; no unexplained permanent ban | Andrew review |
| Directory | Founder privacy direction; proposed defaults | Separate opt-in; name baseline, email/phone only-me by default; no personal address; same-church audience only; consent resets after leaving | Andrew review |
| Authority | Founder constraint; proposed mechanism | Explicit DB capabilities scoped to church, separate operator grants; no privilege from CHURCH/BUILDER/category/contact | Engineering proposal |
| Bootstrap | Proposed, release blocked | Synthetic-only provisioning first; real operator and church authorization checked before appointment; no email matching | Andrew |
| Named contacts | Founder direction | Andrew is current relationship owner; coordinator primary/optional backup only when actually appointed; phone not newly published | Andrew/church appointer |
| Ordinary support | Proposed minimal implementation | Private stored cases and explicit participants, no implied delivery/SLA; small states with reopening | Andrew review |
| Independent concern route | Unresolved operational gap | No independent person established for concerns about sole operator; sensitive intake deferred and real pilot gated | Andrew |
| Search | Verified source mismatch; proposed fix | Category-aware Testimony search plus bounded deterministic existing text search | Engineering proposal |
| Policies | Verified stale scope; release facts unresolved | Internal drafts first; actual entity/jurisdiction, processor configuration, retention/deletion and backup facts required; no invented claims | Andrew; qualified reviewer |
| Tests | No harness found; proposed | Minimal built-in Node runner + isolated Postgres fixtures exercising real services, two churches | Engineering proposal |
| Future work | Deferred founder direction | Calendar next; later social discovery, media, family, exchange, Foundry and physical spaces stay outside slice | Andrew |

No immediate interview is needed to finish stage 1. For stage 2 review, accept or correct the proposed single pending/Home Church and directory defaults. Before real pilot release, Andrew must establish actual church authorization and appointments, operator/data facts, verified recovery sender, reporting coverage and a genuinely independent concern route. The supplied brief requires qualified independent security/privacy review and a demonstrated restore; an AI review does not fulfill either.

No specific retention period, legal entity, paid vendor, real data permission or launch date was chosen. These supersede any earlier conversational suggestion that a working public preview is ready for private church use.

## Stage 2A decisions (September 7, 2026 local)

The user's new attached prompt explicitly authorizes account-security development
and supersedes the stage 1 inspection-only boundary for this slice. Church-feature
defaults above remain proposals. No production publish, push or migration authorized.

| Topic | Status | Resolution |
|---|---|---|
| Legacy account claim | Implemented locally, verified synthetically | Reject duplicate overwrites; independently reviewable commit f027758 |
| New signup session | Implementation choice | Consistent duplicate/new registration confirmation; normal login required rather than auto-login |
| Password/session race | Implemented and tested | Credential version plus per-account database row lock; login snapshot must still match at insert |
| Revocation policy | Explicitly authorized; implemented | All existing sessions and grants invalidated after successful change/reset; no automatic new session |
| Password compatibility | Implemented and tested | Verify original scrypt format; new versioned scrypt cost; keep original length/Unicode policy |
| Recovery/contact grants | Implemented and tested locally | Separate purposes; 30-minute security-token lifetime, not a general personal-data retention policy |
| Grant delivery | Local test verified; external blocked | Disabled in production; file sink strictly local and rejected with NODE_ENV=production or VERCEL |
| Trusted origin/abuse limits | Implemented and tested | Exact configured HTTPS origin in production; global 120/min, IP 30/15min, subject 10/15min (requests 3/15min); no reset-triggered session revocation |
| Dependency patch | Implemented based on official advisory | Next/eslint-config-next 15.5.21; no broad dependency modernization |
| Church/age/support policies | Deferred | No suspension, age, church assignment, directory or support schema added in this slice |

Real recovery release still needs a deliberately chosen and verified transactional
sender, asynchronous queue/timing evaluation, safe post-reset notification handling
and end-to-end delivery checks. No credentials or vendor purchase requested.
Independent security review and real operating facts remain release requirements.
