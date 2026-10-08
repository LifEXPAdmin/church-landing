# Android artifact size baseline

This is a measured reference for an existing ARM64 development APK, before the
later shared feed integration. It is not a production package, Play download
measurement, installed footprint or process-memory budget. No app binary,
dependency, asset or source implementation changed during this inspection.

## Identified artifacts, 8 October 2026

The privacy APK is 26,477,742 bytes, or 25.251 MiB, with SHA-256
`ddf901c9db76943a76877a0fa07e1d30cd5c6ac538ce91bc6de5a030cbec5b94`.
Its reviewed build inputs were subsequently committed as
`a73860a3ef829d196aa3dede24c3512203526d7a`. The private build receipt preserves the
actual base and modified-source state at compilation; this is not a claim that
the later commit was embedded in the binary.

The preceding keyboard APK is 26,461,186 bytes, with SHA-256
`a28d0148cd1b3147b580bca6be1a48c7f529b13891b9b97568d6527f708813d0`.
Its matching reviewed source was committed as
`4a7da195fb5740088b30d5865a1423fe5997567f`. Both retained files were checked by
hash and size before and after inspection. A byte count alone cannot identify a
build: an earlier privacy attempt had the same size as the final APK but a
different hash.

## Archive composition

The privacy APK contains 1,102 files and only the `arm64-v8a` native ABI. These
categories are exclusive. Stored payload bytes count each ZIP entry after its
chosen compression; uncompressed bytes count its declared expanded content.

| Category | Files | Stored payload bytes | Uncompressed bytes |
| --- | ---: | ---: | ---: |
| Native libraries | 15 | 15,363,280 | 15,363,280 |
| DEX code | 2 | 7,422,509 | 20,477,100 |
| Android resources | 885 | 1,855,320 | 2,174,233 |
| Bundled JavaScript | 1 | 1,410,148 | 1,410,148 |
| Other assets | 3 | 3,458 | 3,984 |
| Package metadata | 63 | 16,684 | 62,604 |
| Manifest | 1 | 2,747 | 10,360 |
| Remaining packaged files | 132 | 138,342 | 274,944 |
| Payload total | 1,102 | 26,212,488 | 39,776,653 |

The remaining 265,254 bytes are archive, signing and alignment overhead. The
payload and overhead sum exactly to the APK file size; the overhead was not
attributed to individual structures. Expanded ZIP bytes are not installed size.

Native libraries account for about 58% of this APK. The largest are
`libreactnative.so` at 6,985,168 bytes, `libhermesvm.so` at 2,477,320 bytes and
`libexpo-modules-core.so` at 1,457,424 bytes. Native libraries and the JavaScript
bundle are stored without ZIP compression in this artifact. This observation
does not justify changing native packaging or removing framework libraries.

## Change from the preceding build

The APK grew by 16,556 bytes, about 0.063%. Stored payload grew by 9,784 bytes:
9,610 bytes across the two DEX files, 172 bytes in the JavaScript bundle and two
bytes across the two baseline-profile entries. Archive/signing/alignment overhead
grew by 6,772 bytes. The file count and native-library ABI inventory stayed the
same; no new asset or library entry was added.

All category totals and the complete per-entry comparison are retained privately.
The comparison uses ZIP size, compression and CRC metadata; it does not treat
CRC equality as cryptographic proof that individual payloads are identical.
Independent `unzip -l` totals matched the file counts and expanded-byte sums for
both APKs. Inspection read ZIP metadata without extracting or rebuilding either
artifact.

## Budget and remaining measurements

The [bounded reader](BOUNDED_READING.md) still permits one page of at most 30 root
posts or one post, a 2 MiB native response bound and no persisted post/feed body
cache. Those are source-level retention rules, not a measured memory ceiling.
The [diagnostic guide](DIAGNOSTICS.md) keeps native measurements separate from
JavaScript export sizes.

Use this identified APK as a comparison baseline when a new native build is
required. An accepted release candidate still needs device-specific Play delivery
and install measurements, cold start, scrolling, memory, cache/low-storage,
network and battery evidence on supported hardware. APK Analyzer's
[download-size estimate](https://developer.android.com/tools/apkanalyzer) is a
separate calculation; it was not run here and is not actual Play split delivery.
No release-size cap, performance improvement, physical-device acceptance or store
readiness is inferred from this archive report. Security and signing gates remain.
