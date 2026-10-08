# Android lifecycle acceptance

The [native privacy boundary](ANDROID_PRIVACY.md) keeps private presentation
concealed until a current native attachment and the shared session state permit
it. The [Android build guide](ANDROID_BUILD.md) records the separate interruption
checks with JavaScript paused. This checkpoint covers the retained-window marker
reattachment case left open by the first native privacy checkpoint.

## Native marker reattachment, 8 October 2026

Two bounded API 36 emulator cases exercised the actual presentation view in the
unchanged ARM64 development APK. Its SHA-256 remains
`ddf901c9db76943a76877a0fa07e1d30cd5c6ac538ce91bc6de5a030cbec5b94`.
A separate test-only APK with the same development signer held the real React
JavaScript queue while native main-thread work continued. The test removed and
restored the original marker in its original clipping-disabled parent, preserving
the child index and layout parameters. It did not call coordinator callbacks or
fabricate presentation props, proofs or session results.

Both cases began with a revealed fictional prayer. The first detached and
reattached the marker while the same Activity remained focused. The second used
Home, detached while paused and unfocused, then returned with the marker absent.
That second case observed the specific stale cached-focus condition: actual decor
focus was true, the retained window's cached focus was false, and the Activity
was resumed. Reattachment sampled the actual focus and restored active native
state without accepting the old presentation.

The Activity, window, retained privacy entry and marker identities remained the
same throughout both cases. Each reattachment created a new attachment identity
and native epoch while the original presentation props remained unchanged. The
cover appeared synchronously on removal and remained visible after reattachment.
There were 27 and 26 covered native observations, respectively, before JavaScript
was released. The content subtree remained hidden from accessibility traversal,
blocked descendant focus and held no input focus. Screenshots inside those
intervals showed only the generic cover.

The observed queue holds lasted 2,806 and 3,245 milliseconds. The harness used
bounded main-thread calls, an earlier restoration deadline and a 15-second hard
hold limit. It restored the native tree before releasing JavaScript. A separate
queued sentinel confirmed that JavaScript did not execute during either hold.
These timings describe the test intervals, not application performance.

After release, separate UI observations verified a settled fictional feed with
the old prayer body absent. Reopening that prayer required a new explicit reveal.
Cover removal alone was not treated as completed session verification. The test
package was removed, the unchanged installed app hash verified, the original
emulator settings restored and the owned emulator and ADB server stopped.

## Remaining boundaries

This is actual native view attachment evidence on one emulator. It does not
establish React reconciliation behavior, execution of a canceled old callback,
physical TalkBack traversal, earlier Android's secure-window behavior or other
manufacturers' devices. Additional windows and modal/media surfaces, accepted
real-session staging, battery restrictions, low-memory recovery and secure-store
backup/reinstall remain separate checks. The shared dependency audit, signing
ownership and store-release gates remain open.

No application code, dependency, app binary or iOS behavior changed for this
checkpoint. Exact source, test harness, raw observations, screenshots, review and
cleanup receipts are retained in the existing private handoff.
