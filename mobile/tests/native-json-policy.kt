package expo.modules.gcnativejson

import okio.Buffer

// Assertion entrypoint compiled with the policy and the Android owner's already
// resolved OkHttp/Okio classpath. No JUnit, Expo runtime or network is required.
private const val origin = "https://fictional.example.invalid"
private const val likePath = "/api/platform/v1/posts/fixture/like"
private val headers = mapOf(
  "Accept" to "application/json", "Cache-Control" to "no-store", "Pragma" to "no-cache", "X-API-Version" to "1"
)
private val authenticated = headers + mapOf("Authorization" to "Bearer " + "a".repeat(43), "X-Expected-Account" to "fictional")
private val writing = authenticated + ("Content-Type" to "application/json")
private fun input(path: String = likePath, method: String = "GET", fields: Map<String, String> = authenticated, body: String? = null) =
  GCJSONRequest(origin + path, method, fields, body)
private fun rejects(message: String, action: () -> Unit) {
  check(runCatching(action).isFailure) { message }
}

private fun reactionPreferencesPolicyChecks() {
  val path = "/api/platform/v1/reaction-preferences"
  for (method in listOf("GET", "POST")) {
    val fields = if (method == "POST") writing else authenticated
    val body = if (method == "POST") "{}" else null
    val value = GCJSONPolicy.request(input(path, method, fields, body), origin)
    check(value.url.toString() == origin + path && value.method == method)
    check(value.header("Authorization") == authenticated["Authorization"] && value.header("X-Expected-Account") == "fictional")
    check(value.header("Cache-Control") == "no-store" && value.header("Cookie") == null)
    val guest = if (method == "POST") headers + ("Content-Type" to "application/json") else headers
    rejects("preferences require account") { GCJSONPolicy.request(input(path, method, guest, body), origin) }
    for (key in listOf("Authorization", "X-Expected-Account")) {
      rejects("preferences require both account headers") { GCJSONPolicy.request(input(path, method, fields - key, body), origin) }
    }
  }
  for (bad in listOf(
    "/api/platform/v1/reaction-preference", "/api/platform/v1/Reaction-preferences",
    "/api/platform/v1/%72eaction-preferences", "/api/platform/v1/reaction%2dpreferences",
    "$path/", "$path/extra", "$path?", "$path?copy=1", "$path?#fragment", "$path#fragment"
  )) {
    rejects("unsafe preference GET path") { GCJSONPolicy.request(input(bad), origin) }
    rejects("unsafe preference POST path") { GCJSONPolicy.request(input(bad, "POST", writing, "{}"), origin) }
  }
  for (method in listOf("PUT", "PATCH", "DELETE", "HEAD", "OPTIONS", "get", "post")) {
    rejects("unsupported preference method") { GCJSONPolicy.request(input(path, method), origin) }
  }
  rejects("preference GET has no body") { GCJSONPolicy.request(input(path, body = ""), origin) }
  rejects("preference GET has no body header") { GCJSONPolicy.request(input(path, fields = writing), origin) }
  rejects("preference POST requires body") { GCJSONPolicy.request(input(path, "POST", writing), origin) }
  for (body in listOf("x".repeat(16385), "é".repeat(8193))) {
    rejects("preference UTF8 byte cap") { GCJSONPolicy.request(input(path, "POST", writing, body), origin) }
  }
  val body = "é".repeat(8192)
  val maximum = GCJSONPolicy.request(input(path, "POST", writing, body), origin)
  check(maximum.body?.contentLength() == 16384L && maximum.body?.isOneShot() == true)
  val buffer = Buffer()
  maximum.body!!.writeTo(buffer)
  rejects("preference body cannot replay") { maximum.body!!.writeTo(buffer) }
  check(buffer.readUtf8() == body)
  val dispatch = maximum.tag(GCJSONDispatch::class.java)!!
  check(dispatch.take() && !dispatch.take())
}

fun main() {
  check(GCJSONPolicy.origin("staging", origin) == origin)
  for (id in listOf("a", "Ab_9-", "x".repeat(100))) {
    val target = "/api/platform/v1/posts/$id/like"
    val read = GCJSONPolicy.request(input(target), origin)
    val write = GCJSONPolicy.request(input(target, "POST", writing, "{}"), origin)
    check(read.url.toString() == origin + target && read.method == "GET")
    check(write.url.toString() == origin + target && write.method == "POST")
    check(write.header("Authorization") == authenticated["Authorization"])
    check(write.header("X-Expected-Account") == "fictional")
    check(write.body?.contentLength() == 2L && write.body?.isOneShot() == true)
  }
  val guest = GCJSONPolicy.request(input(fields = headers), origin)
  check(guest.header("Authorization") == null && guest.header("X-Expected-Account") == null)
  GCJSONPolicy.request(input("/api/platform/v1/feed?mode=latest"), origin)
  GCJSONPolicy.request(input("/api/platform/v1/posts/fixture?"), origin)
  for (path in listOf(
    "/api/platform/v1/posts//like", "/api/platform/v1/posts/" + "x".repeat(101) + "/like",
    "/api/platform/v1/posts/a.b/like", "/api/platform/v1/posts/é/like", "/api/platform/v1/posts/a%2Fb/like",
    "/api/platform/v1/posts/%61/like", "/api/platform/v1/posts/../like", "/api/platform/v1/posts/%2e/like",
    "/api/platform/v1/profiles/fixture/like", "/api/platform/v1/churches/fixture/like",
    "/api/platform/v1/posts/fixture/likes", "/api/platform/v1/posts/fixture/unlike", "$likePath/", "$likePath/extra",
    "$likePath?", "$likePath?copy=1", "$likePath?#fragment", "$likePath#fragment"
  )) {
    rejects("unsafe Like GET path") { GCJSONPolicy.request(input(path), origin) }
    rejects("unsafe Like POST path") { GCJSONPolicy.request(input(path, "POST", writing, "{}"), origin) }
  }
  for (method in listOf("PUT", "PATCH", "DELETE", "HEAD", "OPTIONS", "get", "post")) {
    rejects("unsupported Like method") { GCJSONPolicy.request(input(method = method), origin) }
  }
  for (key in listOf("Authorization", "X-Expected-Account", "X-API-Version", "Accept", "Cache-Control", "Pragma", "Content-Type")) {
    rejects("Like required header") { GCJSONPolicy.request(input(method = "POST", fields = writing - key, body = "{}"), origin) }
  }
  rejects("Like POST requires account") {
    GCJSONPolicy.request(input(method = "POST", fields = headers + ("Content-Type" to "application/json"), body = "{}"), origin)
  }
  for ((key, value) in listOf(
    "Cookie" to "private", "Origin" to origin, "authorization" to "private",
    "Authorization" to "Bearer short", "X-Expected-Account" to "wrong owner",
    "Content-Type" to "application/json; charset=utf-8", "X-API-Version" to "2"
  )) {
    rejects("Like header boundary") {
      GCJSONPolicy.request(input(method = "POST", fields = writing + (key to value), body = "{}"), origin)
    }
  }
  rejects("Like GET has no body") { GCJSONPolicy.request(input(body = ""), origin) }
  rejects("Like GET has no body header") { GCJSONPolicy.request(input(fields = writing), origin) }
  rejects("Like POST requires body") { GCJSONPolicy.request(input(method = "POST", fields = writing), origin) }
  for (body in listOf("x".repeat(16385), "é".repeat(8193))) {
    rejects("Like UTF8 byte cap") { GCJSONPolicy.request(input(method = "POST", fields = writing, body = body), origin) }
  }
  val body = "é".repeat(8192)
  val maximum = GCJSONPolicy.request(input(method = "POST", fields = writing, body = body), origin)
  check(maximum.body?.contentLength() == 16384L && maximum.body?.isOneShot() == true)
  val buffer = Buffer()
  maximum.body!!.writeTo(buffer)
  check(buffer.size == 16384L)
  rejects("one-shot body rejects replay") { maximum.body!!.writeTo(buffer) }
  check(buffer.readUtf8() == body)
  val dispatch = maximum.tag(GCJSONDispatch::class.java)!!
  check(dispatch.take() && !dispatch.take())
  check(GCJSONPolicy.MAXIMUM_BYTES == 2 * 1024 * 1024 && GCJSONPolicy.MAXIMUM_FLIGHTS == 4 && GCJSONPolicy.DEADLINE_SECONDS == 15L)
  reactionPreferencesPolicyChecks()
  println("Passed 7 Kotlin Like/preference policy groups. No Android binary, Expo bridge, TLS or network acceptance.")
}
