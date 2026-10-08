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

## Source verification and dependency installation

The Android checkout consumes the canonical root security and mobile CI tooling.
On source `f907cb2`, hosted source-security and portable-contract checks passed.
Mobile lint, types, import boundaries and 210 tests passed; three macOS-only tests
were skipped on Linux. The mobile package audit remains a failing gate with 22
dependency findings (15 high and seven moderate). Registry signatures and provenance checks
ran despite that audit failure. This is source verification, not a new native
build or a release approval.

An existing root `node_modules` directory does not prove the current root lockfile
has been installed. Recreate task-owned root dependencies from the current lock
under the machine-build reservation before running the embedded toolchain patches
or root build. Preserve any older dependency graph still needed by another retained
source checkpoint. The mobile lockfile is separate and was unchanged by this CI
consumption. Do not rerun an unchanged Android binary solely for a CI-only update.
