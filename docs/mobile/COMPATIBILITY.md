# Native compatibility and rollback

The shared native client consumes the canonical v1 protocol. The transport sends
`X-API-Version: 1` to the fixed `/api/platform/v1` routes and requires v1 response
metadata for success and typed failures. App build/source identifiers describe
the installed source; they grant no authority and do not select another protocol.
There is no configurable version fallback, invented minimum binary version,
automatic password replay or server-policy parser in the app.

The server compatibility receipt owns endpoint admission, its disable list and
old-decoder acceptance. Native consumers must keep availability separate from
authentication. A disabled feature does not prove an account is invalid. Only a
confirmed current canonical `401/unauthenticated` or `401/account_changed`
rejection invalidates the corresponding saved credential candidate.

## First-journey consumer behavior

| Server outcome | Native result |
| --- | --- |
| Confirmed `426/unsupported_version` | Explicit update-required state during sign-in, restoration, activity and content reads. No automatic retry or version downgrade. |
| Confirmed `503/feature_unavailable` during sign-in | Service-unavailable message without suggesting the password is wrong. No credential issuance or replay is inferred. |
| Unavailable feed/post capability | Feature-unavailable state; no content request is dispatched. |
| Content paused after capability discovery | Previous content is removed. Session activity and sign-out remain independently usable. A member can explicitly check availability again. |
| Response missing a valid v1 header or envelope | Unconfirmed failure. A status number alone cannot manufacture a trusted update or credential denial. |
| Additive core response fields or unknown capability | Known fields are decoded and bounded; extras are discarded. An unknown capability cannot activate an unimplemented screen. |

Restoration/activity compatibility errors conceal the account and preserve its
saved candidate for a fresh explicit verification. Content errors retain no
previous body. Re-enabling an operation allows an explicit retry of the same
bounded read. No error retry loop renews activity, and no update notice clears
the vault, drafts or files. Password forms remain ephemeral. Logout keeps its
separate local-cleanup and server-revocation evidence.

## Server, JavaScript and native changes

Backwards-compatible server preparation comes before client-visible rollout.
Ordinary feature rollout then follows iPhone, website and Android acceptance.
Server pause/rollback must preserve canonical authorization and current safe
projections. It must not restore an older privacy defect for compatibility.
Current transport/session activity remains subject to normal authorization;
feature admission is never an authorization substitute.

`updates.enabled` remains false. There are no OTA channels, signing keys, update
provider or rollback promises in this preparation. A changed native module,
entitlement or dependency needs a rebuilt and identified native binary. An
exported JavaScript bundle does not install such a change in an old app.
An older Android binary missing the visibility module stays concealed until
rebuilt, as described in [Native first journey](NATIVE_JOURNEY.md).

If OTA is selected later, accept explicit runtime compatibility, signed delivery,
staged channels and tested rollback before enabling it. Store signing, supported
installed-version windows and release ownership remain separate gates. Do not
implement a store redirect or claim an available update without its real target.

## Evidence boundaries

Source tests exercise typed v1 failures, maintenance after capability discovery,
protected activity/logout, candidate retention, explicit re-enable/retry,
additive field stripping and unchanged private-state fences. Their synthetic wire
does not recreate server policy or prove a deployed endpoint.

Native acceptance still needs identified old/new binaries against accepted
staging: startup, sign-in, finite feed/detail, pause, re-enable, account change,
logout, upgrade and downgrade where supported. Check actual credential-store
behavior and absence of stale private content without requiring destructive
reinstallation. Reuse the server's recorded HTTPS/old-decoder receipt, but keep
native and combined deployment evidence distinct from it and from JS exports.
