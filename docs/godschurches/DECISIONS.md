# Decisions and recommendations

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
