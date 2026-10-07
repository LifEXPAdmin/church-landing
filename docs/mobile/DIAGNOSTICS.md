# Local development diagnostics

The development preview has an explicit diagnostic check. It deliberately fails
a local operation and produces one flat report with a fixed code, app version,
variant, source base/state and platform version. Android's platform version is the
API level; iOS supplies its OS version string. Missing or invalid metadata is
reported as unavailable, never invented.

Only pressing the diagnostic button creates a report. One report stays in the
mounted component's memory until replaced, cleared or unmounted. There is no file,
database, queue, console log, account identifier or network sender. The selectable
text can be inspected locally. No telemetry provider, subscription or production
consent decision has been introduced.

The projector accepts build metadata, not raw exceptions or user content. It
constructs an immutable record of known fields, bounds strings and validates
formats. It never spreads, stringifies or retains the input object. Error messages,
stacks, causes, URLs, tokens, request/response bodies, prayer and message content
are not report fields. This follows the existing website CSP report's projection
principle; its browser-specific endpoint and database limiter are not a mobile
crash service.

## Source provenance

The guarded launcher reads the actual Git HEAD, working-tree state and selected
app configuration before starting Metro or exporting. Only four validated public
values are passed through `EXPO_PUBLIC_` variables. It also pins the child process's
`APP_VARIANT` to that same selection before Expo loads dotenv. Select staging by
setting `APP_VARIANT=staging` in the launcher's shell; otherwise it uses development.
A dotenv file cannot silently change the variant after the stamp was captured.
The hosted export uses the same reader. No filesystem path, Git status text, credential or private configuration
is put in those values. Expo requires static dotted environment references for
[bundle substitution](https://docs.expo.dev/guides/environment-variables/).

`sourceBase` is the commit at capture time. `clean` means the capture found no
working-tree changes; `modified` requires the accompanying changed-file receipt.
A live Metro session always says `mutable` because it can serve later edits.
Restart that session after a checkpoint to refresh its base metadata. Missing
metadata stays `unknown`; a source reference is not proof of deployment, signing,
native installation or the exact files served by a live development session.

## Verification and remaining acceptance

The diagnostic UI is conditionally required under `__DEV__`. Non-development
exports must be checked to exclude its prompt and synthetic-probe code. The
current app still contains the separate fictional journey and rejects production
configuration; this diagnostic preparation does not make a production artifact.

Tests exercise synthetic failure, forbidden-field omission, hostile serialization,
oversized metadata, changing getters, immutable results, dotenv precedence and
platform/source-state distinctions.
An installed Android/iOS build must still exercise the actual button, report
metadata and clear behavior. This is not native crash-handler or fatal-signal
coverage and does not suppress framework, OS or other development logs.

Real error capture awaits the accepted session/runtime integration and its own
privacy review. Measure startup, memory, network, native download/install size and
low-storage behavior on identified builds/devices. JavaScript export byte counts
are separate evidence. Do not infer native size or performance improvements from
this report or introduce a provider/retention policy without its required gates.
