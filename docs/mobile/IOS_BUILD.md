# iPhone build paths

Recorded 7 October 2026. The shared app uses the existing Expo native project
generator and its canonical local modules. Xcode 26.6, build 17F113, provides
iPhoneOS and iPhone Simulator SDK 26.5 on the inspected Mac. Its first-launch
readiness check passes. This tooling observation does not prove a native build.

## Unsigned Simulator build

Reserve the shared machine-build contract. Set `GC_MOBILE_VOLUME_UUID` and
`GC_MOBILE_WORKER` from the private workstation record. Set `DEVELOPER_DIR` to
the inspected full Xcode `Contents/Developer` directory; the launcher does not
change the machine's default developer selection or accept a license.

Provide a compatible Ruby and CocoaPods on `PATH`, installed in task-scoped
external storage if necessary. The build route checks those tools and does not
silently install them or alter the system Ruby. CocoaPods supports explicit
`CP_HOME_DIR` and `CP_CACHE_DIR`; the launcher assigns both inside `.generated`.
Preserve existing global dependency stores and credentials.

The generated Podfile routes React Native and Hermes artifact caches to
`.generated/react-native-cache` through a version-checked local Ruby hook. Their
existing download and checksum logic remains in place; cache-skipping flags are
not used. Expo modules compile from source because the installed precompiled
module hook otherwise clears a global CocoaPods cache. Reinspect these helpers
when updating React Native or Expo. No system home directory is reassigned.

From `mobile/`, with `APP_VARIANT=development` or `staging`:

```sh
node scripts/workspace.mjs prebuild-ios
node scripts/workspace.mjs pods-ios
node scripts/workspace.mjs build-ios
```

Prebuild generates the selected variant. Pod installation updates only that
generated native project. The build refuses a missing or mismatched Pods lock,
wrong app identifier, non-iPhone target, or device/signing selection. It compiles
the Release configuration for a generic iPhone Simulator with signing disabled
and two compiler jobs. Metro uses one worker. Release embeds the JavaScript journey and does not need
a running Metro server. Public source provenance is stamped by the existing
build-identity helper. A modified source state remains explicit.

DerivedData, module caches and package clones stay under
`mobile/.generated/ios/<variant>/`; dependency downloads stay on the same SSD.
The generated app is under `DerivedData/Build/Products/Release-iphonesimulator/`.
These are reusable generated working files, separate from retained source and
private verification receipts. Do not infer download or installed size from
JavaScript bundle size.

A matching Simulator runtime is additionally required to launch the binary.
Check runtime availability and real internal/SSD headroom before downloading or
importing it. Use an explicit SSD download destination and a task-owned device
set. A runtime import may still require Apple's managed system storage; an SSD
download alone does not prove the installed runtime avoids internal storage.
Never move existing simulator state or use an internal fallback to bypass a
storage failure. Record the actual runtime and device for the acceptance run.

## Physical iPhone and distribution

Development and staging use separate bundle identifiers and app-link schemes.
The initial generated target has device family 1 and minimum iOS 16.4. This
minimum is provisional until actual native compatibility and device evidence.
The Simulator launcher deliberately cannot build or sign a device package.

For an authorized physical-device test, open the generated workspace using the
inspected Xcode, select the agreed development team and a consenting trusted
iPhone, and record the resulting device-specific build and provisioning state.
Use SSD DerivedData. Team identity, device trust, signing credentials and any
enrollment cost remain owner-controlled prerequisites. Do not substitute a
Simulator run for this acceptance. Production identifiers and configuration
remain disabled; no archive, TestFlight upload or store submission is implied.

## Acceptance still required

Compile the native JSON module and secure-store dependencies, launch the
fictional sign-in/feed/detail/retry/sign-out journey, and verify safe areas,
text scaling, lifecycle concealment, secure-store cleanup and app-link return.
Then separately verify the real journey against an accepted nonproduction
HTTPS endpoint with fictional accounts. Source checks, Hermes exports, native
compilation, Simulator behavior and physical-device acceptance are distinct.
Existing dependency-security and release gates remain in force.
