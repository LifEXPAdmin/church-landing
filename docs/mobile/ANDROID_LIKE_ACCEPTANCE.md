# Android Like and detail acceptance

This checkpoint combines the canonical shared Like implementation with the
released Button measurement and detail-scroll corrections. Native Android
acceptance is pending. The earlier [feed observations](ANDROID_FEED_ACCEPTANCE.md)
remain historical evidence for their identified APK; they do not establish
that a new binary fixes its clipped weekly label.

## Source evidence

The shared Like snapshot is `bc1ede4a4465e53de1fea4e2eeb1b6e222ed1209`.
The combined Button and detail-scroll handoff is
`d89332ca510a929825379d72167db5d96fba6791`. Full affected-module reviews and
hash-verified receipts are retained privately. The package locks are unchanged.
The Android [package inspector](ANDROID_PACKAGE_ACCEPTANCE.md) is preserved.

The source checks establish explicit Like/Unlike commands, one bounded pending
choice, an immutable retry and a fresh authorized read after a confirmed
receipt. Neither feed loading nor returning to the foreground automatically
resends an uncertain command. Same-session concealment retains only the pending
command in memory; sign-out, replacement and disposal clear it. Native device
observations cannot by themselves prove exact request bytes or server policy.

The shared scroll correction retains one feed and one current-detail position.
Each contains only an owner, session generation, address and finite offset.
Restoration waits for a fresh authorized response and current native layout,
then clamps the offset. It retains no post body, revealed-content state or
credential. Navigation and access changes clear the applicable positions.

## Native acceptance matrix

All rows are prepared cases, not completed Android observations.

| Case | Required native observation |
| --- | --- |
| Button layout | Read the complete weekly label in selected and unselected states at default, enlarged and restored text sizes. Inspect pixels as well as accessibility labels. |
| Hidden count | Like and Unlike the fictional welcome post; its count stays hidden and each selected state settles after a fresh read. |
| Visible count | The fictional church quote changes between zero and one like. Its original post keeps an independent interaction state. |
| Interrupted reply | A simulated lost reply shows uncertainty and disables a new choice. Explicit Retry same Like choice resolves the pending command. |
| Pending route | Android Back exposes Review pending Like choice; review returns to its original post. A different detail cannot retarget the command. |
| Detail position | Observe a stable detail anchor across the periodic read interval; separately inspect a fresh content-note reveal reset and current layout bounds. |
| Back and reopen | Back restores the independent feed anchor. Opening the detail again starts a new detail visit. |
| Background return | Inspect the Overview privacy cover, then a fresh verified feed in the same process with explicit pending-review recovery. |
| Sign-out | Sign out while a choice is uncertain. A new fictional sign-in must not inherit that pending command. |
| Large-text recovery | Long retry and pending-review controls remain visible and reachable without limiting text scaling. |

The fixture has a fixed fictional owner and memory-only credentials. Its plain
repost test address has no admitted UI or link route, so that case remains
source-only. Fictional reply interruption does not exercise the Android HTTP
bridge, TLS or actual backend response loss. Screenshots and accessibility
hierarchies do not establish TalkBack announcement delivery.

## Remaining gates

A new clean-source APK, installed-artifact hash, native observations and owned
runtime cleanup are still required for this matrix. The accepted nonproduction
HTTPS/session configuration and current backend receipts remain separate gates.
Physical-device accessibility, supported-device performance, dependency
security, signing and store acceptance also remain open. No production or
store release is authorized by this record.
