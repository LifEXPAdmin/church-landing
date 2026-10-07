package expo.modules.gcnativejson

import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

class GCNativeJsonRequest : Record {
  @Field var url: String = ""
  @Field var method: String = ""
  @Field var headers: Map<String, String> = emptyMap()
  @Field var body: String? = null
}

class GCNativeJsonModule : Module() {
  private val transport = GCJSONTransport()
  override fun definition() = ModuleDefinition {
    Name("GCNativeJson")
    AsyncFunction("initialize") { environment: String, origin: String, promise: Promise ->
      transport.initialize(environment, origin, promise)
    }
    AsyncFunction("reserve") { id: String, promise: Promise -> transport.reserve(id, promise) }
    AsyncFunction("send") { id: String, request: GCNativeJsonRequest, promise: Promise ->
      transport.send(id, GCJSONRequest(request.url, request.method, request.headers.toMap(), request.body), promise)
    }
    AsyncFunction("cancel") { id: String, promise: Promise -> transport.cancel(id); promise.resolve() }
    OnDestroy { transport.close() }
  }
}
