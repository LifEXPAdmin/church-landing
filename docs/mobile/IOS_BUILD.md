# iPhone build paths

Recorded 7 October 2026. The shared app uses the existing Expo native project
generator and its canonical local modules. Xcode 26.6, build 17F113, provides
iPhoneOS and iPhone Simulator SDK 26.5 on the original Mac mini. Its first-launch
readiness check passes. This tooling observation does not prove a native build.

## Unsigned Simulator build

Reserve the shared machine-build contract. Set `GC_MOBILE_VOLUME_UUID` and
`GC_MOBILE_WORKER` from the private workstation record. Set `DEVELOPER_DIR` to
the inspected full Xcode `Contents/Developer` directory; the launcher does not
change the machine's default developer selection or accept a license.

A receiving Mac uses its own verified tooling and storage receipt. The optional
private `GC_MOBILE_HOST_PROFILE` binds that host, its writable internal APFS
volume and exact workspace with at least 32 GiB free. It must be selected
explicitly; the original external-SSD mode remains unchanged. See the
[workspace guide](../../mobile/README.md#another-inspected-mac). A missing full
Xcode installation prevents native compilation even if simulator bundle files
remain on disk. Dependency and project preparation do not establish SDK readiness.

Provide a compatible Ruby and CocoaPods on `PATH`, installed in task-scoped
verified task storage if necessary. The build route checks those tools and does not
silently install them or alter the system Ruby. CocoaPods supports explicit
`CP_HOME_DIR` and `CP_CACHE_DIR`; the launcher assigns both inside `.generated`.
Preserve existing global dependency stores and credentials.

The generated Podfile routes React Native and Hermes artifact caches to
`.generated/react-native-cache` through a version-checked local Ruby hook. Their
existing download and checksum logic remains in place; cache-skipping flags are
not used. Expo modules compile from source because the installed precompiled
module hook otherwise clears a global CocoaPods cache. Reinspect these helpers
when updating React Native or Expo. No system home directory is reassigned.

ExpoModulesJSI 57.1.1 starts a nested Swift package build with a cleared
environment, which otherwise loses the unsigned Simulator setting. After target
validation, the launcher adapts that installed helper using its exact inspected
source hash and package version. The nested build also disables signing, uses
two jobs, forwards the task temporary directory and keeps its caches beside its
own task-local DerivedData. Its existing source hashing and artifact checks stay
in place. The adapted helper rejects other build modes before writing anything;
reinstall locked dependencies before using that checkout for another build route.
Unexpected or partially changed helper source fails closed for reinspection.

The app opts into Expo 57's scene lifecycle through the pinned
`expo-build-properties` plugin. This is required to launch an app built with
the iOS 27 SDK. Prebuild declares `EXExpoAppSceneDelegate`, disables multiple
scenes and makes the app delegate provide its React Native factory. Expo owns
window creation and forwards lifecycle and link events; the app does not add
a replacement delegate. The local privacy module subscribes through Expo's
existing app-delegate subscriber API and consumes its forwarded lifecycle.
See [Expo's SDK 57 migration guidance](https://github.com/expo/fyi/blob/main/ios-scene-lifecycle.md#staying-on-sdk-57-with-xcode-27).

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
`mobile/.generated/ios/<variant>/`; dependency downloads stay on the same verified volume.
The generated app is under `DerivedData/Build/Products/Release-iphonesimulator/`.
These are reusable generated working files, separate from retained source and
private verification receipts. Do not infer download or installed size from
JavaScript bundle size.

The unsigned Simulator app also needs a simulated application identity for
Keychain. The launcher writes an app-scoped property list and uses Apple's
`derq` encoder to produce its matching DER form. Xcode's
`LD_ENTITLEMENTS_SECTION` and `LD_ENTITLEMENTS_SECTION_DER` link these into the
Simulator executable. Target-name indirection gives only the selected app its
identity; dependency targets resolve empty sections. Both the application
identifier and sole Keychain group match the development or staging bundle.
Target validation rejects missing or mismatched section paths before compilation.
Fresh temporary files and atomic replacement preserve any outside file referenced
by a stale generated output link.
See [Swift Build's Simulator linker specification](https://github.com/swiftlang/swift-build/blob/main/Sources/SWBApplePlatform/Specs/Embedded-Simulator.xcspec).

These simulated entitlements are separate from a device provisioning profile.
Do not place restricted Keychain entitlements into an ad-hoc macOS code signature:
that experiment was rejected before app launch. The guarded build keeps signing
disabled and uses the Simulator's linker representation without changing
Keychain accessibility or application storage policy.

A matching Simulator runtime is additionally required to launch the binary.
Check runtime availability and the selected volume's headroom before downloading or
importing it. Use an explicit verified task download destination and a task-owned device
set where supported. Xcode 27's Device Hub uses Apple's default set for its GUI.
For that route, inspect the managed set's actual volume and headroom, create one
distinct task-owned device and address it by its recorded identifier. Preserve
all existing devices. A runtime import may still require Apple's managed system storage; an SSD
download alone does not prove where the installed runtime is stored.
Never move existing simulator state or use an unselected disk to bypass a
storage failure. Record the actual runtime and device for the acceptance run.

## Physical iPhone and distribution

Development and staging use separate bundle identifiers and app-link schemes.
The initial generated target has device family 1 and minimum iOS 16.4. This
minimum is provisional until actual native compatibility and device evidence.
The Simulator launcher deliberately cannot build or sign a device package.

For an authorized physical-device test, open the generated workspace using the
inspected Xcode, select the agreed development team and a consenting trusted
iPhone, and record the resulting device-specific build and provisioning state.
Use task-scoped DerivedData. Team identity, device trust, signing credentials and any
enrollment cost remain owner-controlled prerequisites. Do not substitute a
Simulator run for this acceptance. Production identifiers and configuration
remain disabled; no archive, TestFlight upload or store submission is implied.

## Acceptance still required

Receiving-host checkpoint, 8 October 2026: the explicit internal host profile
passed inspection and eight storage regression tests. The complete mobile suite
passed all 186 tests under Node 24.20.0, alongside lint, types, boundary,
compatibility, authored-copy and source-security checks. Locked root and mobile
dependency installation preserved both manifests and lockfiles. Fresh development
prebuild generated the expected bundle identifier, iPhone-only target and scoped
cache hook. Its output remains ignored by Git.

Task-local Ruby 3.4.11 and CocoaPods 1.17.0 were then built and verified, including
Ruby's OpenSSL, YAML and compression extensions, the locked gem bundle and its
isolated `pod` wrapper. Downloaded source archives were checked before extraction.
Their exact versions, checksum provenance, commands, logs and lockfile remain in
the private toolchain receipt. Existing system Ruby and developer selection were
preserved.

The owner subsequently installed Xcode 27.0, build 27A266a. Its first-launch
check and iPhone Simulator SDK lookup passed, and the iOS 27.0 runtime became
available. Task-local CocoaPods installed 99 pods successfully. The first native
build exposed the nested ExpoModulesJSI signing issue described above. Its repair
passed a complete unsigned Release build for arm64 and x86_64. Actual iOS 27
launch then reproduced UIKit's missing scene lifecycle assertion, leading to the
supported scene opt-in above. The updated app launched and its fictional
sign-in, feed, detail, explicit reveal, pagination, retry, empty feed, sign-out
and foreground recovery were observed on iOS 27. Cold plain restart cleared the
in-memory session. Cold and repeat warm app links reached the intended post
after sign-in. The first OS link-confirmation interruption required reopening
the link in that earlier build. The later shared admission repair and ordinary
Release verification resolve that fictional-journey case; see the
[first-confirmation diagnosis](NATIVE_NAVIGATION.md#iphone-first-confirmation-diagnosis-8-october-2026).
Session invalidation remains preserved.
Native secure-store verification exposed missing Simulator entitlements and
prompted the app-only linker identity above. The rebuilt app launched and its
real native Keychain write, read and removal probe passed. All 110 inspected
Pods target-settings records resolved empty identity sections; both app architectures contained
the XML and DER sections, with no restricted host-signature entitlements.
Exact host, volume, source hashes and local
logs are retained in the private task receipt.

Dark appearance, enlarged text and accessible control labels were inspected.
The observed app-switcher snapshot concealed the revealed fictional prayer and
showed only the app title; returning checked the session before restoring the
feed. This single observation does not establish every interruption timing or
physical-device snapshot behavior. Software-keyboard coverage, complete
VoiceOver behavior and inactive-only transitions remain explicit acceptance work.

Additional small-screen checkpoint, 8 October 2026: the same reviewed executable
also installed and launched on an iPhone SE (3rd generation) Simulator running
iOS 18.3.1. Its native Keychain write, read and removal probe passed. Fictional
sign-in, post detail, explicit reveal and the finite final feed page worked.
Landscape feed, post navigation and sign-out remained usable, followed by a
return to standard portrait. The fixture's sign-out confirmation represents its
in-memory response, not a real server session. Only the newly created task device
was shut down after the run; existing Simulator devices were preserved.

At maximum system text size, the final feed page and enlarged reading controls
were inspected. One live font-change capture showed clipping, but a
controlled normal-to-maximum-to-normal check on the same mounted guest screen
reflowed without taps, scrolling or restarting. The maximum-size capture was
taken 12.7 seconds after the command; this is an observation time, not a measured
settling duration. No persistent source defect was established and no UI patch
was made. The sample input accepted a software-keyboard key with the keyboard
visible; password entry, complete keyboard clearance and VoiceOver remain open.
Notification Center concealed the revealed fixture content, and a subsequent
return restored its preview. Because that return also passed through Home, it
does not establish recovery from an inactive-only interruption.

This older-runtime fixture check does not validate the provisional iOS 16.4
minimum, physical devices or complete accessibility. Its private receipt keeps
the tested executable identity, screenshots, observations and remaining gates
separate from the earlier build and iOS 27 acceptance evidence.

Further primitive checks used that retained small-screen device and unchanged
executable. System appearance updated the open app, input and software keyboard,
and the app followed a changed appearance after a confirmed Home transition.
Explicit light and dark choices overrode the opposite device setting; restoring
the system choice restored the device appearance. Multiline sample text remained
editable with the software keyboard, and native selection handles and the edit
menu appeared in both themes. A software key replaced the selected word. Reading
controls updated their visual and accessibility selected state while the keyboard
remained open. These observations cover the sample control only: its lower border
was at the keyboard edge, so complete keyboard clearance, password forms,
hardware-keyboard traversal and VoiceOver behavior still need separate acceptance.
No theme or primitive source change was required by these checks.

Separately verify the real journey against an accepted nonproduction
HTTPS endpoint with fictional accounts. Source checks, Hermes exports, native
compilation, Simulator behavior and physical-device acceptance are distinct.
Existing dependency-security and release gates remain in force.

The native privacy-cover preparation adds a local iOS module and a mounted
presentation marker. Re-run guarded Pods installation before building this
change, then verify the generated Expo provider contains both its module and
app-delegate subscriber. Older binaries lack the bridge and stay concealed.
The standalone policy check is `node scripts/check-native-privacy.mjs` from
`mobile/`, with the same explicit storage profile and machine-build ownership.
It compiles the Foundation-only policy under Swift 6 with warnings as errors and
retains its executable and cache in a fresh generated directory. This check is
separate from the Expo/UIKit build and actual snapshot acceptance described in
the [native journey](NATIVE_JOURNEY.md#native-ios-privacy-cover).
