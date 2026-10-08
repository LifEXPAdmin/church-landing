# Android bounded feed acceptance

This records native Android observations of the released shared feed-scroll
implementation on 8 October 2026. It accepts specific fictional fixture cases,
with one visual defect still open. It does not complete real-account feed parity,
physical-device accessibility or release acceptance. No application source,
dependency or backend contract changed for this checkpoint.

## Build identity

The build used clean source `7443e1282ef01d7c9750ee930e70047924d92ee7`.
Its mobile and shared-core runtime source matches the feed integration at
`cdfa2415d63a4cce285a890cfbcd9c6b9ad9dfbc`. The later commit adds Android
evidence documentation. An active shared consumer branch was not modified.

The guarded ARM64 development build succeeded in 77 seconds with 653 tasks:
33 executed and 620 up to date. Its APK is 26,482,158 bytes with SHA-256
`0c1400972683740380101b0af7b17f686c7308ff194fb740ce8a87fdf7bb7c6f`.
The installed APK matched that hash. The development signer was checked; this
is not a store-signed application or a production build.

Execution used an ARM64 Android 16 / API 36 emulator at 1080 by 1920 pixels,
with two virtual CPU cores, 2 GiB RAM and no saved emulator snapshot. The
fixture uses fictional content and memory-only credentials. It cannot prove
real authentication, server ranking, network transport or credential migration.

## Native observations

| Case | Observed result and boundary |
| --- | --- |
| Feed modes | Latest, Friends, Top This Week and Trending each became the sole selected feed button. This proves fixture selection, not real ranking or friend authorization. |
| First-page detail and Android Back | Opening Alex's post showed its expected fictional body. Android Back returned to the same feed anchor and pixel bounds. |
| Second-page detail and Android Back | Next page reached the fictional church post. Opening it and pressing Android Back restored the second-page anchor and bounds, with the unavailable-original state retained. |
| Interrupted read | The fixture failure replaced prior post content. Explicit Try again recovered the first feed page. This was a simulated failure, not an offline-network test. |
| Empty read | The fixture empty state exposed no prior authors. Explicit Refresh feed recovered the first page. The empty-state trigger did not itself establish a reset to the top; refresh was reached by scrolling. |
| Large text | At system font scale 2.0, the weekly label appeared in full. An inset Alex read control opened its post, and Android Back restored the same visible bounds. |
| Background and return | Overview showed a generic app thumbnail in the inspected image. Returning in the same app process cleared the feed scroll bookmark and showed Latest at the top. This is one observed emulator capture, not universal snapshot-privacy acceptance. |
| Sign-out and a fresh session | Signing out after selecting the weekly feed removed the previous feed from the guest view. A new fictional session started with Latest selected at the top. This does not prove real token revocation or persisted credential removal. |

The large-text follow-up used control bounds strictly inside the viewport.
Earlier edge-of-viewport observations establish activation and return position,
but do not establish that the whole control was visible. Fresh UI hierarchies
and decoded PNG images are retained privately for the individual cases. A full
accessibility label in a hierarchy is not proof of complete visible text or a
TalkBack announcement.

## Open visual defect

At default system font scale 1.0, the fully visible Top This Week button draws
only "Top This". It occurs in both selected and unselected states, and recurs
after restoring the default font size and signing into the fixture again.
The accessibility label and underlying text still contain the complete phrase.

A separate, reviewed read-only instrumentation APK measured the existing native
text view without restarting the target process or changing its APK. The
TextView was 277 by 59 pixels, but its actual StaticLayout was 277 by 118 pixels
with two lines: "Top This " at vertical pixels 0 to 59 and "Week" at 59 to 118.
Neither line had ellipsis. The view therefore allocates one line while its
native text layout has two. This confirms the clipping mechanism; the exact
upstream measurement disagreement is not established. Base-paint text width
was not treated as fully styled React Native text width.

The relevant presentation path is
[NativeFeedChoices](../../mobile/src/ui/NativeFeedChoices.tsx) through the shared
[Button primitive](../../mobile/src/ui/primitives.tsx). The shared owner has the
reproduction evidence and retains ownership of the active presentation changes.
The defect remains open; no passing source test or XML assertion overrides the
observed clipping. A corrected, released shared source must be built and checked
on Android at default and larger text sizes before this visual case is accepted.

## Artifact growth

Compared with the preceding privacy development APK, the file grew by 4,416
bytes. The complete size increase is accounted for by the stored JavaScript
bundle, from 1,410,148 to 1,414,564 bytes. The archive still has 1,102 entries,
the same native ABI inventory and the same aggregate archive overhead.
Three native libraries have changed CRC metadata at unchanged sizes; this is
not a claim that only JavaScript content changed or that CRC equality proves
payload identity. Neither APK was extracted for this metadata comparison.

The [bounded reader](BOUNDED_READING.md) still limits one page to at most 30 root
posts or one post, uses a 2 MiB native response bound and persists no feed/post
body cache. APK bytes are not Play delivery size, installed footprint or a
measured runtime-memory ceiling. This checkpoint introduces no cache or storage
expansion.

The final fixture session was signed out, the separate test package removed,
the original emulator settings restored and the owned emulator/private ADB
stopped gracefully. The target APK hash remained unchanged. Source, artifacts,
task-scoped emulator data and private evidence were retained.

## Remaining acceptance

The visual repair, accepted real nonproduction endpoint and session configuration,
current backend receipts, physical Android/TalkBack coverage and supported-device
performance measurements remain open. Existing dependency-security, owner,
signing and store gates remain unchanged. This evidence does not authorize
release or replace the shared implementation's separate unit and platform proofs.
