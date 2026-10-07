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

## Evidence and remaining acceptance

The pure tests cover bounded replacement, reinstall remnants, malformed records,
interruption before activation, failed activation, storage exceptions and silent
write/delete failures, final activation cancellation with unconfirmed cleanup,
marker eviction during restoration, same-account replacement and delayed logout.
They model storage behavior and cannot certify operating-system persistence.

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
