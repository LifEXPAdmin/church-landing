# Ordinary session inactivity policy

## Verified live, 28 September 2026 UTC

The policy is implemented, tested, merged and verified live in .39, source
`7fb9da581f5cafd3166707001e1c9f97464cf83e`, deployment
`dpl_3L37rY2JGRDXJ88ZuYv2rprq7jzF`. The combined release passed 160 service,
70 browser and 12 HTTPS groups. Session-specific browser acceptance includes
trusted foreground activity, passive-read purity, frozen-clock expiry, native
blur, cross-account denial, dirty-work retention and an accepted Admin request
whose lost response is recovered with identical bytes after same-owner sign-in.
Seven session HTTPS groups cover actual login/cookies, deadline enforcement,
origin and owner boundaries, API/SSR denial and refusal to revive expiry.
Physical device sleep and an actual 30-minute wait were not observed.

Migration 123 applied at 04:57:36 UTC with the existing five sessions still null
and their original absolute deadlines unchanged. Protected 121-to-123 recovery
and ordinary 123-to-123 recovery passed separately. The retained .39 artifact is
the compatible recovery candidate; older .38 ignored idle expiry in an isolated
reproduction. Explicit isolated revocation made both deny the old token, but no
production rollback or revocation is authorized by that experiment.

The engineering default remains provisional: about 30 minutes, with the original
30-day absolute ceiling. The owner-duration question remains unanswered. This
release establishes implementation and scoped verification, not owner risk
acceptance or complete ASVS compliance. See [release evidence](DEPLOYMENT_REPORT.md).

## Historical preparation status, 28 September 2026 UTC

This is an implementation checkpoint, not a live-policy announcement. The shared
policy, additive migration, issuance, five authorization gates, activity endpoint,
retained-owner notice and notification cleanup are implemented locally. Seven pure
deadline checks, eleven real-database activity/authorization checks and four
notification checks pass. All 121 combined service checks pass on the corrected migration. An earlier
four-check failure was resolved by correcting only a fixture journal path.
Browser, recovery and release acceptance remain open. Existing live sessions still use their fixed 30-day absolute expiry.

A subsequent schema audit reproduced unrelated generated artist migration drift:
a removed topic-search index, five reverted UTC defaults, a removed welcome-thread
default and changed foreign-key update actions. Integration removes those statements
and aligns the Prisma declarations with the existing contracts. The original
handoff and initial fixture are preserved. The corrected baseline upgrade passes:
all 559 prior indexes, 302 foreign keys and 1,824 column defaults are unchanged.

The initial combined artist and inactivity upgrade from migration 121 to 123 preserved
all existing fields and rows in the 160 original fixture tables, 58 populated.
A separate rolled-back migration rehearsal also preserved all 550 original session
rows and verified UTC defaults under both UTC and Pacific/Auckland database time.
The first notification run exposed an unsupported attempt-outcome value. The fix
uses the existing EXPIRED diagnostic and CANCELLED delivery result; its rerun
passed without loosening the database constraint.

The provisional engineering default is 30 minutes of inactivity. An owner
preference question is pending; this document does not record owner acceptance.
The original absolute 30-day ceiling remains unchanged. The duration is a product
risk decision, not a universal requirement of ASVS.

## Activity and lifetime contract

New sessions receive a separate idle deadline. The absolute expiry never moves.
The server rejects a session at either deadline, including exact equality.
Server time is evaluated after blocking account locks. No supplied client clock,
timestamp or duration is authoritative.

Only the explicit foreground-activity request may move the idle deadline. The
browser emits it for deliberate interaction on a visible, focused platform page.
An open tab, background polling, prefetch, service-worker activity, push delivery,
deferred email and passive session checks do not qualify. This is an authenticated
client activity signal, not proof that a human is present; a stolen valid token
can also generate requests. Absolute expiry and revocation remain necessary.

Writes are limited to approximately once per active minute. The server records a
deadline 31 minutes ahead on a qualifying update and suppresses updates while
more than 30 minutes remain. This gives 30 to 31 minutes after the last qualifying
interaction, bounded by absolute expiry. New sign-in initially receives exactly
30 minutes. The interface must describe this as about 30 minutes and use the
server's actual deadline rather than independently promising an exact duration.

Validation is pure. In particular, account read transactions explicitly prohibit
writes. Activity takes the existing account lock, rereads current credentials,
account state and both deadlines, checks the expected account, and conditionally
updates an existing eligible session. It never upserts, revives expired tokens,
extends absolute expiry or renews a recent-authentication proof. A delayed denial
must not clear a newer login cookie.

## Existing-session transition

Existing rows have no trustworthy last-interaction time. Do not fabricate one.
The prepared design adds a nullable idle deadline. Existing null rows retain
their existing absolute expiry, with a fixed outer transition limit of
29 October 2026 at 00:00 UTC. The first explicit foreground-activity request
adopts the new idle deadline. Newly inserted rows receive an idle deadline by
database default as well as the application's issuance path, including inserts
by a temporarily older application during deployment.

This is a bounded legacy exception, not evidence that every existing session
already meets the idle policy. The release must precede the fixed cutoff and
verify that all current sessions fit within the documented interval. Do not move
the cutoff forward automatically. The sign-in and active-sign-in interfaces must
explain the new behavior before adoption. No production backfill has been run.

## Authorization and retained work

All five independent session gates must use the same predicate: ordinary account
reads, owned commands, password change, Google linking/reconfirmation callbacks,
and final push admission. Session listing and push-device eligibility must apply
the same deadline. A Google round trip that began before expiry is not authority
to finish after expiry. Background work never renews a browser session. Durable
account-owned work, such as scheduled publication, keeps its separate lifetime.

Expiry must conceal private presentation while preserving mounted command owners,
dirty entries and the exact bytes/key of an uncertain request. Same-account
reauthentication may recover the original receipt through the existing authority
and fingerprint checks. It cannot inherit the old session's privileged proof.
Account replacement, MFA challenge, network failure and business conflict remain
distinct. Do not globally unmount retained work or automatically retry commands.
Phone subscriptions remain tied to their original sign-in. Idle expiry cancels
further phone delivery through that session, including reminders waiting through
quiet hours. Fresh sign-in and deliberate device setup may be needed. In-app
activity and independently consented account-owned email retain their own rules.

## Verification and recovery gates

Before release, verify real API/SSR denial, all direct gates, pure read-only
transactions, issuance defaults, legacy adoption, exact boundary and tolerance,
concurrent activity versus revocation, account replacement, passive polling,
background delivery and lost-response recovery followed by same-owner sign-in.
Review narrow and enlarged layouts and privacy concealment in the browser.
The client uses elapsed monotonic and wall time conservatively: either can shorten
the server-derived display budget, and neither may restore already elapsed time.
A frozen monotonic-clock calculation was reproduced and corrected before release;
physical device sleep remains a separate acceptance observation.

Schema compatibility does not make an older application a safe fallback: it
ignores the new idle deadline and could revive idle-expired tokens. Prefer a
retained idle-aware application artifact. Any fallback to pre-policy code needs
an explicit session-revocation recovery step and verification that old tokens
remain denied. Exercise that recovery only in an isolated fixture before using
the existing production release/incident process. No old-code rollback is
authorized or represented as tested by this preparation checkpoint.

## References

[ASVS 5.0 session management](https://raw.githubusercontent.com/OWASP/ASVS/v5.0.0/5.0/en/0x16-V7-Session-Management.md)
requires documented risk-based lifetime decisions and enforcement. The
[OWASP session-management guidance](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
distinguishes server-enforced idle and absolute expiration. These sources inform
the design; they do not establish product-owner acceptance or a compliance claim.
