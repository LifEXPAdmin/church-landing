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

The subsequent password-visibility checkpoint consumes the reviewed shared
Show/Hide form and handler tests without changing the session or native cover.
All 244 mobile tests, full and focused TypeScript, lint, boundary checks and an
unsigned Xcode 27 Release build pass. The 1,741,115-byte Hermes bundle adds
473 JavaScript bytes to the privacy checkpoint, without a performance claim.

On iPhone SE with iOS 18.3.1 and on iOS 27, visible masking, explicit reveal,
full-value preservation and keyboard use were observed. On iOS 27 the initial
keyboard covered the toggle; scrolling dismissed the keyboard, and refocusing
the repositioned field left the toggle usable above it. Both versions moved a
selected range to the end after Hide then Show. A software key appended there
without losing the existing value. Selection preservation is not established.

The SE run also verified software Next/Go, invalid submission clearing and
remasking, valid fictional sign-in through the button, sign-out, and fresh empty
masked forms after replacement. Both Simulators concealed a revealed form in
the app switcher and discarded its draft on return. The iOS 27 transition began
with the software keyboard visibly open; that condition was not captured for
the SE switcher sequence. Screenshots and accessibility observations establish
bounded states, not every intermediate frame. VoiceOver speech, actual autofill,
physical-device, minimum-version and real-account acceptance remain open.
These build results apply to the recorded dependency graph; later dependency
repairs require their own source and native validation.

Dependency-integration checkpoint, 8 October 2026: the reviewed locked root and
mobile graphs passed fresh guarded installation and the existing root patch
checks. All 248 mobile tests, 54 focused root regressions, 92 portable checks and
seven shared-core tests pass, alongside types, mobile lint, boundary and Expo
compatibility checks. Root lint reports no errors and 39 warnings in unchanged
QA scripts. The root audit reports zero vulnerabilities; the mobile audit still
fails with four high findings through node-forge. That gate remains open.

A fresh unsigned Xcode 27 Release build installed on the retained iPhone SE
Simulator with iOS 18.3.1. Its installed JavaScript, native executable and
Info.plist match the completed build receipt. The 1,741,115-byte Hermes bundle is
unchanged from the password-visibility checkpoint. The development-only diagnostic
module and its source metadata are absent from this Release bundle; equal
JavaScript hashes do not indicate stale embedded provenance. Build receipts and
exact source hashes retain the dependency and native artifact identities.

The bounded native smoke check observed password reveal/hide, fictional sign-in,
feed and post detail, Back to feed, an opaque app-switcher cover and a resumed
feed. UI automation timed out during this session. A later screenshot confirms
the resumed feed; these
tool timeouts do not establish an app hang. No sign-out or fresh-form sequence
was attempted in that session. Software-keyboard, iOS 27, stalled-JavaScript and real
backend behavior were not reverified in this run. The earlier password and
privacy observations remain separate historical evidence, with their original
scope and limitations.

A separate follow-up on the same verified build recovered UI automation,
signed in with the demo account, signed out, and reopened empty email and password
fields with Show password available. The sign-out confirmation describes the
fixture's in-memory response. The software keyboard was not opened. This adds
only the sign-out and fresh-form observation; both managed sessions shut down
successfully.

Feed-choice preparation, 8 October 2026: a stateless presentation component adds
Latest, Friends, Top This Week and Trending through the existing canonical modes,
plus Refresh feed. Its three handler tests pass, as do all 27 reading tests after
strengthening the returned-page fixture. Tests verify selection, mode and cursor
requests, second-page content after Back, refresh, empty and interrupted reads,
and rejection of superseded responses. Mobile types, scoped lint and the
43-module boundary check pass. Source review found no actionable issues.

At that preparation checkpoint, the component was not yet wired into the native
journey, which retained its previous controls. Those source and handler results
did not establish native
layout, large-text or VoiceOver behavior, actual feed ranking, scroll restoration
or real-backend acceptance. Shared-screen integration and a fresh native check
remained next; that preparation added no dependency or native configuration change.

The subsequent feed integration connects all four choices to the existing
canonical reader. The journey keeps one memory-only page address and vertical
offset through post/Back and same-page rechecks. Each fresh response gets a new
inner scroll view. Restoration waits for current layout bounds, clamps its
target and rejects callbacks from obsolete reads or detached views. It does not
retain hidden posts, renew activity or issue extra read requests. Refresh, mode
changes, Next page, error recovery and session concealment clear the bookmark.
Pixel restoration preserves a nearby position; changed content or text size can
move the original post. Native observations for this integrated source must be
recorded separately from the earlier preparation and dependency checkpoints.

This integration also consumes the released shared Android keyboard wrapper and
privacy bindings. Apple registration and Swift sources remain unchanged. Fresh
iOS project and Pods preparation is still required because the local module
configuration and package inputs changed. The Android privacy checkpoint in
[its report](ANDROID_PRIVACY.md) is separate from iPhone acceptance.

Integrated feed validation, 8 October 2026: all 269 mobile tests pass, including
11 groups exercising the actual journey callbacks and six pure bookmark-policy
tests. Mobile types, lint, the 44-module boundary check, copy and source security
checks pass. The callback harness is not React/Fabric or device acceptance.

Fresh project and Pods preparation completed, followed by a successful unsigned
Xcode Release build. The installed iPhone SE Simulator app on iOS 18.3.1 matches
the build's JavaScript, executable and Info.plist hashes. Its Hermes bundle is
1,746,376 bytes. Source stayed unchanged throughout the managed native session,
which shut down successfully.

The fictional native journey showed all four feed choices, post/Back position
restoration on both pages, and top-of-page resets after Refresh, a mode change,
Next page and interrupted-read recovery. These are qualitative visible-position
observations. Some later saved captures caught the periodic loading screen;
their filenames alone are not proof of restored positions. The empty feed stayed
within valid content. A bounded passive interval retained its ending position,
but did not capture its loading transition. Exact clamping and stale callback
ordering remain covered by the source tests.

At the largest system accessibility text category, post opening and Back worked,
and the visible Back and Refresh controls wrapped without clipping. This limited
check does not establish VoiceOver or complete large-text acceptance. The native
app-switcher cover stayed opaque; returning from a lower feed position started
fresh at the top. Sign-out and fresh demo sign-in also reset the feed. System
text size was restored after the check.

Real backend and feed-ranking acceptance, physical devices, minimum supported
iOS, signing and store readiness remain open. This run does not repeat earlier
keyboard, iOS 27 or stalled-JavaScript privacy checks. The unchanged mobile audit
still has four high node-forge findings; no security gate was waived.


## Detail Like and live text verification

This checkpoint adds detail Like/Unlike, current status and explicit
recovery of one interrupted in-memory command. It consumes the existing shared
API schema and preserves the prepared-request generation guard. The labeled
fictional preview can save a choice and interrupt its reply for recovery checks.
Native activation remains unavailable until a separate accepted HTTPS backend
and session receipt are supplied.

The JavaScript, Swift and Kotlin route policies admit only the exact Like path
and reviewed GET/POST forms. The current Swift 6 warnings-as-errors harness passes
14 macOS Foundation policy/transport groups. Xcode's strict capture diagnostic
required spelling out the existing strong capture on the serial reserve closure;
the nested deadline handler retains its weak capture. No compiler flag or native
transport bound was weakened. Kotlin assertion source still needs execution with
the Android toolchain. Foundation success is distinct from an iOS binary or real
HTTPS acceptance.

All 301 mobile tests pass, along with mobile types, focused test types, lint,
the 46-module boundary check, copy, source security and staged secret scanning.
Fresh iOS project and Pods preparation completed. The first Like binary exposed
clipped labels when system text size changed on an already mounted screen.
The corrected theme subscribes to the public font-scale event and remounts only
the iOS text host when that scale changes. Inputs, buttons and runtime owners
retain their identity; native font scaling remains enabled without an extra
multiplier. Descriptor tests cover these boundaries, not Fabric focus behavior.

The corrected Release build passed. An earlier attempt stalled during dependency
directory enumeration; its failure was retained, and verified duplicate package
directories were preserved outside the source tree before the successful retry.
No package lock or application source changed for that build repair.

The installed iPhone SE Simulator app on iOS 18.3.1 matches the corrected build's
JavaScript, executable and Info.plist hashes. Its Hermes bundle is 1,771,751 bytes,
25,375 bytes above the feed checkpoint. This is an artifact measurement, not a
download-size or performance claim. The managed session ended with unchanged
source, restored normal system text size and successful device shutdown.

The corrected fictional sign-in form redraws after live normal-to-largest and
largest-to-normal system text changes without leaving the form. Its complete
fictional values survive and successfully sign in. The enlarged password-toggle
label wraps. Single-line input text remains horizontally scrollable; this run
does not establish software-keyboard, selection or VoiceOver focus preservation.

Like sets the visible quote count from zero to one. An interrupted Unlike stays
unconfirmed with a disabled new-choice control; a current read retains the exact
pending choice, and explicit retry reconciles to zero. The largest-text retry
and status controls wrap. Pending state survives live sizing and the native
privacy cover, then becomes reviewable after fresh session verification. Sign-out
clears it, and a fresh sign-in has no executable retry. The earlier Like binary
also exercised hidden counts and Back-to-feed recovery; that evidence remains
separate from the corrected binary.

Accessibility automation can scroll controls into view. Periodic authorized
detail reads also remounted content during inspection, so the nonperiodic form
provides the direct live-resize evidence. Detail scroll continuity needs separate
follow-up. Full assistive-technology checks, Kotlin execution, Android acceptance
and its separately reported feed-label clipping remain open. These observations
do not replace real HTTPS/session, physical-device, minimum-iOS, signing, security
or store gates. The four existing high mobile dependency findings remain open.
