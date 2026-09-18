# Family identity and child launch decision record

## Current decision

September 18, 2026 candidate, inspected against integrated `9e66724`. Child social participation is not authorized for launch. The current supported participation policy remains the adult preview, with an explicit acknowledgment of being 18 or older. No child age band, guardian verification method, supervised identity, family permission, pilot cohort or child capability is approved by this record. It prepares concrete questions and acceptance evidence for the existing qualified privacy, safeguarding and legal review gate.

This is an engineering decision record, not a legal determination or evidence that qualified review occurred. Passing code tests or merging this document does not resolve that gate. Existing public guest pages remain their current public projections; this record does not claim to identify or exclude every anonymous child visitor.

## Actual source boundary

`portal-types.ts` defines `ADULT_POLICY = "adult-preview-v1"`. `portal.ts` accepts the explicit adult acknowledgment only for that policy version. `portal-policy.ts` checks current acknowledgment, verified email, suspension and deactivation for eligible participation. Adult contact requests reuse this current eligibility and recheck it before receipt replay. The acknowledgment is self-attestation, not independently verified age, legal capacity, parental consent or guardian authority.

`settings-contract.ts` leaves family scope inactive, and `settings-registry.ts` marks the family entry as future. The inspected schema has no supervised identity or guardian-authority model. A church-position child relation or a nested comment is unrelated to a child account. An ordinary adult login, church grant, relationship, shared device or matching surname cannot stand in for family authority.

The current privacy page says the site is not directed to children under 13 and does not knowingly collect their personal information. That statement is not a review or permission to launch participation for ages 13 to 17, and the adult preview acknowledgment does not prove age assurance. Any discrepancy between intended audience, actual knowledge, registration behavior, public copy and proposed launch needs qualified review before changing child access.

## Supported ages and unresolved bands

| Group                                             | Current supported state                                                | Decision required before a change                                                                                                                                                                                                 |
| ------------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Acknowledged 18 or older                          | Existing adult preview eligibility only, subject to all current checks | Preserve current policy; determine whether proposed family management needs stronger identity/authority evidence.                                                                                                                 |
| Under 18, including teenagers                     | No approved child social capability or supervised-account launch       | Choose supported jurisdictions, minimum age, explicit bands and per-band capability scope after qualified review. A teenage account must not be treated as adult merely because it falls outside one legal definition of a child. |
| Unknown, disputed or unverified age               | No new family classification or privilege granted                      | Define proportionate age assurance, correction, dispute handling and minimum evidence without collecting unnecessary identity documents.                                                                                          |
| Future transition between bands or into adulthood | No automatic transition implementation exists                          | Approve the authoritative evidence/date rules, destination policy, notifications, data separation and review before granting new access.                                                                                          |

Do not hard-code new under-13, teenage or jurisdictional launch bands from an assumption. The current COPPA rule defines a child under that rule as under 13 and has its own scope, notice, consent and information-handling provisions. Review applicability to the actual operator and service; that threshold is not a universal launch age or a complete teen-safety policy. [Current 16 CFR Part 312](https://www.ecfr.gov/current/title-16/chapter-I/subchapter-C/part-312)

The reviewer must identify all applicable jurisdictions and current obligations, including any required assessment, child-facing notices, consent basis, processor limitations and safety controls. This record does not select a provider, make a compliance certification or infer that a religious/nonprofit context settles applicability.

## Guardian authority and identity decisions

Before linking identities, approve a purpose-specific method for establishing both the adult's identity and their authority for the particular child. Account email verification alone proves neither relationship nor legal authority. A child cannot become owned by an adult who knows a username, possesses a device, sends an invitation or is a church leader.

The accepted design must keep the child as a distinct identity with its own sessions and current policy. Guardian links need explicit scope, status, effective dates, evidence reference, policy version, accountable verifier and revocation history. Store only the minimum permitted evidence; avoid placing documents, child dates of birth or family circumstances in public profiles, task comments or ordinary application logs. The evidence store, access, retention and deletion must be approved before collection.

Resolve who may create, approve, view, edit, invite another guardian, recover or revoke a link. Define limited co-guardian/delegated roles rather than assuming any linked adult has every right. Disputed custody, conflicting instructions, compromised adults and unsupported evidence require a safe restricted state and a reviewed support route. Do not let one unverified claimant erase another person's authority or inspect past private child records.

## Consent, revocation and recovery lifecycle

The future contract must separate notice delivery, identity/authority verification, specific consent, child assent where required, permission selection and actual activation. A proposed link begins nonactive. No pending invitation, checkbox or stored draft policy grants access. Consent must identify the policy/data purposes and approved capability scope, and be recorded with a current version and accountable authorized action.

Review renewed consent when purposes, providers, audience or capabilities materially change. Define decline, expiry, withdrawal, account erasure and evidence correction. Revoking a guardian link or changing policy must invalidate dependent authority on the next relevant server request, including queued notifications, shares, exports, old sessions and exact retries. The family design must use one current effective-policy resolver; local toggles never become the authority.

Recovery must distinguish adult credential recovery, guardian-authority recovery and child session recovery. Recovering an email account cannot automatically recreate a revoked family relationship, broaden permissions or disclose a child's history. Compromise handling needs session revocation, safe notifications that do not expose private family information, a reviewed dispute process and minimal auditable action history. Preserve required support and safety access without enabling ordinary child social actions by accident.

An age transition requires the approved age evidence and boundary, current policy resolution and an explicit record of the resulting change. A device clock, editable birth date, adult-style screen or new login does not promote an account. Decide whether fresh consent is needed, which guardian powers end, how the newly adult account gains control, and which historical child records remain restricted. Never expose prior private history to a new guardian or public audience through a birthday default.

## Exactly what can ship now

| Capability                                                                                | Current launch disposition                                                                                                                                                      |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Child social account creation and activation                                              | Disabled/unimplemented; no supervised pilot authorized.                                                                                                                         |
| Child posts, comments, follows, DMs, contacts, search/discovery, tags and public profiles | No child capability enabled by this work. Each later route and direct endpoint needs explicit current-policy authorization.                                                     |
| Child photos/audio/video, groups, Exchange, donations/payments, location and calendars    | No child capability enabled. Existing adult or public source availability is not a child release decision.                                                                      |
| Guardian dashboard, child progress/activity history or parental exports                   | No live family capability. A future preview may show policy only to a verified current scoped guardian and must distinguish draft from effective state.                         |
| Parent-enforced time limits and cross-device totals                                       | Unavailable until the family enforcement owner exists and its actual coverage is verified. Optional adult reminders cannot substitute for it.                                   |
| Public help, safety reporting and essential account recovery                              | Preserve current services and source permissions. A later child-specific safe-help path requires reviewed operation and copy; no promise of staffed child support is made here. |
| Engineering documentation and isolated fictional tests                                    | Permitted preparation only. No real child enrollment, evidence collection, new production grants or provider transmission.                                                      |

## Required review record before implementation and launch

The responsible product owner must name qualified privacy/legal and safeguarding reviewers, provide the intended jurisdictions and pilot scope, and record their decisions privately. Review expense/provider cost is unknown until an actual reviewer or service is selected; this document approves no purchase or engagement.

| Open decision                                      | Concrete evidence required                                                                                                                            |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Supported jurisdictions, ages and capability scope | Dated reviewed policy naming allowed bands, exclusions and the precise initial module/action allowlist.                                               |
| Guardian authority and minimal age evidence        | Approved verification/correction method, evidence minimization, independent dispute path, access controls and expiry/recheck rules.                   |
| Notice, consent and purpose changes                | Reviewed parent/child copy, applicable consent/assent flow, versioning and withdrawal behavior before collection.                                     |
| Data and processor boundaries                      | Field inventory, provider purposes/terms, retention/deletion, recovery/restore treatment, export access and prohibited collection.                    |
| Safeguarding and contact risks                     | Approved inappropriate-contact/blocked-adult, tagging, discoverability, location, reporting/escalation and abuse-response procedures.                 |
| Compromise, recovery and family disputes           | Accountable support roles, safe response path, credential-versus-authority separation and notification/audit limits.                                  |
| Age transitions                                    | Authoritative boundary/evidence, effective-policy changes, notifications and historical privacy rules.                                                |
| Operating readiness                                | Named accountable operators, actual availability expectations, escalation contacts, training and a usable disable procedure.                          |
| Bounded pilot release                              | Explicit approval for the named cohort, verified endpoint matrix, monitoring criteria and an exercised stop path preserving required support records. |

The technical threat-model task should test forged guardian IDs, unrelated adults, old/replayed sessions, guessed child URLs, cross-account writes, revoked links, conflicting guardians, blocks, direct endpoints, notification/export queues and age transitions. It must not interpret this unresolved review record as a settled guardian policy. Persistence, sessions and enforcement wait for the decisions their implementation actually needs.

Before launch, the accepted family resolver and every enabled source adapter must demonstrate denial of unapproved actions and immediate policy/revocation handling through UI and direct requests. No provider flag, child role label, database row, browser preference or operator shortcut can bypass the launch gate. The release owner needs the qualified review receipt, exact build and migration identity, tests, operational owners, pilot approval and verified stop behavior; missing mandatory evidence keeps child launch closed.

## Verification and handoff

This candidate changes only this decision record. No runtime, schema, policy version, age field, provider, configuration, production data or access changes. Two targeted existing tests pass against an isolated fictional database: unverified/unacknowledged actors cannot request, share, read a church directory or receive grants; contact requests recheck both participants and deny historical receipt replay after adult-policy eligibility changes. Source-reference, private-data/copy, formatting and diff checks pass. These checks are not a new full-suite or browser result and cannot establish child-policy readiness or independent age verification. The private paired owner-review action and technical task retain their launch blocker until qualified decisions are recorded. A1 integration of the document is separate from that review and any child release.
