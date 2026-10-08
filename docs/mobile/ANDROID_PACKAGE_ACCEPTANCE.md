# Android native package checks

The development APK currently passes native ZIP and LOAD alignment checks but
has 12 native libraries that fail the separate 16 KiB RELRO-end check. This is
an identified package finding, not an observed crash. Native compatibility and
release acceptance remain open.

## Repeatable structural inspection

Use the standard-library Python inspector on an explicitly identified APK:

```sh
python3 -B mobile/scripts/verify-android-package.py \
  --apk /absolute/path/to/identified.apk \
  --sha256 EXPECTED_LOWERCASE_SHA256
```

It reads the artifact without extracting files, changing it or invoking its code.
It checks the expected SHA-256 before and after inspection and emits JSON.
Exit 0 means the checked boundaries passed, exit 1 reports alignment findings,
and exit 2 rejects invalid or unsupported input. Preserve the exit code when
saving output; a generated JSON report does not imply a passing result.

The inspector covers uncompressed standard `lib/<abi>/*.so` entries for ARM64
and x86-64, matching the current build's native packaging.
It separately reports stored ZIP payload alignment, ELF LOAD alignment and
virtual-address congruence, and each GNU_RELRO segment's end alignment.
Compressed libraries require separate SDK inspection and are rejected before
inflation. Missing RELRO is
reported explicitly and is not a security-hardening pass. Unsupported ABIs,
duplicate paths, malformed headers, invalid ranges, CRC failures and exceeded
inspection bounds are rejected. The central directory's bytes and actual record
count are checked before allocating ZIP entry objects. Bounds are 512 MiB per
APK, 8 MiB of central-directory data, 10,000 ZIP entries, 128 native libraries,
64 MiB per library and 256 MiB total native payload. ZIP64 and multi-disk archives
require separate tooling. Stored sizes and actual returned bytes must agree.

Run the focused synthetic binary regressions with a task-owned temporary folder:

```sh
TMPDIR=/absolute/path/to/existing/task-temp \
  python3 -B mobile/tests/android-package.test.py
```

This manual Python check adds no mobile runtime dependency and does not replace
the guarded Android build or existing package-audit/signing checks. It is not
automatically invoked by the JavaScript source-test command. Keep it separate
from the website and shared backend verification.

## Identified development artifact, 8 October 2026

The [feed acceptance](ANDROID_FEED_ACCEPTANCE.md) APK was built from clean
`7443e1282ef01d7c9750ee930e70047924d92ee7`. It is 26,482,158 bytes with SHA-256
`0c1400972683740380101b0af7b17f686c7308ff194fb740ce8a87fdf7bb7c6f`.
It is a development-signed ARM64 package, not a Play release candidate.

Android SDK build-tools 36 `zipalign -c -P 16 -v 4` passed. The installed
NDK `27.1.12297006` `llvm-readelf -Wl` output independently confirmed every
inspected LOAD/RELRO program-header field. Native library hashes matched the
inspector's output. The retained APK hash remained unchanged.

All 15 libraries have aligned stored ZIP payloads and LOAD alignment of 16,384.
Three have aligned RELRO ends: `libexpo-modules-core.so`,
`libreact_codegen_safeareacontext.so` and `libreactnative.so`.
The other libraries have these nonzero RELRO-end remainders modulo 16,384:

| Libraries | Remainder in bytes |
| --- | ---: |
| libappmodules.so, libhermesvm.so, libjsi.so | 4,096 |
| libgifimage.so, libhermestooling.so, libimagepipeline.so, libnative-filters.so, libstatic-webp.so | 8,192 |
| libc++_shared.so, libfbjni.so, libnative-imagetranscoder.so, libzstd-kmp.so | 12,288 |

The inspector correctly returns exit 1 for this artifact. Raw SDK output,
per-library hashes, all program headers and the cross-check are retained privately.
No binary, linker option, native library, dependency or application source was
changed to conceal these findings.

The failing APK entries match the retained Gradle stripped outputs by SHA-256.
The corresponding merged inputs also match these cached build inputs:

| Failing input group | Matching origin |
| --- | --- |
| appmodules | Local CMake application output |
| C++ shared runtime | Local CMake copy and the NDK 27.1.12297006 sysroot library |
| fbjni | fbjni 0.7.0 and react-android 0.86.3 contain the same matching bytes |
| hermestooling and jsi | react-android 0.86.3 |
| hermesvm | hermes-android 250829098.0.17 |
| gifimage, imagepipeline, native-filters, native-imagetranscoder and static-webp | Their respective Fresco 3.6.0 native artifacts |
| zstd-kmp | zstd-kmp-android 0.4.0 |

These are exact endpoint hash matches, not a reproduced strip transformation
or a unique-origin claim where multiple archives contain matching bytes.

## Repair and acceptance boundary

Android's current [16 KiB guidance](https://developer.android.com/guide/practices/page-sizes#check-the-relro-security-flag)
checks `(VirtAddr + MemSiz) % 0x4000 == 0` separately from ZIP/LOAD alignment.
Its NDK r27-and-earlier guidance includes both maximum and common page-size
linker settings. Prebuilt libraries need separate compatible inputs; changing
only this app's linker flags cannot repair those packaged files.

Next, confirm compatible replacements for the identified prebuilt inputs with
the shared dependency owner, repair the local-build inputs, and inspect the
resulting identified package again. Avoid a blind toolchain or framework upgrade.
Then run the app in a confirmed 16 KiB environment and record `getconf PAGE_SIZE`
alongside native lifecycle and journey evidence. Earlier API-level tests do not
by themselves prove the guest memory page size or 16 KiB compatibility.

These checks do not verify APK signatures, an App Bundle's configuration or
Play-generated splits, executable behavior, real-account data flows, privacy
disclosures, device performance or store approval. A release candidate still
needs those separate proofs, current submission requirements and all existing
security, identity and signing gates.
