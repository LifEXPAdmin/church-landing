# Native credential storage and session lifecycle

The native vault is preparation for the canonical request client. The current
fixture app does not call it or accept real credentials. Canonical server
verification, revocation and expected-viewer checks remain the authentication
authority. A stored candidate never establishes an authenticated screen.

## Persistence boundary

`mobile/src/session/credential-vault.ts` owns one serialized queue over injected
marker and secret stores. `mobile/src/platform/secure-credentials.ts` supplies
Expo SecureStore, FileSystem and cryptographic UUIDs. Only this singleton may
write its fixed namespace. Development and staging have distinct application
identifiers, and the secret also binds its exact configured HTTPS origin and
environment. Production configuration is not enabled.

The secret contains one versioned record with owner, installation identifier,
credential nonce, scope and opaque bearer token. It is bounded to 1,024 ASCII
characters and replaces the previous account's record. The cache marker is at
most 256 characters and contains only version, random bindings and phase. It
contains no owner, token, password, profile or post data. No private response cache
or password persistence is added.

Use a fresh Keychain service with `WHEN_UNLOCKED_THIS_DEVICE_ONLY`, no access
group and no biometric requirement. This is a storage choice, not a replacement
for server MFA. Existing Keychain items may survive uninstall; the installation
marker lives in the app cache, which is excluded from ordinary backup. A missing
or evicted marker requires fresh sign-in, even when a secret survives. Never
reconstruct that marker from Keychain. Cache eviction can therefore log the user
out; a future native no-backup file can improve availability after measured need.

Replacement writes and reads back a pending marker, then the secret, then an
active marker. Pending, malformed, foreign, oversized or mismatched records
cannot restore. Restoration rechecks the marker after reading the secret in case
the OS evicted it during that await. Failed replacement never deliberately rolls
back to an older active marker. Logout writes a signed-out marker before deleting
the secret, then reads deletion back.

SDK source inspection matters: SecureStore 57.0.4 ignores iOS deletion status
codes, and its Android write caller ignores the underlying preferences commit
result. FileSystem marker writes also do not promise a cross-store transaction.
Readback detects ordinary inconsistencies; it is same-process evidence, not proof
of power-loss durability. If deletion fails but the marker is invalidated,
`cleanup-pending` means restoration is disabled but secret cleanup remains. If
neither mechanism succeeds, `unconfirmed` keeps this process locked and must not
be displayed as confirmed logout. Canonical remote revocation remains necessary.
Stale replacement outcomes retain their cleanup status instead of hiding failure.

## Required consumer order

1. Before logout, account replacement or leaving the foreground, synchronously
   conceal private UI, clear private in-memory views and invalidate outstanding
   request generations. Cancellation alone does not fence a late response.
2. On local logout, enqueue `clear()` immediately, before remote awaits. Do not
   skip that persisted intent because a newer sign-in attempt begins. Capture the
   old token only for its canonical revocation request; never substitute a new
   session's token when retrying it.
3. Delayed revocation cleanup must call `clear(originalBinding)`, matching owner,
   installation, origin/environment and credential nonce. The same account can
   have a newer credential. The vault's queue prevents an older clear from
   deleting a later committed replacement.
4. Sign-in and restoration retain a generation ticket. Check it after every
   asynchronous boundary and before publishing. Treat `stale`, `unavailable` and
   `locked` outcomes as concealed; carry cleanup warnings through the owning
   session flow. No raw SDK error or secret belongs in a log or user message.
5. Startup and every foreground return stay concealed until the canonical server
   verifies the current candidate for the captured owner and generation. Match
   the canonical response decoder to that original identity. A stored token, a
   clock estimate or network failure cannot establish account access.

These rules are the native integration contract. The vault itself implements no
HTTP transport, refresh token, account policy, authorization or authenticated UI.

## Session controller preparation

`mobile/src/session/session-controller.ts` now consumes that vault and the typed
canonical native client through injected ports. Its public immutable snapshots
contain only phase, local generation, foreground state, verified account fields
and bounded status values. Credentials, installation bindings, passwords and raw
errors are never published. No feed, post or private response cache is added.

Startup and each foreground return read a candidate, verify its captured owner
with the canonical session endpoint and read the server's activity deadline
before revealing an account. Fresh password issuance also verifies the issued
credential and completes checked storage before publication. Every asynchronous
result is fenced by the foreground epoch. Backgrounding synchronously clears the
account, advances the epoch, cancels work and removes the expiry timer.

Server deadlines use conservative elapsed time from before the activity request.
A monotonic clock, snapshot reads and an expiry timer conceal overdue sessions;
device wall-clock changes cannot extend the elapsed budget. Only an explicit
foreground interaction may request activity renewal. Concurrent renewals are
coalesced locally, and no background timer sends renewal requests. A confirmed
session rejection invalidates the exact saved candidate immediately.

Sign-out queues persistent local invalidation before any remote await and clears
the public account immediately. A separate captured client revokes only the old
token. Its late completion cannot clear or replace a newer account, including a
new credential for the same account. Local cleanup and remote confirmation are
reported separately. Unknown issuance or restoration reports remote uncertainty
when no token can be captured. Cancellation converts pending revocation to
uncertainty across foreground transitions. Failed persistent cleanup also keeps
its warning when a lifecycle change invalidates the initiating screen.

The private read composition can report a confirmed canonical session rejection
with its original owner and generation. The same session controller checks that
binding before candidate-bound clearing. A late read cannot sign out a replacement
account or a newer credential for the same account. See
[bounded reading](BOUNDED_READING.md) for the native consumer and retention rules.

At most one detached revocation is retained, with no credential retry queue.
A second rapid logout still clears local state and reports remote uncertainty.
An abandoned save uses its original random credential binding for any delayed
cleanup. The controller never substitutes a newer credential to repair an old
logout, and it cannot revoke a password result lost before its token was received.

The app must bind visibility to active and focused lifecycle state, including
Android blur, and render only the controller's current snapshot. Native privacy
covering for task-switcher snapshots remains a platform acceptance requirement.
No controller has been connected to the fictional `App.tsx` yet. Activation is
also gated on the [strict native transport](NATIVE_TRANSPORT.md), canonical
fixture availability, source compatibility and native-device checks.

## Evidence and remaining acceptance

The pure tests cover bounded replacement, reinstall remnants, malformed records,
interruption before activation, failed activation, storage exceptions and silent
write/delete failures, final activation cancellation with unconfirmed cleanup,
marker eviction during restoration, same-account replacement and delayed logout.
They model storage behavior and cannot certify operating-system persistence.

Controller checks additionally hold restoration, password replies, persistence,
renewal and logout across lifecycle changes; verify no account is revealed before
server and storage confirmation; preserve a newer same-account login after old
logout; and distinguish network uncertainty, local cleanup failure and server
rejection. These use a fictional injected wire, not real native networking.

Before acceptance, run the full sign-in, bounded feed, detail and safe-sign-out
journey on both native platforms against canonical fictional accounts. Exercise
process death at each persistence phase, reinstall, cloud restore/device transfer,
Keychain/Keystore unavailability, background snapshots and return verification,
account replacement, lost logout responses and both stores failing. Inspect the
generated Android cloud-backup and device-transfer exclusions, since SecureStore's
plugin preserves conflicting custom backup rules. Verify the fresh iOS namespace
and accessibility on a device. No native acceptance or release is implied here.

References: [Expo SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/),
[Expo FileSystem](https://docs.expo.dev/versions/latest/sdk/filesystem/),
[Expo Crypto](https://docs.expo.dev/versions/latest/sdk/crypto/),
[Android backup exclusions](https://developer.android.com/identity/data/autobackup),
[Apple filesystem guidance](https://developer.apple.com/documentation/foundation/using-the-file-system-effectively).
