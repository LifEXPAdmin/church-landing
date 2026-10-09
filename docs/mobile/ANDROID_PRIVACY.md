# Android private presentation

The Android first journey uses the existing shared session controller and native
privacy presentation protocol. It does not restore private content merely because
an Activity resumes. Missing native bindings keep the journey concealed, so this
change requires an Android binary containing the local `GCNativePrivacy` module.

## Native boundary

The local module adds an opaque generic cover above the Activity content. Direct
window focus and application lifecycle callbacks conceal it on Android's main
thread. The paused latch closes the interval before AndroidX updates its lifecycle
state. Expo's queued React lifecycle callbacks are not the concealment boundary.
The content subtree is removed from accessibility traversal, descendant focus is
blocked and the old editor is unfocused. IME dismissal is requested; its return
value is not evidence that the keyboard has disappeared.

Each native transition invalidates the previous epoch. A mounted presentation
can release its cover only with the current epoch, session generation,
presentation identifier and attachment/window identity, while the actual Activity
is resumed and focused. The proof runs after the synchronous Fabric mount batch
and checks every presenter belonging to that window. A detached view, changed
props, old callback or destroyed observer cannot release the cover. At most one
pending completion is retained per presenter; destroyed Activities remove their
window entries and listeners. No account content or credentials enter this module.

Android 13 and later disable Activity screenshots in Overview with
`setRecentsScreenshotEnabled(false)`. Earlier Android versions retain
`FLAG_SECURE` for the protected Activity's lifetime, which also restricts
foreground screenshots and display on insecure outputs. Removing the presentation
marker does not reopen a task-snapshot gap. These OS controls supplement the
native cover; they are not claims about every manufacturer's screenshot or
keyboard implementation. See the [Android Activity reference](https://developer.android.com/reference/android/app/Activity#setRecentsScreenshotEnabled(boolean))
and [secure-window guidance](https://developer.android.com/security/fraud-prevention/activities).

## Verification boundary

The shared observer's race, malformed-state, missing-bridge and session-visibility
checks cover the protocol. Kotlin unit checks exercise startup concealment,
native inactivity, attachment/window replacement, changed generations/props,
rapid pause/resume and invalid bounded identifiers. Native build and device
observations must be recorded separately from these source checks.

The first-journey matrix includes focused and interrupted sign-in, feed and
revealed-post switching, notification shade, Overview, screen lock, landscape
IME, Activity recreation and process restart. Require a fresh session check
before private content reappears. Test stale and delayed responses through the
existing session/transport fixtures. A stalled-JavaScript observation must actually
stall JavaScript while native callbacks continue; a whole-process pause is not
equivalent. Physical TalkBack, older-OS snapshot behavior, multiple windows,
real-session staging and release acceptance remain separate gates.

This preparation does not complete the broader battery, background restriction,
backup/reinstall, delayed notification or process-death task. It adds no background
polling, credential storage, network API or production capability.

## Local checkpoint, 8 October 2026

The repaired native module compiled in an ARM64 development APK on the existing
shared dependency graph. The retained APK is 26,477,742 bytes with SHA-256
`ddf901c9db76943a76877a0fa07e1d30cd5c6ac538ce91bc6de5a030cbec5b94`.
It was built from the working tree based on `4a7da195`; the private receipt records
the exact tested file hashes. The installed package matched that APK. The final
incremental build took 31 seconds, with 25 of 653 tasks executed. This is an
observed local build cost, not a clean-build benchmark.

The API 36 emulator completed eleven bounded first-journey observation groups,
recorded in forty captures. Overview concealed a revealed fictional prayer and
entered sign-in values, including an intentionally visible fictional password.
Returning required the shared session check and reset the prior reveal or form.
Notification-shade return, screen sleep/wake, portrait and landscape keyboards,
explicit sign-out, process replacement and an actual Activity recreation also
recovered usable fixture screens. The Activity recreation retained the process
and changed the Activity instance after a font-scale change. Force-stop/relaunch
is process-replacement evidence only, not low-memory recovery or real credential
restoration. An earlier attempt to enable activity destruction did not recreate
the Activity and is retained as a failed attempt, not a passing case.

Seven native policy checks and 36 focused shared observer/session/fixture checks
passed. Type checking, focused lint and the mobile boundary check passed. Review
found and repaired stale cached focus when a retained window receives a new
marker; valid attachment now samples actual decor focus. That exact marker
detach/reattach sequence still needs runtime verification.

The emulator's original font, rotation and navigation settings were restored and
its owned processes stopped. System UI captures do not prove hidden app
accessibility traversal. Stalled JavaScript, physical TalkBack, older Android's
secure-window branch, additional windows and modal/media surfaces, real staging
sessions, battery restrictions and release/security acceptance remain open.
The existing shared dependency audit remains a fatal release gate.

Consume this change through the canonical mobile workspace. Android needs a new
binary containing this module. Apple module registration and Swift sources are
unchanged, and no iOS native result is claimed for this Android checkpoint.
