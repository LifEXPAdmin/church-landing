# Adult contact implementation receipt

## Request and preference interface verified locally — 12 September 2026

The shared contact workspace now provides received/sent lists, private request
receipts, a short purpose composer and recipient accept/decline or sender
withdraw actions. It uses the verified contact service and current versions.
The existing Settings registry owns contact preferences; Menu links to requests.
Missing preferences remain No one, broader choices require current availability,
and No one, decline and withdraw still work while new intake is paused.

The feature reuses social transport, unsaved-work/Back protection, safe update
blocking, compact relationship controls and selected private reporting. Unknown
responses retain identical request bytes; conflicts retain unsent choices.
Account replacement conceals private entries, including when detected after a
committed response. The same verified recovery edge case is repaired in the
existing report form. Failed preference reads do not present old saved values
as current. Block events immediately refresh the request's available actions.
No global request polling, duplicated permission service or dependency is added.

Fresh browser acceptance passes eight enabled contact groups and five paused
intake groups, plus eight report regression groups. Checks cover actual database
outcomes, exact retries, stale preferences, account replacement before/after
commit, decisions/expiry, block/report, Back/discard, Retry-After and failed reads.
Screenshots cover 320/390/1440 widths and dark appearance with largest text and
keyboard entry; page errors are zero. Closed Menu and Settings make zero contact
requests and do not load the contact workspace chunk. These are isolated desktop
browser checks, not new physical-phone results. The first paused test used a
Playwright disabled-state assertion that did not recognize an option; checking
the native option's disabled property and rerunning verifies the actual control.

Twenty-two navigation/settings contract tests, types, scoped lint and the
production build pass. Runtime tracing passes 127 traces, 10,827 entries and 320
server JavaScript files with no private fixture/environment or Prisma loader
paths. No speed improvement is claimed. The service's 47 focused and eight HTTPS
checks remain the foundation receipt below; the complete release gate is pending.

This interface is local only. Profile Message/resume entry, persistent text
history, in-app indicators and integrated publication remain next. Production
still serves reporting version `2026.09.12.24` / `e710170`, with 33 migrations;
the contact migration has not run there. Common real reviewer/retention/erasure
requirements and separate parent/owner acceptance remain open.

## Service foundation verified locally — 12 September 2026

The contact-request service implements the
[adult contact contract](ADULT_CONTACT_CONTRACT.md) through existing account,
permission, social receipt and rate-limit owners. It adds two canonical tables:
bounded immutable requests and sorted two-person conversation membership. No
message store, duplicated opening body, background worker or dependency is added.
The accepted request remains linked contact context for the conversation UI.

The existing personal preference row gains a separate request audience defaulting
to NOBODY for old and new rows. It preserves mention/privacy fields and shared
version conflicts. Create, recipient accept/decline and sender withdraw are
checked and retry-safe; one pending unordered pair and sorted conversation
uniqueness also have database constraints. Expiry, short/daily budgets, active
limits and decline cooldown are enforced. Reads paginate before projection and
exclude credentials, hidden profile fields and third-party requests.

Current blocks, unfollows, account deactivation and operator suspension revoke
pending consent through their canonical writers. Block or account reactivation
does not revive prior conversation sending. Accepted retained context remains
available only to its eligible participants. Personal requests depend on the
existing real global reporting readiness check, with no separate activation flag.
Withdrawal, decline, restricting contact and historic exact receipts remain
available while new intake is paused.

Selected-request reporting extends the existing report service; only a current
adult participant can submit that item. Explicitly authorized case review sees
its immutable purpose and participant references, never another request or whole
conversation. No automatic evidence copy is retained. Export adds only the
owner's sent requests and own request preference; another person's received
purpose is excluded from the general account export.

Fresh checks pass: 47 service/regression tests across adult contact, reporting,
friend invitations and social foundations; four HTTPS groups with fixture intake
enabled and four with intake disabled. They cover all request audiences,
eligibility, cross-account/origin rejection, exact and changed-body retries,
concurrent acceptance, expiry/cooldowns/quotas, pagination, selected evidence and
export, block/unblock, real deactivation/reactivation and operator suspension.
Types, scoped lint and production build pass. Runtime traces include 126 traces,
10,751 entries and 317 server JavaScript files, with no private fixtures,
environment files or Prisma configuration-loader path. No speed improvement is
claimed. Test diagnostics were corrected and the affected suite rerun.

Migration `20260912223800_adult_contact_foundation` is isolated-only. The new
request/preference screens, conversation interface, in-app indicators and their
integration/release acceptance remain unfinished. The next step is the required
request and preference UI, then the conversation slice using this membership.
The common reviewer/retention/erasure and physical/owner acceptance gates remain.

Production still serves `2026.09.12.24`, application `e710170`, READY deployment
`dpl_9QusbmKcg7v8ERjbYeLpsZjJSmKp`, with 33 verified migrations. No production
contact migration, contact write, reviewer grant or messaging activation is
claimed by this local checkpoint. The next release must run its complete gate,
fresh encrypted backup/restore and canonical deployment verification.
