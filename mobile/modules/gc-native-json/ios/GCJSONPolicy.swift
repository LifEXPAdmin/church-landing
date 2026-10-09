import Foundation

enum GCJSONFailure: Error { case unconfirmed }

struct GCJSONRequest: Sendable {
  let url: String
  let method: String
  let headers: [String: String]
  let body: String?
}

struct GCJSONHead: Sendable {
  let status: Int
  let contentType: String
  let cacheControl: String
  let retryAfter: String?
}

struct GCJSONReply: Sendable {
  let head: GCJSONHead
  let body: String
}

enum GCJSONPolicy {
  static let maximumBytes = 2 * 1024 * 1024
  static let deadline: TimeInterval = 15
  static let maximumFlights = 4
  static func matches(_ value: String, _ pattern: String) -> Bool {
    value.range(of: pattern, options: .regularExpression) != nil
  }
  static func validID(_ value: String) -> Bool {
    matches(value, "\\A[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\\z")
  }
  static func origin(environment: String, value: String) throws -> String {
    guard ["development", "staging"].contains(environment),
      let parts = URLComponents(string: value), parts.scheme == "https",
      let host = parts.host, !host.isEmpty, parts.user == nil, parts.password == nil,
      parts.path.isEmpty, parts.query == nil, parts.fragment == nil,
      parts.url?.absoluteString == value, !value.contains("\\"),
      !value.unicodeScalars.contains(where: { $0.value < 33 || $0.value > 126 })
    else { throw GCJSONFailure.unconfirmed }
    return value
  }
  static func request(_ input: GCJSONRequest, origin: String) throws -> URLRequest {
    guard input.url.utf8.count <= 8192, input.url.hasPrefix(origin + "/"),
      let parts = URLComponents(string: input.url), let url = parts.url,
      parts.user == nil, parts.password == nil, parts.fragment == nil,
      !input.url.contains("\\"), !input.url.unicodeScalars.contains(where: { $0.value < 33 || $0.value > 126 })
    else { throw GCJSONFailure.unconfirmed }
    // Inspect encoded segments before Foundation can normalize traversal.
    for segment in parts.percentEncodedPath.split(separator: "/", omittingEmptySubsequences: false) {
      guard let decoded = String(segment).removingPercentEncoding,
        decoded != ".", decoded != "..", !decoded.contains("/"), !decoded.contains("\\"),
        !decoded.unicodeScalars.contains(where: { $0.value < 32 }) else { throw GCJSONFailure.unconfirmed }
    }
    let path = parts.percentEncodedPath
    let prefix = "/api/platform/v1/"
    let issuance = path == prefix + "auth/password"
    let post = input.method == "POST"
    let like = matches(path, "\\A/api/platform/v1/posts/[A-Za-z0-9_-]{1,100}/like\\z")
    let preferences = path == prefix + "reaction-preferences"
    guard !(like || preferences) || parts.query == nil else { throw GCJSONFailure.unconfirmed }
    let gets = ["capabilities", "session", "session/activity", "feed", "churches"].map { prefix + $0 }
    guard post ? (parts.query == nil && (like || preferences || [prefix + "auth/password", prefix + "session/activity", prefix + "session/logout"].contains(path))) :
      (input.method == "GET" && (like || preferences || gets.contains(path) || matches(path, "\\A/api/platform/v1/(posts|profiles|churches)/[A-Za-z0-9_-]{1,100}\\z")))
    else { throw GCJSONFailure.unconfirmed }
    let allowed: Set<String> = ["Accept", "Cache-Control", "Pragma", "X-API-Version", "Content-Type", "Authorization", "X-Expected-Account"]
    guard Set(input.headers.keys).isSubset(of: allowed),
      input.headers["Accept"] == "application/json", input.headers["Cache-Control"] == "no-store",
      input.headers["Pragma"] == "no-cache", input.headers["X-API-Version"] == "1",
      input.headers.values.allSatisfy({ $0.utf8.count <= 256 && matches($0, "\\A[\\x20-\\x7e]+\\z") })
    else { throw GCJSONFailure.unconfirmed }
    let token = input.headers["Authorization"], owner = input.headers["X-Expected-Account"]
    guard (token == nil && owner == nil) || (token.map { matches($0, "\\ABearer [A-Za-z0-9_-]{43}\\z") } == true &&
      owner.map { matches($0, "\\A[A-Za-z0-9_-]{1,100}\\z") } == true),
      !issuance || token == nil, !post || issuance || token != nil,
      !preferences || token != nil else { throw GCJSONFailure.unconfirmed }
    if post {
      guard let body = input.body, body.utf8.count <= (path.hasPrefix(prefix + "session/") ? 128 : 16384),
        input.headers["Content-Type"] == "application/json" else { throw GCJSONFailure.unconfirmed }
    } else if input.body != nil || input.headers["Content-Type"] != nil { throw GCJSONFailure.unconfirmed }
    var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: deadline)
    request.httpMethod = input.method
    request.httpShouldHandleCookies = false
    request.allHTTPHeaderFields = input.headers
    if let body = input.body { request.setValue(String(body.utf8.count), forHTTPHeaderField: "Content-Length") }
    return request
  }
  static func head(_ response: HTTPURLResponse) throws -> GCJSONHead {
    guard (200...599).contains(response.statusCode), !(300...399).contains(response.statusCode),
      response.value(forHTTPHeaderField: "X-API-Version") == "1",
      let type = response.value(forHTTPHeaderField: "Content-Type"), type.utf8.count <= 128,
      matches(type.lowercased(), "\\Aapplication/json(?:\\s*;\\s*charset=utf-8)?\\z"),
      let cache = response.value(forHTTPHeaderField: "Cache-Control"), cache.utf8.count <= 256,
      cache.split(separator: ",").contains(where: { $0.trimmingCharacters(in: .whitespaces).lowercased() == "no-store" })
    else { throw GCJSONFailure.unconfirmed }
    let retry = response.value(forHTTPHeaderField: "Retry-After")
    return GCJSONHead(status: response.statusCode, contentType: type, cacheControl: cache,
      retryAfter: retry.flatMap { $0.utf8.count <= 128 && matches($0, "\\A[\\x20-\\x7e]+\\z") ? $0 : nil })
  }
  static func append(_ chunk: Data, to body: inout Data) throws {
    guard chunk.count <= maximumBytes - body.count else { throw GCJSONFailure.unconfirmed }
    body.append(chunk)
  }
  static func decode(_ body: Data) throws -> String {
    guard body.count <= maximumBytes, let text = String(data: body, encoding: .utf8) else { throw GCJSONFailure.unconfirmed }
    return text
  }
}

/// URLSession asks for the initial stream and again if it wants to replay a body.
/// Releasing the stored data on first use makes a second grant impossible.
final class GCJSONOneShotBody {
  private var bytes: Data?
  init(_ value: String) { bytes = Data(value.utf8) }
  func take() -> InputStream? {
    guard let value = bytes else { return nil }
    bytes = nil
    return InputStream(data: value)
  }
}
