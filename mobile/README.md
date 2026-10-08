# Shared mobile workspace

The `mobile/` package is an isolated React Native and Expo development spike.
It has its own manifest, lockfile, dependencies and generated output. The Next.js
root keeps its existing manifest, lockfile and deployment configuration. Root
TypeScript, ESLint and Vercel CLI upload exclude this package. No repository-wide
workspace conversion is needed. The existing Git deployment switch remains off.

This is one shared mobile codebase for iPhone and Android. Platform workers use
their own worktrees and consume committed shared changes. The website's canonical
shared-core package, native account adapters and typed client must be consumed
through their verified handoffs before real account integration.

## Run on the prepared Mac

Use Node 22.15 or newer. The source test resolver requires Node's `registerHooks`.
Set `GC_MOBILE_VOLUME_UUID` to the current UUID from the
private storage policy and `GC_MOBILE_WORKER` to your registered worker. Do not
put private device identifiers or worker/session records in this repository.

From `mobile/`:

```sh
node scripts/workspace.mjs inspect
node scripts/workspace.mjs install
node scripts/workspace.mjs compatibility
node scripts/workspace.mjs config
node scripts/workspace.mjs fixture
node scripts/workspace.mjs dev
node scripts/workspace.mjs typecheck
node scripts/workspace.mjs test
npm run lint
npm run check:boundary
node scripts/workspace.mjs export
```

The launcher resolves the mounted volume by UUID, verifies writable external
storage and at least 4 GiB free, checks the actual project path, and performs a
small reversible write/read proof. It rejects missing storage without making an
internal substitute. Dependencies stay in `mobile/node_modules`; npm cache,
temporary files, Expo state and exports stay in `mobile/.generated`. All these
paths are ignored by Git. Reserve the shared heavy-job contract before install,
fixture/dev runtime or export. The launcher checks that reservation against this
worktree. Only one worker owns heavy work at a time.

The pinned Expo CLI reads its shell-only `__UNSAFE_EXPO_HOME_DIRECTORY` setting;
the launcher points it at the task's new `.generated/expo-home` directory.
Existing Expo account state is preserved. Recheck the installed CLI's actual
settings path when changing SDK versions; `EXPO_HOME` is not honored by SDK 57.

The original HTTP spike fixture remains available on loopback port 4084 for
transport investigation. The current app uses an in-memory fictional wire and
does not need that server. Metro uses port 8084. Inspect
port ownership before starting them. Do not terminate an existing foreign
listener. iOS Simulator reads `127.0.0.1:4084`; Android Emulator reads its host
alias `10.0.2.2:4084`. Physical-device fixture networking is not configured.
A native development build is required for the secure-store and custom-scheme
probes. Expo Go is not acceptance evidence.

## Variants and native build paths

`APP_VARIANT=development` is the default. Development uses
`com.godschurches.mobile.dev` and `godschurches-dev`; staging uses
`com.godschurches.mobile.staging` and `godschurches-staging`.
These are reversible local identifiers, not registered store identities.
Variant slugs are also distinct, so Expo Dev Client's generated `exp+` schemes
cannot collide when development and staging are installed together.
Production configuration fails deliberately until the owner/seller identifiers,
credential scope and release configuration are settled.

Both variants block broad Android storage and media-library permissions inherited
from dependencies. See [Android permission preparation](../docs/mobile/ANDROID_PERMISSIONS.md).
Rebuild native binaries to apply the manifest removal rules; actual merged
manifests and installed permission state still need verification.

The local fixture network plugin enables cleartext access only in these
non-production configurations. The JavaScript fixture reader accepts only the
two exact loopback origins above, sends no cookies or credentials, rejects
redirects, and has an eight-second timeout. It cannot access production.

Generate the iOS project with `node scripts/workspace.mjs prebuild-ios` after
reserving the heavy-job contract. This uses `--no-install --no-clean`, keeps the
project on the SSD and leaves CocoaPods/native compilation for the inspected
Xcode route. The first generated target is iPhone-only with an iOS 16.4 minimum.

After preparing an inspected full Xcode and CocoaPods, use `pods-ios` and
`build-ios` through the same workspace launcher. The build embeds the fictional
journey in an unsigned Release Simulator app, with two compiler jobs and
task-scoped caches and DerivedData. See [iPhone build paths](../docs/mobile/IOS_BUILD.md)
for setup, variant checks and the separate physical-device route.

Generated `ios/` and `android/` live under `mobile/` on the SSD. A later native
build must use task-scoped DerivedData, Gradle caches and device storage after
the platform environment check. Do not move existing Xcode, Android, home or
credential directories as an incidental setup change. Full Xcode was absent at
discovery; Xcode 26.6 and iPhone SDK 26.5 are now verified. Android tooling is
owned by the Android lane. Native compilation, simulator/device launch and
installed-size results require their own receipts.

## Current fictional journey and acceptance

The preview explicitly identifies fictional data and uses the canonical native
client, credential-vault state machine, session authority, navigation and bounded
reader. `src/spike/native-fixture.ts` supplies strict canonical response shapes
through a fictional in-memory wire and in-memory stores. It contains no network
fallback or persistent credential activation. Only its fixed demo input can
issue a fictional session. The app presents no password field in fixture mode.

Continue as a demo member, read two finite pages, open a fresh post detail,
deliberately reveal a content note, return to the current page, try an interrupted
or empty read, retry, and sign out. Pages replace each other. Content-note,
repost, account-generation, deadline and cleanup behavior now runs through the
same components and state owners prepared for real native integration. This is
still a fictional response exercise, not server authorization or native transport
acceptance. Original spike sources/tests remain as their historical receipt.

The secure-store probe writes, reads and deletes one disposable constant using
device-only unlocked access. It never stores member credentials. The local app
link opens a fixture detail route and reports success only after receiving the
link. It is not a universal-link or OAuth implementation.

Remaining acceptance is explicit: both native development builds must launch,
complete the fictional preview, then use the reviewed native wire/vault against
the accepted staging API for the real journey. Native secure-store cleanup,
app-link round trips, download/installed-size baselines and device accessibility
remain open. JavaScript tests, typechecking, exports, source review and web
preview do not satisfy them. Android focus starts unknown. The local native
visibility module supplies an initial snapshot and each foreground recheck,
fenced against newer focus/blur events. Its native compilation and device checks
remain open. See [Native first journey](../docs/mobile/NATIVE_JOURNEY.md).

The initial dependency audit found transitive advisories in development tooling.
The exact lock and audit are retained for triage. Do not force npm's proposed
framework downgrades or treat successful exports as dependency-security approval.

## Replaceable native presentation

`src/ui/theme.tsx` consumes the canonical shared-core semantic tokens. It resolves
light, dark and live device appearance without reading browser cookies or changing
account settings. The locked `expo-system-ui` package and config plugin preserve
automatic Android appearance. Status-bar contrast follows the resolved theme.
The development preview offers temporary appearance, reading-size and additional
reduced-motion choices. They live only in memory until the app restarts. Its
sample text is bounded to 1,000 characters and is never persisted or transmitted.

`Button`, `Text`, `Input`, `Card` and `Screen` keep feature logic outside visual
components. System fonts, uncapped OS text scaling, wrapping, intrinsic height
and minimum 48-unit control targets support large text. Reader sizing changes
only reading content. Android selection highlights use the readable selected
surface independently of cursor and handle colors. The screen observes safe
areas, obscures content in the background and enables iOS keyboard insets.

Reduced motion starts conservatively enabled until the native query resolves.
Device events and foreground rechecks supersede older queries; unmount removes
subscriptions and ignores pending results. Either device or local reduced motion
sets shared motion durations to zero. The current fixture uses no animated
transitions. Native motion consumers must also cancel any animation in progress.

The mobile test command uses the repository's existing Node source resolver for
extensionless shared-core imports and runs files serially. Pure mapping and
lifecycle tests, typechecking and exports establish source/bundle compatibility.
Native launch, light/dark/system changes, large-text reflow, keyboard focus and
selection, TalkBack/VoiceOver, navigation-bar contrast and device lifecycle remain
separate acceptance checks. These controls do not activate real credentials,
change API behavior or satisfy release acceptance.

## Source verification and CI

The scoped native lint configuration reuses the website's existing locked
analysis tools. See [Mobile verification](../docs/mobile/VERIFICATION.md) for
separate source checks, package-security gates and manually selected exports.
Native builds, hosted CI, staging and device acceptance remain distinct.

The development preview also offers a [local diagnostic check](../docs/mobile/DIAGNOSTICS.md).
It keeps one bounded report of public build and platform metadata in memory,
with explicit clear and no upload. The guarded launcher stamps the actual source
base and state; non-development exports exclude this diagnostic UI. Native crash
capture and device performance measurements remain separate work.

[Native compatibility](../docs/mobile/COMPATIBILITY.md) records update and feature
unavailability states, explicit recovery and separate server/JS/native rollback
boundaries. OTA remains disabled and actual old/new native acceptance stays open.
