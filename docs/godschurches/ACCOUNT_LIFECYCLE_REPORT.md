# Account deactivation and reactivation

## Implementation — September 9, 2026

Account settings provides a password-confirmed, explicitly acknowledged
deactivation. A separate reactivation page accepts the existing account email and
password, then returns to sign-in. Self-deactivation uses a new nullable
`PlatformUser.deactivatedAt` field, distinct from operator suspension. The additive
migration leaves existing accounts active.

Deactivation refuses to abandon any unrevoked church capability, operator role,
contact appointment or support capability, or retained case/enabled intake
ownership. Those duties must be handed off and removed first. The check and write
share the existing church/support advisory transaction gate, acquired before the
owner row lock. Concurrent duty assignment cannot slip past the check.

Successful deactivation increments account credential and portal versions,
revokes every session and pending grant, deletes directory preferences and ends
support coordinator sharing through the existing audited reconciliation. Church
connections, community content and support records remain stored. Authorized
support staff retain their existing case access. This is not deletion, a retention
countdown, or erasure of content already seen or saved by others.

The feed, search, public profiles, comments, likes and relationship counts exclude
inactive and suspended users. Community Server Actions now execute their writes
inside the shared access gate and recheck the authenticated cookie after locking.
They neither accept a request-supplied author nor interact with an inactive target.
The global gate is appropriate to the current small deployment; it serializes these
writes and should be measured before scaling traffic.

Reactivation requires the current stored password and rechecks credential state
under the same locks. It cannot claim a passwordless legacy account or bypass an
operator suspension. It creates no session, restores no old sign-ins or sharing,
and requires a separate sign-in. Existing community content and relationships
become visible again. A fresh password-recovery grant can reset an inactive
account's password without activating it; actual recovery delivery still depends
on the separately documented sender setup.

## Verification

All 105 isolated service/HTTP tests, lint and TypeScript checks passed. Upgrade
fingerprints, backup/restore, fresh migrations and new-process persistence passed.
Nine lifecycle groups cover service and actual production HTTPS boundaries,
including community Server Actions, identity/origin checks, duty handoff,
revocation, record preservation, HTML/RSC visibility, race behavior, suspension,
legacy accounts and rate limits. All write checks use isolated fictional data.

Actual local browser checks passed: signup/sign-in and a saved post, required
acknowledgement, wrong-password feedback, keyboard deactivation, hidden public
profile, wrong-password reactivation, explicit reactivation and separate sign-in,
restored post, duty-holder rejection and logout. Both forms fit 320/390/1440px
without horizontal overflow; the phone layout was visually inspected. No browser
error logs were returned. The browser used local development HTTP; production
HTTPS is evidenced separately by the harness. No physical-device test is claimed.
The final production build/type check passed; runtime inspection covered 52 traces,
3,777 entries and 120 server JavaScript files without a Prisma configuration-loader
path.

A local regression identified that revalidating the entire platform layout after
a community write could make static demo routes return 404 (`NoFallbackError`).
The refresh now targets Home, search and profile pages. The action test verifies
that the static demo remains available after posting.

## Published release

Application `c08226efba67dcc2aabe1f4c97030aafdfe922bc` is live on production
deployment `dpl_2iwfAMNWTszoV6Nfx1KxmjEK5L5T`, READY at
2026-09-09T23:46:21.970Z. The migration completed successfully. The exact Git SHA
and canonical alias were verified; 17 live HTTP route/origin/anonymous-access
checks passed at 23:47:43Z. The deployment-scoped error query returned no matching
entries. These live checks created no account and sent no email.

Once an account is deactivated, a rollback must retain lifecycle-aware access and
visibility checks. Older application code does not understand the inactive state;
the additive schema alone does not make that older behavior a safe rollback.

## Remaining account scope

Permanent account deletion, verified email ownership changes, Google linking,
actual recovery delivery and relevant physical-device acceptance remain separate
work. No real account is deactivated or reactivated by the verification process.
