import Foundation

private let origin = "https://fictional.example.invalid"
private let headers = ["Accept": "application/json", "Cache-Control": "no-store", "Pragma": "no-cache", "X-API-Version": "1"]
private func id(_ number: Int) -> String { String(format: "00000000-0000-4000-8000-%012d", number) }
private func request(_ mode: String = "success") -> GCJSONRequest {
  GCJSONRequest(url: origin + "/api/platform/v1/session?fixture=" + mode, method: "GET", headers: headers, body: nil)
}
private func expect(_ value: @autoclosure () -> Bool, _ message: String) {
  if !value() { fatalError(message) }
}
private func rejects(_ action: () throws -> Void) -> Bool { do { try action(); return false } catch { return true } }

private final class ChallengeSender: NSObject, URLAuthenticationChallengeSender {
  func use(_ credential: URLCredential, for challenge: URLAuthenticationChallenge) {}
  func continueWithoutCredential(for challenge: URLAuthenticationChallenge) {}
  func cancel(_ challenge: URLAuthenticationChallenge) {}
}

/// Intercepts fictional URLs inside Foundation. No listener, TLS trust change or
/// network request. This tests macOS Foundation, not an iOS device/Expo bridge.
private final class FictionalProtocol: URLProtocol, @unchecked Sendable {
  static let cancelStarted = DispatchSemaphore(value: 0)
  static let cancelStopped = DispatchSemaphore(value: 0)
  private var mode: String { URLComponents(url: request.url!, resolvingAgainstBaseURL: false)?.queryItems?.first?.value ?? "success" }
  override class func canInit(with request: URLRequest) -> Bool { request.url?.host == "fictional.example.invalid" }
  override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
  override func startLoading() {
    if mode == "hold-cancel" { Self.cancelStarted.signal(); return }
    if mode == "hold-deadline" { return }
    if mode == "early-error" { client?.urlProtocol(self, didFailWithError: URLError(.networkConnectionLost)); return }
    let response = HTTPURLResponse(url: request.url!, statusCode: mode == "redirect" ? 302 : 200, httpVersion: "HTTP/1.1",
      headerFields: ["Content-Type": "application/json", "Cache-Control": mode == "cacheable" ? "public" : "no-store", "X-API-Version": "1"])!
    client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
    if mode == "oversized" {
      let chunk = Data(repeating: 65, count: 512 * 1024)
      for _ in 0..<5 { client?.urlProtocol(self, didLoad: chunk) }
    } else { client?.urlProtocol(self, didLoad: mode == "invalid-utf8" ? Data([0xc3, 0x28]) : Data("{}".utf8)) }
    if mode == "partial-error" { client?.urlProtocol(self, didFailWithError: URLError(.networkConnectionLost)) }
    else { client?.urlProtocolDidFinishLoading(self) }
  }
  override func stopLoading() { if mode == "hold-cancel" { Self.cancelStopped.signal() } }
}

@main private struct NativeJSONChecks {
  static func initialize(_ transport: GCJSONTransport, _ environment: String = "staging", _ value: String = origin) async -> Bool {
    await withCheckedContinuation { continuation in transport.initialize(environment: environment, origin: value) { continuation.resume(returning: $0) } }
  }
  static func reserve(_ transport: GCJSONTransport, _ value: String) async -> Bool {
    await withCheckedContinuation { continuation in transport.reserve(value) { continuation.resume(returning: $0) } }
  }
  static func send(_ transport: GCJSONTransport, _ value: String, _ request: GCJSONRequest) async -> Result<GCJSONReply, GCJSONFailure> {
    await withCheckedContinuation { continuation in transport.send(value, request: request) { continuation.resume(returning: $0) } }
  }
  static func cancel(_ transport: GCJSONTransport, _ value: String) async {
    await withCheckedContinuation { continuation in transport.cancel(value) { continuation.resume() } }
  }
  static func succeeded(_ result: Result<GCJSONReply, GCJSONFailure>) -> Bool { if case .success = result { return true }; return false }
  static func main() async throws {
    var groups = 0
    let validOrigin = try GCJSONPolicy.origin(environment: "staging", value: origin)
    expect(validOrigin == origin, "valid origin")
    for value in [origin + "/", "http://fictional.example.invalid", origin + "#fragment", "https://user@fictional.example.invalid"] {
      expect(rejects { _ = try GCJSONPolicy.origin(environment: "staging", value: value) }, "unsafe origin")
    }
    expect(rejects { _ = try GCJSONPolicy.origin(environment: "production", value: origin) }, "production activation")
    groups += 1
    _ = try GCJSONPolicy.request(request(), origin: origin)
    for path in ["/api/platform/v1/session/../auth/password", "/api/platform/v1/%2e%2e/session", "/api/platform/v1/posts/a%2fb", "/api/platform/v1/posts/a%5cb", "/api/platform/v1/account", "/api/platform/v1/session#x"] {
      expect(rejects { _ = try GCJSONPolicy.request(GCJSONRequest(url: origin + path, method: "GET", headers: headers, body: nil), origin: origin) }, "unsafe path")
    }
    expect(rejects { _ = try GCJSONPolicy.request(GCJSONRequest(url: "https://other.example.invalid/api/platform/v1/session", method: "GET", headers: headers, body: nil), origin: origin) }, "foreign origin")
    for key in ["Cookie", "Origin", "authorization"] {
      var injected = headers; injected[key] = "private"
      expect(rejects { _ = try GCJSONPolicy.request(GCJSONRequest(url: request().url, method: "GET", headers: injected, body: nil), origin: origin) }, "ambient header")
    }
    groups += 1
    var postHeaders = headers; postHeaders["Content-Type"] = "application/json"
    let postURL = origin + "/api/platform/v1/auth/password"
    _ = try GCJSONPolicy.request(GCJSONRequest(url: postURL, method: "POST", headers: postHeaders, body: String(repeating: "é", count: 8192)), origin: origin)
    expect(rejects { _ = try GCJSONPolicy.request(GCJSONRequest(url: postURL, method: "POST", headers: postHeaders, body: String(repeating: "é", count: 8193)), origin: origin) }, "UTF8 request cap")
    postHeaders["Authorization"] = "Bearer " + String(repeating: "a", count: 43); postHeaders["X-Expected-Account"] = "fictional"
    expect(rejects { _ = try GCJSONPolicy.request(GCJSONRequest(url: postURL, method: "POST", headers: postHeaders, body: "{}"), origin: origin) }, "password must be guest")
    expect(rejects { _ = try GCJSONPolicy.request(GCJSONRequest(url: origin + "/api/platform/v1/session/logout", method: "POST", headers: postHeaders, body: String(repeating: "x", count: 129)), origin: origin) }, "session request cap")
    groups += 1
    var bytes = Data(repeating: 65, count: GCJSONPolicy.maximumBytes - 1)
    try GCJSONPolicy.append(Data([65]), to: &bytes)
    expect(rejects { try GCJSONPolicy.append(Data([65]), to: &bytes) }, "response cap")
    expect(bytes.count == GCJSONPolicy.maximumBytes, "overflow not retained")
    expect(rejects { _ = try GCJSONPolicy.decode(Data([0xc3, 0x28])) }, "strict UTF8")
    let body = GCJSONOneShotBody("fictional secret")
    expect(body.take() != nil && body.take() == nil, "upload replay denied")
    groups += 1
    let config = URLSessionConfiguration.ephemeral; config.protocolClasses = [FictionalProtocol.self]
    let transport = GCJSONTransport(configuration: config)
    defer { transport.close() }
    let challengeSession = URLSession(configuration: .ephemeral)
    defer { challengeSession.invalidateAndCancel() }
    let challengeTask = challengeSession.dataTask(with: URL(string: origin)!) // Never resumed.
    for method in [NSURLAuthenticationMethodServerTrust, NSURLAuthenticationMethodClientCertificate, NSURLAuthenticationMethodNTLM, NSURLAuthenticationMethodHTTPBasic] {
      let protection = URLProtectionSpace(host: "fictional.example.invalid", port: 443, protocol: "https", realm: nil, authenticationMethod: method)
      let challenge = URLAuthenticationChallenge(protectionSpace: protection, proposedCredential: nil, previousFailureCount: 0, failureResponse: nil, error: nil, sender: ChallengeSender())
      let expected: URLSession.AuthChallengeDisposition = method == NSURLAuthenticationMethodServerTrust ? .performDefaultHandling : .cancelAuthenticationChallenge
      var connection: URLSession.AuthChallengeDisposition?
      var task: URLSession.AuthChallengeDisposition?
      transport.urlSession(challengeSession, didReceive: challenge) { disposition, credential in
        connection = disposition; expect(credential == nil, "no connection credential")
      }
      transport.urlSession(challengeSession, task: challengeTask, didReceive: challenge) { disposition, credential in
        task = disposition; expect(credential == nil, "no task credential")
      }
      expect(connection == expected && task == expected, "both authentication challenge entry points guarded")
    }
    groups += 1
    let uninitialized = await reserve(transport, id(1)); expect(!uninitialized, "initialization required")
    let initialized = await initialize(transport); expect(initialized, "initialize")
    let same = await initialize(transport); expect(same, "same config idempotent")
    let changed = await initialize(transport, "development"); expect(!changed, "config pinned")
    let badID = await reserve(transport, "bad"); expect(!badID, "UUID required")
    groups += 1
    for number in 1...4 { let ok = await reserve(transport, id(number)); expect(ok, "reserve four") }
    let fifth = await reserve(transport, id(5)); expect(!fifth, "native slot bound")
    let duplicate = await reserve(transport, id(1)); expect(!duplicate, "duplicate reservation")
    await cancel(transport, id(1))
    let afterCancel = await send(transport, id(1), request()); expect(!succeeded(afterCancel), "cancelled reservation cannot dispatch")
    let replacement = await reserve(transport, id(5)); expect(replacement, "unused slot released")
    for number in 2...5 { await cancel(transport, id(number)) }
    groups += 1
    var sequence = 10
    for mode in ["success", "cacheable", "redirect", "invalid-utf8", "oversized", "early-error", "partial-error"] {
      let value = id(sequence); sequence += 1
      let ok = await reserve(transport, value); expect(ok, "reserve response case")
      let reply = await send(transport, value, request(mode))
      expect(succeeded(reply) == (mode == "success"), "response case " + mode)
      if case .success(let response) = reply { expect(response.body == "{}", "complete JSON body") }
    }
    groups += 1
    let cancelID = id(30)
    let reserved = await reserve(transport, cancelID); expect(reserved, "reserve held call")
    let pending = Task { await send(transport, cancelID, request("hold-cancel")) }
    let started = await Task.detached { FictionalProtocol.cancelStarted.wait(timeout: .now() + 3) == .success }.value
    expect(started, "held request reached the actual URLProtocol before cancellation")
    await cancel(transport, cancelID)
    let cancelled = await pending.value; expect(!succeeded(cancelled), "native cancellation completes held request")
    let stopped = await Task.detached { FictionalProtocol.cancelStopped.wait(timeout: .now() + 3) == .success }.value
    expect(stopped, "cancellation stops the native protocol")
    groups += 1
    let deadlineID = id(31)
    let unusedDeadlineID = id(32)
    let unusedReserved = await reserve(transport, unusedDeadlineID); expect(unusedReserved, "reserve unused deadline")
    let deadlineReserved = await reserve(transport, deadlineID); expect(deadlineReserved, "reserve deadline call")
    let start = ContinuousClock.now
    let expired = await send(transport, deadlineID, request("hold-deadline"))
    let duration = start.duration(to: .now)
    expect(!succeeded(expired) && duration >= .seconds(14) && duration < .seconds(20), "native deadline without JS")
    let unusedExpired = await send(transport, unusedDeadlineID, request())
    expect(!succeeded(unusedExpired), "expired reservation cannot dispatch later")
    groups += 1
    print("Passed \(groups) macOS Foundation policy/transport groups. No iOS, Android, TLS or Expo bridge acceptance.")
  }
}
