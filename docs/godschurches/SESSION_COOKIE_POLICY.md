# Ordinary session cookie policy

Prepared 27 September 2026. Local implementation, release acceptance pending.

HTTPS sign-in issues `__Host-church_platform_session`, with `Secure`, `HttpOnly`,
`SameSite=Lax`, `Path=/`, no `Domain` and the existing 30-day maximum age.
Local HTTP development retains `church_platform_session`. Session token entropy,
hashing, absolute database expiry, credential versions and proof binding stay
unchanged. This change does not introduce an idle-timeout policy.

Password login and Google signup/returning login share the issuer. HTTPS issuance
also expires the old host-only cookie. Explicit logout clears both names and
revokes only the selected current session. Credential changes retain their
accepted no-cookie-write behavior: a delayed response must not erase a later
sign-in. Ordinary reads never promote, rotate or extend a session.

HTTP boundaries and server-rendered readers use the original Cookie header and
the same selector. Repeated recognized names, even with identical values, fail
closed. During compatibility, one cookie of each name is acceptable only when
both contain the same valid canonical token. Different or malformed identities
do not select either account. URL decoding and quoted tokens are not accepted.
Cookie policy depends on the validated account origin; broken email delivery or
an absent mail credential must not change ordinary account selection.

## Bounded compatibility

Publish the new issuer before **29 September 2026, 00:00 UTC**. The parser accepts
the old HTTPS cookie only before **29 October 2026, 00:00 UTC**. This allows every
previously issued session to reach its existing absolute 30-day expiry. Recheck
this bound against actual deployment time immediately before publication. If the
deadline is missed, revise the dates and deterministic boundary tests before
publishing; do not silently truncate existing sessions.

At retirement, the old name is ignored on HTTPS, including beside a valid new
cookie. The local HTTP name is unaffected. Fixed-time parser tests cover both
sides of retirement. Ordinary fictional HTTPS fixtures select the current wire
name at request time; only explicit compatibility tests use the old name.

The compatibility interval is a residual limitation. A sibling domain can still
place a valid legacy token in a previously signed-out browser. An injected
parent-domain legacy cookie can also conflict with a new host cookie and deny
authentication; the application cannot delete another domain's cookie with a
host-only tombstone. Do not describe this interval as complete prevention of
cookie tossing. Existing ambiguous principals continue to fail closed.

## Verification and recovery

The unchanged application baseline reproduced this sibling-cookie behavior in
two fictional HTTPS origins mapped to loopback before implementation. It also
showed actual browser rejection of invalid Domain and narrow-Path host-prefixed
cookies. No production exploitation or victim-token theft was tested or claimed.

Release acceptance requires actual password and Google issuance, browser scope,
legacy continuity, API and HTML/RSC account agreement, same-device logout,
cross-account conflicts, unchanged session-bound Google/authenticator proofs,
and development serialization privacy. Preserve the existing delayed-response
credential checks. Service checks alone are not browser acceptance.

Retain and verify a **prefix-aware fallback artifact** before issuing new cookies
in production. The previous application cannot read prefixed-only sessions and
is not a compatible rollback for signed-in users. Keep the new reader/issuer in
any reviewed forward fix or fallback. Record artifact identity and verification
alongside the named batch's normal migration and protected-recovery gates.
