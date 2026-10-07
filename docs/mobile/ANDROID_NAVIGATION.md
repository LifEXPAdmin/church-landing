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
These settings are preparation, not proof that focused input, three-button
navigation, landscape or large text is correctly positioned on every device.

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

After the actual Android toolchain is available, generate and compile the
development variant using the guarded workspace. Test the first real journey on
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
