# Native request transport

The native adapter consumes the canonical `@godschurches/shared-core` request
executor and API schemas. The current fictional app does not activate this
adapter, and no real native wire implementation is supplied yet. Passing these
JavaScript checks does not establish native network or device acceptance.

## Implemented preparation

`mobile/src/platform/request-adapter.ts` accepts one fixed development or staging
HTTPS origin and an injected native wire. It captures a private owner, local
generation and credential together. The adapter checks all three before dispatch,
after the wire resolves and before consuming the response. Normal requests use
only the captured bearer and expected-account header. Initial password issuance
uses the canonical one-shot command with no bearer, cookie, Origin or existing
account header. Neither the adapter nor its typed consumer retries a request.

The path allowlist contains the initial native session and read routes. Request
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

## Native wire requirements

Implement the injected port with the existing URLSession and OkHttp dependencies.
It must enforce these rules before passing data to JavaScript:

- Permit only the configured HTTPS origin and reviewed requests. Do not follow
  redirects or downgrade TLS. Keep standard certificate verification.
- Use a dedicated client without cookies, cached responses or ambient HTTP
  credentials. Never log headers, bodies, tokens or credential-bearing URLs.
- Disable connection retries and follow-up replay of writes. Android requires
  one-shot request bodies as well as disabled connection-failure retries.
- Count decoded response bytes before retaining or bridging them. Cancel above
  2 MiB, reject malformed UTF-8 and close every response on success or failure.
- Bound native concurrent tasks and impose the 15-second native deadline even
  when JavaScript is suspended. Abort cancels the real native task. Complete
  exactly once, including failures before headers and during body consumption.
- Return only status, bounded content type/cache/retry headers and one bounded
  body string. Do not expose arbitrary response headers or streaming objects.

For iOS, use a dedicated ephemeral URL session and explicitly set `urlCache`,
`httpCookieStorage` and `urlCredentialStorage` to `nil`. Ephemeral alone can use
in-memory stores. Reject redirects and avoid HTTP authentication credentials
while preserving ordinary server-trust validation. Android should use a dedicated
uncached client, no cookie jar or authenticators, disabled redirects, finite
deadlines and one-shot bodies. No new networking library is needed.

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

The eventual resolved Android dependency graph still needs verification. A
custom URL-session provider or OkHttp factory alone does not repair response
buffering and terminal-state behavior. The strict native port remains necessary.

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
[Apple cache configuration](https://developer.apple.com/documentation/foundation/urlsessionconfiguration/urlcache),
[OkHttp 4.9.2 retry implementation](https://github.com/square/okhttp/blob/parent-4.9.2/okhttp/src/main/kotlin/okhttp3/internal/http/RetryAndFollowUpInterceptor.kt),
[OkHttp one-shot body contract](https://github.com/square/okhttp/blob/parent-4.9.2/okhttp/src/main/kotlin/okhttp3/RequestBody.kt).
