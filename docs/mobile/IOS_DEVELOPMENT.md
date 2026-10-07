# iPhone development route

Prepared 7 October 2026 for the provisional Expo 57 application. This document
describes local build routes; no native build or signing success is claimed.

The first installed workspace passed Expo compatibility and TypeScript checks,
nine fixture/configuration tests and iPhone/Android Hermes bundle exports. The
generated iOS project has the `GodsChurchesDev` scheme, iPhone device family,
`com.godschurches.mobile.dev` identifier and iOS 16.4 deployment target. Its
entitlements are empty, with only development local-network configuration and
distinct app/Dev Client URL schemes. CocoaPods and native compilation remain
unrun. These are generated-project checks, not Simulator/device acceptance.

## Toolchain and support floor

The inspected host runs macOS 26.3 on Apple silicon. Node is 22.23.2 and npm is
10.9.8. Command Line Tools are selected, but full Xcode, an iOS Simulator runtime
and CocoaPods were not available at this checkpoint. Internal storage is
constrained; source, package downloads and generated work use the verified SSD.

[Expo's SDK matrix](https://docs.expo.dev/versions/latest/) specifies Node 22.13+,
React Native 0.86, iOS 16.4+ and Xcode 26.4+ for SDK 57.
[Apple's Xcode requirements](https://developer.apple.com/xcode/system-requirements)
list Xcode 26.4.1 as compatible with macOS 26.2 through 26.x. Verify the available
signed Xcode release and its requirements again before installation. Do not
upgrade macOS or select an incompatible latest Xcode incidentally.

Use iOS 16.4 as the provisional minimum supported iPhone OS, subject to generated
project inspection and actual minimum/current OS device evidence. Defer iPad
polish; `supportsTablet` is false. No tested-device compatibility claim exists yet.

## Variants, identity and secrets

| Variant | Local bundle ID | App scheme | Distribution |
| --- | --- | --- | --- |
| Development | `com.godschurches.mobile.dev` | `godschurches-dev` | Simulator or authorized development device |
| Staging | `com.godschurches.mobile.staging` | `godschurches-staging` | Separately authorized staging build |
| Production | Owner decision pending | Owner decision pending | Configuration rejects it until release prerequisites are accepted |

The IDs are reversible local choices, not registered App Store identities.
`app.config.js` separates names and schemes and rejects all other variants.
The fixture configuration has no push, associated-domain, OAuth or shared-keychain
entitlements. Do not enable those capabilities without their canonical receipt
and platform prerequisites. Signing certificates, provisioning profiles and
Apple credentials stay outside Git and app configuration.

SecureStore's fixture probe uses a disposable constant and device-only unlocked
access. It writes, reads and deletes the value. Real bearer credentials require
the canonical session adapter, account/generation fencing and tested deletion;
they must never enter URLs, logs, ordinary preferences or exported reports.
See [SecureStore behavior](https://docs.expo.dev/versions/latest/sdk/securestore/),
including iOS keychain persistence across reinstalls.

## Simulator route

1. Verify the prepared SSD's current mount, UUID, write access and free space.
   Inspect the existing Xcode/Simulator setup before adding tooling. Keep any new
   large download and extracted application in a recorded task-scoped SSD path;
   do not relocate existing applications or device data.
2. Use an official Xcode version compatible with the host and SDK. Complete its
   license, first-launch components and iOS runtime through the appropriate local
   setup. Set `DEVELOPER_DIR` per command to its actual `Contents/Developer` path
   rather than changing another worker's global selection.
3. Reserve the machine-build contract, run the guarded package install and
   compatibility/type checks, and inspect the generated native config. Generate
   the iOS project on the SSD with the guarded `prebuild-ios` action. Provision CocoaPods through a task-scoped tool/cache
   route before resolving pods; do not install into an unexamined system Ruby.
4. Read the generated workspace and schemes with `xcodebuild -list`. Build the
   discovered application scheme for a supported Simulator destination, passing
   an explicit task-scoped SSD `-derivedDataPath`. Do not guess a scheme name.
   Confirm generated deployment target, entitlements and variant bundle ID.
5. Use a task-owned Simulator device set on the SSD where supported. Install and
   launch the actual generated development app. Inspect port ownership, then run
   the guarded fixture server and Metro from the same worktree.

The fictional service binds `127.0.0.1:4084`; Metro uses port 8084. The custom
non-production network plugin permits local fixture traffic. Both permissions and
the exact URL allowlist must stay fixture-only. Replacing a JavaScript URL with a
production host is not a supported integration route.

## Physical-device route

A supported iPhone needs its own inspected development setup: cable/network
pairing, trust, Developer Mode where required, a confirmed development team and
the correct provisioning profile. These are separate from App Store membership,
seller identity and distribution signing. Reuse an existing authorized setup;
do not purchase membership, accept agreements or register production identities
as an incidental test step.

The current loopback fixture origins cannot serve a physical iPhone. Before a
device run, prepare an explicitly scoped fictional HTTPS fixture or the canonical
authorized staging adapter and its exact origin. Do not broaden the loopback
allowlist, expose member data or disable TLS to make a device reach the service.
Build for the inspected device and variant, using SSD DerivedData and preserving
signing secrets. Record the installed build and its actual OS/device behavior.

## Acceptance receipt

Record the full source and lockfile revision, Xcode/SDK versions, variant and
bundle ID, generated native configuration, build command/result, installed build
identity and fixture identity. On Simulator and an authorized physical iPhone,
check launch, feed/detail/back, failed-read retry, sign-out state removal,
background obscuring, secure-store cleanup, cold/warm app links, VoiceOver,
large text and supported orientation. Keep minimum-OS evidence separate from a
newest-runtime success. Measure compressed delivery and installed size from real
native artifacts. JavaScript bundle sizes are a different measurement.

The next native action is the compatible Xcode/runtime setup, followed by the
first generated iOS project and Simulator build. Store distribution remains
gated by the existing owner task and release process.
