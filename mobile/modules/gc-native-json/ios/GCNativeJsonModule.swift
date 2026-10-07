import ExpoModulesCore

struct GCNativeJsonRequest: Record {
  @Field var url: String = ""
  @Field var method: String = ""
  @Field var headers: [String: String] = [:]
  @Field var body: String? = nil
}

public final class GCNativeJsonModule: Module {
  private let transport = GCJSONTransport()
  public func definition() -> ModuleDefinition {
    Name("GCNativeJson")
    AsyncFunction("initialize") { (environment: String, origin: String, promise: Promise) in
      self.transport.initialize(environment: environment, origin: origin) { ok in
        if ok { promise.resolve() } else { Self.reject(promise) }
      }
    }
    AsyncFunction("reserve") { (id: String, promise: Promise) in
      self.transport.reserve(id) { ok in if ok { promise.resolve() } else { Self.reject(promise) } }
    }
    AsyncFunction("send") { (id: String, request: GCNativeJsonRequest, promise: Promise) in
      self.transport.send(id, request: GCJSONRequest(url: request.url, method: request.method, headers: request.headers, body: request.body)) { result in
        switch result {
        case .failure: Self.reject(promise)
        case .success(let reply):
          promise.resolve(["status": reply.head.status, "apiVersion": "1", "contentType": reply.head.contentType,
            "cacheControl": reply.head.cacheControl, "retryAfter": reply.head.retryAfter as Any? ?? NSNull(), "body": reply.body] as [String: Any])
        }
      }
    }
    AsyncFunction("cancel") { (id: String, promise: Promise) in self.transport.cancel(id) { promise.resolve() } }
    OnDestroy { self.transport.close() }
  }
  private static func reject(_ promise: Promise) { promise.reject("E_UNCONFIRMED", "Native request could not be confirmed.") }
}
