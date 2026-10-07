# Native request transport

The native adapter consumes the canonical `@godschurches/shared-core` request
executor and API schemas. The current fictional app does not activate this
adapter. The local Expo module supplies prepared URLSession and OkHttp ports;
native binary, real-network and device acceptance remain open. Passing the
JavaScript checks does not establish those gates.

## Implemented preparation

`mobile/src/platform/request-adapter.ts` accepts one fixed development or staging
HTTPS origin and an injected native wire. It captures a private owner, local
generation and credential together. The adapter checks all three before dispatch,
after the wire resolves and before consuming the response. Normal requests use
only the captured bearer and expected-account header. Initial password issuance
uses the canonical one-shot command with no bearer, cookie, Origin or existing
account header. Neither the adapter nor its typed consumer retries a request.

Requests send `X-API-Version: 1` and require the same response version, consuming
the canonical API compatibility receipt. No platform, build or minimum-binary
header is invented. The path allowlist contains the initial session and read routes. Request
and response limits come from the canonical contract: 16 KiB requests, 128-byte
session activity/logout requests and 2 MiB responses, counted as UTF-8 bytes.
The adapter allows four simultaneous wire calls and passes a 15-second deadline.
It rejects redirects, cacheable replies, non-JSON content, malformed JSON, account
changes and late responses after cancellation. Failure messages and clock errors
are sanitized; server Retry-After remains a hint for explicit recovery.

`mobile/src/session/native-client.ts` supplies typed session, activity, logout,
capability, feed and post consumers. Schema, envelope, viewer and error rules
remain in the shared package. The native layer contains no parallel server
authorization or business policy. A separate captured source allows old-session
revocation after visible local state has already been cleared.

## Native wire implementation

`mobile/modules/gc-native-json` is an automatically discovered local Expo module.
It uses the existing URLSession and React Native OkHttp dependencies. Importing
`native-json.native.ts` does not activate it; the app must explicitly create a
wire. The prepared ports apply these rules before passing responses to JavaScript:

- Permit only the configured HTTPS origin and reviewed requests. Do not follow
  redirects or downgrade TLS. Keep standard certificate verification.
- Use a dedicated client without cookies, cached responses or ambient HTTP
  credentials. Never log headers, bodies, tokens or credential-bearing URLs.
- Add no application retry loop and prevent follow-up replay of writes. Android requires
  one-shot request bodies as well as disabled connection-failure retries. A
  per-request network-interceptor guard also blocks automatic GET follow-ups.
  Numeric Retry-After overflow is rejected before the declared OkHttp version's
  internal follow-up parser can throw.
- Count decoded response bytes before retaining or bridging them. Cancel above
  2 MiB, reject malformed UTF-8 and close every response on success or failure.
- Bound native concurrent tasks and impose the 15-second native deadline even
  when JavaScript is suspended. Abort cancels the real native task. Complete
  exactly once, including failures before headers and during body consumption.
- Return only status, bounded content type/cache/retry headers and one bounded
  body string and API version. Do not expose arbitrary response headers or streaming objects.

For iOS, use a dedicated ephemeral URL session and explicitly set `urlCache`,
`httpCookieStorage` and `urlCredentialStorage` to `nil`. Ephemeral alone can use
in-memory stores. Reject redirects and avoid HTTP authentication credentials
at both task and session delegate entry points while preserving ordinary
server-trust validation. A streamed upload grants its body stream once and
refuses a second grant. Android uses a dedicated
uncached client, no cookie jar or authenticators, disabled redirects, finite
deadlines and one-shot bodies. No new networking library is needed.

URLSession can automatically retry idempotent reads internally, as described in
[Apple QA1941](https://developer.apple.com/library/archive/qa/qa1941/_index.html).
The prepared iOS port does not claim a switch that disables all internal GET
retries. Writes use non-idempotent POST with a single body-stream grant; dropped
response and server-observed dispatch counts remain required acceptance. Read
routes must remain side-effect free, including the GET activity check.

The bridge first pins one development/staging origin, then reserves an opaque
request ID before sending. Native reservations have a 15-second deadline even
before dispatch. Send never recreates a cancelled reservation. Started requests
retain their native slot until cancellation/completion is confirmed by the
network callback. JavaScript rejects immediately on abort and cancels a late
reservation again. Duplicate IDs cannot cancel another active JavaScript flight.
There is no body retry queue or background renewal loop.

The response cap bounds application-owned retained bytes. Foundation, OkHttp,
decoders and the bridge can maintain bounded copies or internal buffers; this
is not a measured process-wide memory ceiling. Android counts gzip-decoded bytes
and refuses unsupported residual content encodings. UTF-8 decoding rejects
malformed input. A prevented automatic GET follow-up becomes an unconfirmed
failure; it does not return the earlier 503 body.

## Local verification

The mobile tests cover bridge ordering, cancellation races, flight limits and
the canonical adapter/session journey using fictional ports. Use the shared
repository test loader for extensionless canonical imports:
`node --import ../tests/register.mjs --test --test-concurrency=1 tests/*.test.ts tests/*.test.mjs`
from `mobile`, or use `npm test`, which now applies that same loader.

`node mobile/scripts/check-native-json.mjs` verifies the prepared SSD and exclusive
machine-build claim before compiling Foundation policy/transport checks with the
Mac command-line Swift compiler. It uses `GC_MOBILE_VOLUME_UUID` and
`GC_MOBILE_WORKER` from the existing private workspace setup. Output is retained
under the task's generated directory. The fictional URLProtocol fixture makes
no network requests and changes no trust settings. These checks exercise macOS
Foundation, not the Expo wrapper or an iOS binary. Android compilation and the
resolved Gradle dependency graph require the configured Android toolchain.

The local Swift 6 compile passes with warnings treated as errors. Ten macOS
Foundation test groups cover request policy, single-use bodies, responses,
redirect refusal, cancellation and the native 15-second deadline. Cancellation
waits for the fictional request to start before cancelling, so that check proves
an active task was stopped. This evidence does not establish iOS or Android
binary acceptance.

Autolinking search and resolution can verify both native class registrations
without generating a new app project or installing dependencies. Podspec syntax
checking is separate from pod installation and native linking.

## Installed SDK findings

Source review used Expo 57.0.27, Expo Modules Core 57.0.21 and React Native 0.86.3.
Stock `expo/fetch` supports explicit cookie omission and redirect errors but does
not satisfy the full port:

- Its native request record omits the JavaScript cache option. Android inherits
  React Native's disk cache; iOS uses a default URL session.
- Android byte-array bodies are replayable. The declared OkHttp 4.9.2 retry
  implementation can repeat certain failed requests or HTTP follow-ups. Setting
  `retryOnConnectionFailure(false)` alone does not prevent every follow-up.
- The native response queues have no pre-buffer byte cap or bridge backpressure.
  A JavaScript accumulator limits accepted JSON, not peak native/bridge memory.
- Source inspection also found terminal-error risks around delayed iOS body
  consumption and Android partial body completion. These paths were not
  reproduced on a native runtime and are not claimed as measured failures.

The resolved Android dependency graph still needs verification. A
custom URL-session provider or OkHttp factory alone does not repair response
buffering and terminal-state behavior.

## Required acceptance

Use fictional canonical accounts on both platforms. Verify zero requests reach a
redirect destination; seeded cookies and HTTP-auth credentials are omitted;
password dispatch counts stay at one under dropped replies, 408 and 503 replies;
oversized, compressed and malformed responses fail before unbounded buffering;
and cancellation terminates requests before headers and during response bodies.
Verify deadlines while JavaScript is paused, bounded native flights, TLS failure,
account replacement and process/lifecycle interruption. A JavaScript export,
source review or mocked wire cannot substitute for this evidence.

References: [Apple credential storage](https://developer.apple.com/documentation/foundation/urlsessionconfiguration/urlcredentialstorage),
[Apple streamed body replay callback](https://developer.apple.com/documentation/foundation/urlsessiontaskdelegate/urlsession(_:task:neednewbodystream:)),
[Apple cache configuration](https://developer.apple.com/documentation/foundation/urlsessionconfiguration/urlcache),
[OkHttp 4.9.2 retry implementation](https://github.com/square/okhttp/blob/parent-4.9.2/okhttp/src/main/kotlin/okhttp3/internal/http/RetryAndFollowUpInterceptor.kt),
[OkHttp one-shot body contract](https://github.com/square/okhttp/blob/parent-4.9.2/okhttp/src/main/kotlin/okhttp3/RequestBody.kt).
