# Local Android build

Use the existing shared mobile app and its guarded `prebuild-android` action.
After reserving the machine-build contract, set the inspected `ANDROID_HOME`
and `JAVA_HOME` and run from the mobile directory:

```sh
node scripts/workspace.mjs prebuild-android
node scripts/android-build.mjs
```

The Android launcher reuses the shared storage verifier and checks the build
reservation against this exact worktree. It accepts development or staging only,
requires the fictional journey configuration, and rejects arbitrary Gradle tasks.
Keep the SDK and JDK on the verified task storage volume. A no-space SDK alias
may point to that same verified location; it never authorizes a storage fallback.

The inspected toolchain is JDK 17, SDK and build-tools 36, NDK 27.1.12297006 and
CMake 3.30.5. The CMake selection matches the pinned React Native source and is
passed through Expo's supported Android CMake override. Existing SDK agreements
and installation are prerequisites; this command accepts no license agreements.

The local Release configuration embeds JavaScript for use without Metro, targets
only arm64-v8a and requires the generated debug signing key. This is a development
APK, not a signed store candidate. Before compilation, the Gradle init script
rejects a stale package variant, a different signing configuration or a changed
SDK matrix. Regenerate the selected native variant when changing APP_VARIANT.

Gradle uses one worker, no parallel projects and no persistent daemon. Kotlin
compiles in the same process; Metro gets one worker. CMake compilation and linking
share a single-slot Ninja pool, including when Gradle invokes Ninja directly. Task-scoped
Gradle, Android user, temporary, Expo and npm caches stay on the verified volume.
The shared heavy-job lock also excludes another launcher in this worktree.

The output is `mobile/android/app/build/outputs/apk/release/app-release.apk`.
Record its source, hash, package identity, permissions and size before installing
on the owned emulator. Verify the fictional reading journey, system Back,
secure-storage probe, links and lifecycle on that binary. Compilation alone
does not establish those results, real staging authorization, physical-device
acceptance, accessibility or Play distribution. Release identifiers, signing
ownership and the production configuration remain separate owner gates.

## Guarded application startup

The Android checkout consumes the shared application owner. An absent application
mode or `EXPO_PUBLIC_APPLICATION_MODE=fixture` selects the fictional journey.
The accepted native configuration is currently `null`, so `native` and invalid
modes show an unavailable screen without opening a credential form or binding
native transport and storage. Configuration cannot provide an arbitrary endpoint
through an environment variable. The shared owner disposes its own runtime on
cleanup, and Android keyboard-first Back applies to either supported owner.

Metro separates cached transforms by application mode and resolved selection.
The existing Android build launcher still requires the fictional configuration;
this source integration does not enable native-mode APK generation. Real native
acceptance requires the canonical nonproduction HTTPS receipt, reviewed launcher
admission and newly generated or inspected manifests without fixture networking
exceptions, followed by the full Android sign-in and sign-out journey.

## Guarded startup native checkpoint

On 8 October 2026, clean source `5f0915d` produced a development arm64 APK
of 26,455,386 bytes, SHA256
`9fb3c52ccc657571578aa4a1f90ac0e2e33adc52267e952db91905b648e23d0b`.
The installed APK matched that hash. The regenerated bundle matched its packaged
copy, and 28 mobile source-map entries matched the checkout. Release bundling
removes the development diagnostic controls, including their commit display.

On the owned API 36 emulator, guest startup, fictional sign-in, feed, post,
system Back, warm and cold custom-scheme links, sign-out and subsequent sign-in
passed. Home concealment cleared the previous destination; foreground recovery
rechecked access and opened the default feed. A fresh process started a new
memory-only fixture. The deferred native secure-storage probe passed write,
read and removal. These are bounded fictional native observations, not real
HTTPS account, physical-device, gesture-animation or accessibility acceptance.
The owned emulator and ADB server were stopped after verification.

## Password form native checkpoint

On 8 October 2026, canonical shared source `2400d720` supplied the password form,
application owner and current dependency graph. Its development APK reproduced
focused inputs hidden by the Android keyboard. The Android-only screen wrapper
repair produced an APK of 26,461,186 bytes, SHA256
`a28d0148cd1b3147b580bca6be1a48c7f529b13891b9b97568d6527f708813d0`.
The installed APK matched. Its 1,409,976-byte bundle matched the packaged copy,
and all 33 authored mobile source-map entries matched the checkout. The changed
screen source has SHA256
`70aa016da1f00055af0405ee7d39b7ec6879a1689e21aa85a07a6a7c16151c6e`.
Manifest, native code and permissions were identical to the baseline APK; no
broad media or storage permission was added. Generated local module build
directories are ignored again.

The baseline passed 39 focused password, fixture, session-visibility and Android
Back checks. After the layout repair, typecheck, focused lint, the 42-module
boundary check and native compilation passed. The rebuild took 17 seconds with
10 tasks executed and 606 up to date. This timing describes one incremental
build, not a general performance measurement.

Actual API 36 emulator observations and their limits are recorded in
[Android navigation](ANDROID_NAVIGATION.md#keyboard-and-navigation-checkpoint).
All inputs were fictional. Real nonproduction HTTPS acceptance, older supported
Android versions, physical devices, accessibility services, predictive animation,
signing and distribution remain open. The canonical dependency checkpoint reduced
the mobile audit to four high findings, which remain a failing gate; this layout
change does not repair or waive that gate.

## JavaScript interruption checkpoint

On 8 October 2026, the native privacy source `a73860a3` was verified with its
unchanged development APK, SHA256
`ddf901c9db76943a76877a0fa07e1d30cd5c6ac538ce91bc6de5a030cbec5b94`.
A separate private test-only instrumentation APK used the same local debug signer.
It attached without restarting the already prepared fictional app. No application
rebuild, JavaScript hook, debugger or whole-process pause was used.

Two independent cases held the actual React Native `mqt_v_js` queue for 15,000
milliseconds: a revealed fictional church prayer, and a focused, intentionally
visible fictional password with the keyboard open. A queued JavaScript sentinel
could not run during either hold. Each case recorded 37 native main-thread
heartbeats, actual Activity pause/resume and window focus loss/return while
JavaScript remained blocked. The application process stayed the same within each
case. The test latch, watchdog and native-main waits were bounded.

On return, the generic native cover remained visible and descendant accessibility
and focus stayed blocked before the JavaScript queue resumed. Each case recorded
34 covered, focused native heartbeats during that interval; captured frames show
the generic cover and no old content or keyboard. After release, the sentinel ran
and the cover cleared following the shared session check. The prayer returned to
the freshly checked feed without its old reveal. The sign-in form closed; opening
it again showed empty inputs and a masked password field.

These observations resolve the stalled-JavaScript gate only for this API 36
fictional first journey. Reading native accessibility flags is not physical
TalkBack acceptance. Exact marker detach/reattach, older Android, additional
windows, real staging sessions, broader process/battery behavior, dependency
security, signing and store acceptance remain open. The test package was removed,
the original emulator settings restored and owned runtimes stopped. The installed
target APK still matched the retained binary after the test.

## Source verification and dependency installation

The Android checkout consumes the canonical root security and mobile CI tooling.
On source `5f0915d`, hosted source-security and portable-contract checks passed.
Mobile lint, types, import boundaries and 223 tests passed; three macOS-only tests
were skipped on Linux. The mobile package audit remains a failing gate with 22
dependency findings (15 high and seven moderate). Registry signatures and provenance checks
ran despite that audit failure. This is source verification, not a new native
build or a release approval. The separate native checkpoint above records the
actual local build and emulator observations.

An existing root `node_modules` directory does not prove the current root lockfile
has been installed. Recreate task-owned root dependencies from the current lock
under the machine-build reservation before running the embedded toolchain patches
or root build. Preserve any older dependency graph still needed by another retained
source checkpoint. The mobile lockfile is separate and was unchanged by this CI
consumption. Do not rerun an unchanged Android binary solely for a CI-only update.
For the guarded startup checkpoint, a fresh root install used the matching lock
with lifecycle scripts disabled, followed by the canonical hash-guarded patches.
The older dependency graph was retained for its original source checkpoint.
