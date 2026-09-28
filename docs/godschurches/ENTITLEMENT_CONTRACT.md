# Entitlements, current authority and the free pilot

September 28, 2026 UTC. C26-01 implementation contract, prepared for integration.
The pilot stays free. No paid plan, price, trial, subscription, provider account
or billing screen is activated by this document. Paid terms and native commerce
readiness remain unresolved prerequisites, not choices to infer from this design.

## Current source and permitted definition

Inspected checkpoint: `ee2df2fd1e40b37c2b2747432160f3bf88c6dff8`.
The shared-foundation mapping prerequisite is complete. The focused C26 packet
explicitly permits entitlement definition and isolated testing while billing is
disabled. It requires paid access to remain distinct from roles and private-data
authorization, and preserves the free pilot without upgrade prompts.

| Existing owner | Boundary to reuse |
| --- | --- |
| `resource-contracts.ts` | Implemented/reserved source descriptors are not paid entitlements or permission grants. A plan cannot activate a missing service. |
| `account-sessions.ts`, `social-boundary.ts` | Current eligible session/account and source authorization stay mandatory for every request. |
| `church-permissions.ts`, `church-management.ts` | Current scoped church duties and activated management remain independent from payer, plan owner, invoice contact or subscription status. |
| `social-operations.ts`, `account-limits.ts`, `social-activity-limits.ts` | Preserve exact retries and existing abuse limits. Billing cannot create a quota bypass or a second rate-limit authority. |
| `settings-registry.ts` | Show only real supported controls to the current scope. No fake pricing, receipts, usage, savings or unavailable upgrade buttons. |
| `account-export.ts`, `account-erasure.ts`, `retention-controls.ts` | Existing privacy/lifecycle and protected recovery remain source owned. Plan expiry cannot make retained private data public or erase it silently. |

There is no accepted paid feature/limit matrix, billing resolver, payment event
ledger or native subscription integration in the current application. Calendar,
notification and idea "subscriptions" are unrelated existing concepts and must
not be reinterpreted as billable products. No new paid state belongs in those
tables, church grants or user role flags.

## Eligibility is not authorization

Authorization answers whether the current actor may perform an action on this
exact source. An entitlement answers whether a separately authorized action is
included in the scope's accepted plan and measured allowance. Both are necessary
when a future action has a paid allowance; neither substitutes for the other.

Conceptually, allow an action only when its implementation is available, the
current actor/source policy allows it, and any applicable accepted entitlement
and budget permits it. Do not return private plan/usage details before the actor
may inspect that billing scope. A denied source response remains privacy safe.
No universal permission hierarchy, generic cross-resource write or client-supplied
"paid" flag is introduced.

Paying never grants church management, membership, reviewer powers, child access,
source publication, private messages, screening clearance, intellectual-property
rights or another organization's data. Free users keep authorized access to free
sources. A paid user who loses a source grant loses access immediately even if
their subscription remains active. Conversely, a role change alone cannot start,
cancel, renew or transfer a subscription.

The billed scope and its authorized administrator are separate identities.
Future supported scopes may be a personal creator or one canonical organization,
only after that scope's authority adapter exists. The purchaser's email, payment
method holder or receipt recipient is not proof of organization authority. Never
join accounts by email, infer a church from membership or use one organization's
plan for another. Billing access needs a distinct explicit capability and current
scope check; it does not imply ordinary content editing or vice versa.

## Free baseline and disabled billing

The free baseline is every currently implemented, available pilot action under
its existing authorization, consent and source-specific safety/resource limits.
This does not promise unlimited usage or enable future features. Preserve current
account recovery, privacy controls, content access and operator duties. Do not
retroactively paywall an existing free pilot action through this contract.

The accepted paid-plan matrix is empty until a separate explicit decision records
the products, included features, scope, prices/currencies, limits, terms/version,
effective dates, renewal/cancellation and grace policies. Do not fabricate values
to make a plan UI look complete. Future media or organization allowances are
candidates only, not an accepted price or quota.

While billing is disabled, ordinary free actions follow their existing owners
without a new dependency on a billing provider or paid database state. Paid-only
checkout, subscription creation, upgrades, renewal mutations and entitlement
activation remain unavailable on every direct and indirect route. A forged API
payload, stored "active" row, environment variable or incoming webhook cannot
turn billing on. Implementation requires the reviewed capability plus accepted
plan policy and commerce readiness; a flag is never sufficient authorization.

Billing controls, prices, trial countdowns, upgrade pressure and fabricated usage
remain absent from pilot surfaces. Existing unavailable feature explanations can
remain accurate without promising a paid unlock. A development fixture proving
a gate rejects requests is not a live plan, payment or provider acceptance.

## Allowances and measurement

Accepted future plan rules must map stable feature IDs to exact supported actions
and limits for one scope. Never include a blanket "all future features" grant.
Each limit defines unit, measurement source, period/time zone, reset semantics,
maximum, included operations, concurrency and grandfathering rules. Unknown or
incomplete paid rules deny paid expansion while preserving the free baseline.

Keep entitlement allowance separate from security/abuse ceilings and provider
budgets. The most restrictive applicable requirement wins; paying does not remove
abuse protection. Reuse the canonical resource's actual bounded counters or
receipts instead of creating inconsistent client counters. No unmeasured usage
or estimated value may be labeled current actual usage.

Charge an allowance once for a committed logical operation. Exact retries reuse
the original result without consuming it again; failures before commit consume
no feature unit. Reserve/commit/release any in-flight resource allowance atomically
with the owning resource, so two concurrent requests cannot consume one final
place twice. Distinguish resource units from transport flood limits, which retain
their existing independent behavior. Every alternate endpoint enforces the same
current resolver and canonical counter.

Reads of plan/usage are bounded, private and scoped. Unknown measurement is
"Unavailable", not zero or unlimited. Show the unit, source/time and applicable
limit only when the real plan and counter exist. Never expose another customer,
organization member list or hidden source count through a billing dashboard.

## Expiry, reconciliation and non-destructive downgrade

Future entitlement records bind a canonical scope to an accepted plan version,
validity interval, source payment/administrative decision, state and version.
Use server time and consistent UTC comparisons. Unknown source or policy fails
closed for paid-only actions. Resolve expiry at read/write time; a delayed cleanup
job cannot extend paid access. A displayed plan badge or cached browser decision
does not authorize a mutation.

Subscription state must be reconciled from the accepted provider integration and
canonical payment event ledger after commerce readiness. Browser redirects,
query strings, client receipts, webhook arrival alone or a manual future date are
not payment confirmation. Validate provider authenticity, exact account/customer/
scope mapping, event identity and current reconciled state. Duplicate, delayed,
out-of-order or replayed events never extend the entitlement twice or roll a newer
state back. A refund, dispute, cancellation, payment failure or later restoration
uses the accepted plan policy; this contract invents no grace duration or
paid-through promise.

Expiry/downgrade stops only newly unsupported paid operations under those accepted
terms. It does not silently delete published content, widen privacy, transfer
ownership, revoke unrelated church duties or block safety, export/erasure and
recovery controls. Existing content remains governed by its source's access,
lifecycle, moderation and accepted retention policy. If usage exceeds the new
allowance, explain the measured overage and constrain only the affected future
writes. Do not pretend a hidden copy or deletion happened to meet a quota.

Restoring a paid entitlement does not restore revoked source permission, withdrawn
consent, erased data, deleted content or a prior organization appointment. Recheck
all current source and plan requirements. A plan transfer never transfers source
ownership; it needs its own current authority and accepted terms. Administrative
entitlement correction requires its specifically approved auditable authority,
not an ordinary support grant or the ability to edit a church profile.

## Recovery and activation gates

Before any billing persistence, define source-aware export/erasure, private
receipts, minimal audit and protected restoration with the accepted commerce
ledger. Do not put payment instruments, provider secrets or unrestricted receipt
URLs in personal profile exports, logs, notifications or browser storage.
Recovered backups cannot revive old paid intervals, lost customer mappings,
withdrawn billing consent or revoked billing administrators. Require reconciliation
and compatible protected replay before reactivating paid actions after restore.

The following remain explicit unresolved operating decisions: first native
commerce product and responsibility owner; supported geography/customer types;
provider/ledger and payment reconciliation; accepted plan/price/limit matrix;
terms, renewal/cancellation/refund/dispute/grace treatment; billing administrators;
measured quotas; retention and recovery acceptance. Resolve these in the existing
commerce and C26 tasks. This document appoints nobody, accepts no provider terms,
buys nothing and decides no legal/tax obligation.

Future implementation can test the disabled resolver with fictional states while
these gates remain closed. It must not add a launchable paid plan simply to make
a test pass. Integration review of this contract is not subscription activation.

## Required acceptance for the implementation children

1. An otherwise authorized free pilot action works with billing disabled, missing
   paid records and an unavailable provider. No upgrade prompt or price appears.
   Unknown/reserved features remain unavailable regardless of supplied paid state.
2. Paid and free actors with identical source permissions get the same private-data
   boundary. Test wrong scope, revoked church duty, personal versus organization
   ownership, account replacement and billing administrator versus content editor.
3. Verify every relevant direct/alternate route, exact retry, failed transaction
   and concurrent final-unit request against one canonical counter. Paying never
   bypasses abuse ceilings or provider resource protection.
4. Cover expiry at exact boundaries and non-UTC database sessions, stale cache,
   duplicate/out-of-order provider events, cancellation, refunds and correction.
   No event creates an entitlement for a mismatched account or organization.
5. Verify non-destructive overage/downgrade, current source access after restoration,
   export/erasure/recovery availability and protected replay of billing revocation.
   No plan state can resurrect deleted content or consent.
6. Complete the browser/API/data journey, measured usage and error states with
   actual accepted plan rules before paid activation. Fictional provider receipts,
   source tests and a successful build do not prove real payment operations.

This contract-only handoff adds no migration, provider dependency, scheduled work,
runtime billing flag, paid capability or website interface. The free pilot and
existing permissions remain unchanged; real paid activation stays closed.
