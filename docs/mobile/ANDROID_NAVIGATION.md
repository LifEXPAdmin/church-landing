# Android navigation preparation

The development and staging configurations opt in to predictive Back through
Expo's `android.predictiveBackGestureEnabled`. The pinned Expo plugin writes
`android:enableOnBackInvokedCallback=true`; generated native files remain outside
Git. Production configuration is still unavailable.

The inspected React Native 0.86.3 `ReactActivity` registers an AndroidX Back
callback for target SDK 36. Its delegate forwards committed events to the existing
React Native Back handler, and the Expo delegate preserves that path. The app does
not override gesture progress or cancellation, or add a second native navigator.
This source inspection and manifest generation do not prove system animations or
device behavior.

## Current fixture behavior

The Android-only subscription uses current journey state on each Back event.
If the keyboard is still reported visible, it dismisses the keyboard and consumes
that event without changing the post or its content-note reveal. Otherwise Back
from post reauthorizes the bounded feed return page using current session
navigation. At the welcome/feed root the handler
returns false so Android retains its normal Activity behavior; it does not call
an explicit exit or sign-out.

Android normally handles IME Back before JavaScript. The additional keyboard
check prevents a delivered JS event from also popping a screen while the keyboard
is still known to be visible. Keyboard visibility is native event state and must
be checked on devices, including older supported Android versions. The handler
subscription is removed on unmount; iOS does not register it.

The existing screen uses safe-area insets and scrollable content. The generated
Android project has edge-to-edge enabled and `adjustResize` for the Activity.
`ScrollView.automaticallyAdjustKeyboardInsets` applies only to iOS. Android also
wraps the screen content in the built-in `KeyboardAvoidingView` with `padding`
behavior, so a focused input and scrollable controls can stay above the keyboard.
The iOS screen tree and shared password-form behavior are unchanged. No new
dependency or separate form implementation is introduced.

## Keyboard and navigation checkpoint

On 8 October 2026, the shared password form reproduced a real keyboard overlap
on the API 36 emulator: the focused Email and Password fields were below the
keyboard's top edge despite the generated `adjustResize` setting. The Android
screen wrapper fixed that overlap. The retained before/after APKs differ only in
their packaged JavaScript bundle, apart from APK signing metadata.

The repaired development APK passed bounded fictional checks for Email to
Password focus, masked and visible password preservation, failure handling,
software Go submission, keyboard-first Back and scrollable controls. At font
scale 2.0, fields remained above the keyboard and all form buttons were reachable
by scrolling. Home and resume removed the entered form and returned to welcome.
Landscape used the system's full-screen IME editor; Next advanced to Password,
Back returned to the preserved form and the Sign in button opened the feed.

A warm custom-scheme link opened a concealed post. A short edge swipe left the
post unchanged, and a committed Back gesture returned to feed. This does not
establish predictive animation or canceled-gesture acceptance. Three-button
Back also returned from post to feed. Root Back opened the launcher; relaunch
opened a fresh guest fixture, not a persisted account session. Three-button IME
Back preserved the entered email and form. See the
[build receipt](ANDROID_BUILD.md#password-form-native-checkpoint) for the binary
identity and remaining gates. These observations cover one emulator and fictional
accounts; they do not complete the device matrix below.

## Real navigation integration

Consume the canonical destinations and configurable native navigation projection.
Bind Back to the accepted navigator's current state when the real journey is
ready. Do not copy browser URL/history logic or use a captured account/screen
snapshot after sign-out or account replacement.

Native `Modal` does not dispatch ordinary BackHandler events. A modal must own
`onRequestClose` and close its own top layer before an underlying route can pop.
The current fixture has no modal or editable domain draft. When these are added,
the authoritative draft owner must offer explicit keep-editing/discard behavior,
preserve data on cancel and revalidate the current session before completing a
deferred action. This preparation does not implement or accept those future
flows.

## Required device acceptance

Generate and compile the development variant using the guarded workspace.
Test the first real journey on
the selected supported devices, with both gesture and three-button navigation:

- From a post, open the sample keyboard, press Back once and verify the post and
  reveal state remain. Press again after keyboard dismissal and verify feed.
- From feed/welcome, verify root Back/background and resume behavior without
  accidental sign-out, old-account content or duplicated listeners.
- On Android 15/16, commit and cancel predictive gestures. A canceled gesture
  must leave route and content unchanged. Verify system animation behavior
  separately from committed JavaScript Back events.
- Check status/navigation bars, keyboard and scroll position in portrait and
  landscape, large text and display scaling, including an older supported device.
  Exercise navigation-mode changes through system Settings and resume. Directly
  switching the emulator overlay while the app stayed foreground left light
  button icons on a light bar; a fresh Activity displayed the correct dark icons.
  The actual Settings transition and other themes remain unverified.
- Once real modal/draft flows exist, verify overlay dismissal, keep-editing,
  explicit discard, rapid Back presses and account change while a choice is open.

Keep native build, installed app/device results, accessibility and release
acceptance separate from pure unit tests and JavaScript exports. Record exact
source and generated manifest hashes with the evidence. No SDK license,
production identity, signing key or store publication is implied.

References:
[Android 16 Back changes](https://developer.android.com/about/versions/16/behavior-changes-16),
[React Native BackHandler](https://reactnative.dev/docs/backhandler) and
[React Native Android 16 support](https://reactnative.dev/blog/2025/08/12/react-native-0.81).
