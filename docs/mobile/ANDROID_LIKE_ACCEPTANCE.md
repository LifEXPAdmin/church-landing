# Android Like and detail acceptance

Recorded 9 October 2026 UTC. The combined canonical Like, Button measurement and
detail-scroll implementation passed the bounded fictional Android observations
below. The weekly label is complete in selected and unselected states at normal,
enlarged and restored normal text sizes. This supersedes that specific open
clipping observation in the earlier [feed report](ANDROID_FEED_ACCEPTANCE.md)
for the new identified APK only. Real-session and release acceptance remain open.

## Artifact identity

The app was built from clean source
`da51f28523253059069e9bcc78df8a61ce27dc22`, based on
`f20d79d3ea195193facf72b69be13d0cfcbe286d`. The 29 imported paths match the
released combined shared source exactly. No parallel Like controller or API was
introduced. The source stayed unchanged throughout the native session.

| Measurement | Observed result |
| --- | --- |
| Development APK | 26,503,558 bytes; SHA256 `f671580b024ebad5880d0a5bc50ee252730d44694d1f55fe051835239143d628` |
| Embedded JavaScript | 1,435,964 bytes; SHA256 `3612984eb7811c2561a11ffd4592e8253be7783ececf2e2c76a6d3756c26a3de` |
| Guarded Gradle build | Successful in 1 minute 37 seconds; 653 tasks, 51 executed and 602 up to date |
| Package | `com.godschurches.mobile.dev`, ARM64 only, minimum API 24, target API 36, local debug signature |
| Native environment | Android 16 / API 36 emulator, 1080 by 1920 pixels, measured 4096-byte memory pages |
| Installed artifact | Installed base APK hash matched the retained APK before acceptance and again before cleanup |

The APK is 21,400 bytes larger than the preceding feed APK. Its 1,102 ZIP entries
are unchanged in count; stored JavaScript also grew by 21,400 bytes. Other entry
metadata changed, so this is not a claim that only JavaScript bytes changed or
that runtime performance improved. Package locks remain unchanged.

Signature, manifest, SecureStore backup exclusions and Android Back declarations
were inspected. SDK ZIP alignment passed. The retained
[package inspector](ANDROID_PACKAGE_ACCEPTANCE.md) still exits nonzero on twelve
RELRO end findings: all fifteen native libraries have aligned ZIP storage and
LOAD segments, but only three have aligned RELRO ends. This 4096-byte-page guest
does not establish 16 KiB runtime compatibility, release hardening or store
acceptance.

## Source evidence

The shared Like snapshot is `bc1ede4a4465e53de1fea4e2eeb1b6e222ed1209`.
The combined Button and detail-scroll handoff is
`d89332ca510a929825379d72167db5d96fba6791`. Full affected-module reviews and
hash-verified receipts are retained privately. The Android package inspector,
its tests and its report remain preserved.

Fresh import checks passed: boundary 46, authored copy 1,029 files / 81,160
strings, source security 2,335 tracked / 1,010 authored / 550 locked packages
with zero findings, staged secret scan 115,926 bytes with zero findings, and
whitespace. Verified shared receipts were reused for 104 focused checks
(including 25 scroll checks), ten theme/feed-choice checks and the actual Kotlin
policy compilation and four assertion groups. These were not rerun unchanged.
The exact shared-source hosted receipt separately records 309 passing mobile
tests, three Darwin-only skips, passing types/lint/boundary, and the unchanged
fatal four-high dependency audit gate.

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

Forty-six numbered PNG, hierarchy and metadata captures are retained privately.
Pixels were inspected in addition to accessibility labels. These observations
use the memory-only fictional account and wire, not the native HTTP bridge.

| Case | Native observation and limit |
| --- | --- |
| Button layout | Captures 02/03, 31/32 and 41/42 show the complete selected and unselected weekly label at system font scales 1.0, 2.0 and restored 1.0. The in-app reading size was comfortable. |
| Hidden count | Welcome detail changed Like to selected Unlike and back in 06 to 08. The count remained hidden. |
| Visible count | Church quote changed zero to one to zero in 14 to 16. Opening its original prayer while the quote command was pending showed an independent unselected Like, disabled while that other command remained pending. |
| Interrupted reply | Lost-reply fixture showed uncertainty, disabled new choice and enabled explicit retry. Retry resolved the command in 21 and again at enlarged text in 36. This is not real HTTP response-loss evidence. |
| Pending route | Back exposed Review pending Like choice. Review reopened the original quote; another post could not retarget the command. A fresh read could already show the saved count while the command still awaited its receipt. |
| Detail position | Welcome Like bounds were exactly `[108,575][972,701]` before and after 41.18 seconds without UI input. This spans the source-defined 30-second recheck interval; no loading transition or network-dispatch trace was captured. |
| Back and reopen | Back restored the feed's read-post bounds exactly to `[108,921][972,1047]`. Reopening detail placed Back to feed at its original top position. |
| Content-note reset | Prayer body appeared after explicit reveal in 44. After 38.48 seconds without input, 45 showed the excerpt and Reveal this post again. This does not establish transition continuity or changed-content offset clamping. |
| Background return | Overview capture 23 showed only the app-name cover. Returning in the same process reset the feed to Latest; pending review survived and reopened the uncertain quote. This is one snapshot observation, not universal privacy or persistent-credential acceptance. |
| Sign-out | Explicit sign-out while Unlike was uncertain in 37 returned to guest in 38. Fresh fictional sign-in in 39 showed Next page followed by Sign out with no pending-review control. The fixture has one owner, so this is not native account A-to-B-to-A proof. |
| Large-text recovery | Full retry label in 34 and two-line pending-review label in 35 were visible inside their borders and successfully tapped at font scale 2.0. No font-scaling cap was added. |

Counts in captures 20 and 22 already reflected a fresh read while the command
remained uncertain. They do not prove that the previous count stayed unchanged
until explicit retry, nor that any command was automatically resent.

## Configuration change and cleanup

Changing system font scale from 1.0 to 2.0 during a pending choice returned this
fixture to guest. The Android event log proves Activity relaunch, destroy and
create in the same process. Reviewed generated manifest, React surface lifecycle
and application ownership explain the fresh memory-only fixture. Same process
does not mean the same Activity or JavaScript surface. This was not evidence of
a Like or Button regression. Pending-choice continuity across a live font change
and real credential recovery remain unaccepted. Enlarged-text observations used
a fresh fictional sign-in at the fixed 2.0 scale. Restoring 1.0 likewise returned
the fixture to guest before the final fresh-session checks.

The first enlarged-post lookup used an incorrect automation label and performed
no tap. Its failure and capture were retained; the exact existing label was read
before continuing. That harness error is not an application defect.

Final explicit sign-out, original text/rotation/navigation settings, unchanged
source and matching installed/retained APK hashes were verified. The owned
emulator and private ADB server exited gracefully, and all four owned listener
ports were closed. Source, APK, evidence and the generated AVD were retained.

The fixture has a fixed fictional owner and memory-only credentials. Its plain
repost test address has no admitted UI or link route, so that case remains
source-only. Fictional reply interruption does not exercise the Android HTTP
bridge, TLS or actual backend response loss. Screenshots and accessibility
hierarchies do not establish TalkBack announcement delivery.

## Remaining gates

The next real-journey acceptance requires the accepted canonical nonproduction
HTTPS/session configuration and current backend receipts, followed by a newly
identified native build. Dynamic changed-bounds clamping, live configuration
recovery, TalkBack delivery, physical/minimum-version devices, performance,
dependency security, native-package findings, release signing and store acceptance
remain open. No production or store release is authorized by this record.
