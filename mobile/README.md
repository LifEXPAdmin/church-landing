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

The fictional feed listens on loopback port 4084. Metro uses port 8084. Inspect
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

The local fixture network plugin enables cleartext access only in these
non-production configurations. The JavaScript fixture reader accepts only the
two exact loopback origins above, sends no cookies or credentials, rejects
redirects, and has an eight-second timeout. It cannot access production.

Generate the iOS project with `node scripts/workspace.mjs prebuild-ios` after
reserving the heavy-job contract. This uses `--no-install --no-clean`, keeps the
project on the SSD and leaves CocoaPods/native compilation for the inspected
Xcode route. The first generated target is iPhone-only with an iOS 16.4 minimum.

Generated `ios/` and `android/` live under `mobile/` on the SSD. A later native
build must use task-scoped DerivedData, Gradle caches and device storage after
the platform environment check. Do not move existing Xcode, Android, home or
credential directories as an incidental setup change. Full Xcode was absent at
discovery. Android tooling is owned by the Android lane. No native binary,
simulator/device launch or installed-size result is claimed by this checkpoint.

## Spike behavior and acceptance

The preview explicitly identifies fictional data. Continue as a demo member,
read a finite feed, open a post, deliberately reveal a content note, return,
simulate a failed read, retry, and sign out. Reading state is held in memory.
Sign-out invalidates earlier request generations, including re-entry as the same
demo member. Backgrounding obscures the fixture screen. This is not the real
session lifecycle or a substitute for server authorization.

The secure-store probe writes, reads and deletes one disposable constant using
device-only unlocked access. It never stores member credentials. The local app
link opens a fixture detail route and reports success only after receiving the
link. It is not a universal-link or OAuth implementation.

The remaining spike acceptance is explicit: both native development builds must
launch, read the local fixture API, complete navigation/retry/sign-out, pass
secure-store cleanup and app-link round trips, and record release-style download
and installed-size baselines. JavaScript tests, typechecking, bundle export,
source review and web preview do not satisfy those native checks.

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
