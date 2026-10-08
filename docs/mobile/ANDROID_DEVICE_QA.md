# Android device variation evidence

This guide records bounded native checks separately from whole-app accessibility
and supported-device acceptance. The [privacy guide](ANDROID_PRIVACY.md) describes
the native boundary; [lifecycle acceptance](ANDROID_LIFECYCLE_ACCEPTANCE.md)
records the earlier API 36 marker tests.

## Android 12L checkpoint, 8 October 2026

The unchanged ARM64 development APK ran on a separate AOSP API 32 emulator,
using a Pixel 2 display profile at 1080 by 1920 pixels and density 420. The system
image was the default ARM64 revision 2, with an Android 12 userdebug build and a
January 2024 security patch. This is an older-OS compatibility probe, not a
physical Pixel test, a current security baseline or minimum-supported-OS coverage.
The existing API 36 environment was preserved.

Application source was `a73860a3ef829d196aa3dede24c3512203526d7a`. The installed
APK matched SHA-256
`ddf901c9db76943a76877a0fa07e1d30cd5c6ac538ce91bc6de5a030cbec5b94`.
No application code, dependency or app binary changed for these checks.

A separate test-only APK observed `FLAG_SECURE` on the Activity before and
throughout a native marker test. After a fresh UI-tree observation confirmed a
revealed fictional prayer, the harness held the actual React JavaScript queue,
sent Home, removed the presentation marker, returned to the same Activity and
restored the original marker. It preserved the process, Activity, window, privacy
entry, marker, parent, child index and layout parameters.

The return reproduced actual window focus with stale cached focus while the
marker was absent. Reattachment renewed the binding and epoch, kept the old
presentation covered and blocked content accessibility and descendant focus.
There were 26 covered native observations during the 3,426-millisecond queue
hold. A queued sentinel ran only after JavaScript was released. The native tree
was restored before that release. These are bounded native-state observations,
not application performance measurements or physical TalkBack traversal.

Separate settled UI-tree checks found the fictional feed after recovery, with
the old prayer body absent. Reopening the prayer required another explicit
reveal. The native cover disappearing was not the session-completion oracle.

## Capture and harness limits

The launcher produced valid images before and after the app checks. Foreground
capture attempts while the protected Activity was active returned no image; a
direct shell capture also exited with status 1. Empty output is retained as a
capture attempt, with no screenshot or visual-redaction claim. An `adb exec-out`
exit code alone does not establish the remote capture command's success.

The attempted recent-apps check did not produce a fresh UI tree or an image.
The UI tool returned a null root; its earlier helper then read the prior XML
file. That artifact is excluded from acceptance. The private helper now uses a
unique path and requires a successful dump before reading. Recent-apps visual
acceptance on this image remains open.

An early native-state run lacked a verified revealed-content baseline. A later
precondition rejected a no-longer-revealed post after a wait longer than the shared
reader's 30-second access recheck interval. Both attempts are preserved separately. The accepted
case loaded and revealed the post immediately before its fresh baseline check.
The reader's recheck policy was unchanged.

The target and test APK hashes and matching development signer were checked
independently. This userdebug system does not establish platform enforcement of
instrumentation signatures. No signature-bypass option was used. The harness
kept bounded restoration and failure cleanup; it did not fabricate session
results, presentation props or privacy callbacks.

## Cleanup and remaining acceptance

The test package was removed, the installed target hash rechecked and the original
font, rotation, navigation and Activity settings restored. The owned emulator
and private ADB server stopped, with their reserved ports confirmed closed.
The system image, isolated virtual device and exact private evidence are retained
for later work on the prepared external storage.

This checkpoint does not complete full accessibility or device variation QA.
Physical TalkBack, additional Android versions and manufacturers, full selected
journeys, recent-apps visual proof on the older OS, real-session staging,
background restrictions, low-memory and backup/reinstall behavior remain open.
The shared dependency audit, signing ownership and store-release gates remain
unchanged. No iPhone, production or store release is claimed.
