package expo.modules.gcnativejson

import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Request
import okhttp3.RequestBody
import okhttp3.Response
import okio.BufferedSink
import java.io.IOException
import java.net.URI
import java.nio.ByteBuffer
import java.nio.charset.CodingErrorAction
import java.util.concurrent.atomic.AtomicBoolean

internal data class GCJSONRequest(val url: String, val method: String, val headers: Map<String, String>, val body: String?)

internal object GCJSONPolicy {
  const val MAXIMUM_BYTES = 2 * 1024 * 1024
  const val DEADLINE_SECONDS = 15L
  const val MAXIMUM_FLIGHTS = 4
  private val id = Regex("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}")
  private val ascii = Regex("[\\x20-\\x7e]+")
  private val prefix = "/api/platform/v1/"
  fun validID(value: String) = id.matches(value)
  fun origin(environment: String, value: String): String {
    val uri = URI(value)
    require(environment in setOf("development", "staging") && uri.scheme == "https" && !uri.host.isNullOrEmpty() &&
      uri.rawUserInfo == null && uri.rawPath.isEmpty() && uri.rawQuery == null && uri.rawFragment == null &&
      value.all { it.code in 33..126 } && !value.contains('\\'))
    return value
  }
  fun request(input: GCJSONRequest, origin: String): Request {
    require(input.url.length <= 8192 && input.url.startsWith("$origin/") && input.url.all { it.code in 33..126 } && !input.url.contains('\\'))
    val uri = URI(input.url)
    require(uri.rawUserInfo == null && uri.rawFragment == null)
    val path = uri.rawPath
    // Encoded segments cannot disguise traversal or separator characters.
    path.split('/').forEach { segment ->
      val decoded = java.net.URLDecoder.decode(segment.replace("+", "%2B"), "UTF-8")
      require(decoded != "." && decoded != ".." && decoded.none { it == '/' || it == '\\' || it.code < 32 })
    }
    val post = input.method == "POST"
    val issuance = path == prefix + "auth/password"
    val like = Regex("/api/platform/v1/posts/[A-Za-z0-9_-]{1,100}/like").matches(path)
    require(!like || uri.rawQuery == null)
    val gets = setOf("capabilities", "session", "session/activity", "feed", "churches").map { prefix + it }
    require(if (post) uri.rawQuery == null && (like || path in setOf(prefix + "auth/password", prefix + "session/activity", prefix + "session/logout"))
      else input.method == "GET" && (like || path in gets || Regex("/api/platform/v1/(posts|profiles|churches)/[A-Za-z0-9_-]{1,100}").matches(path)))
    val allowed = setOf("Accept", "Cache-Control", "Pragma", "X-API-Version", "Content-Type", "Authorization", "X-Expected-Account")
    val headers = input.headers
    require(allowed.containsAll(headers.keys) && headers["Accept"] == "application/json" && headers["Cache-Control"] == "no-store" &&
      headers["Pragma"] == "no-cache" && headers["X-API-Version"] == "1" && headers.values.all { it.length <= 256 && ascii.matches(it) })
    val token = headers["Authorization"]
    val owner = headers["X-Expected-Account"]
    require((token == null && owner == null) || (token != null && Regex("Bearer [A-Za-z0-9_-]{43}").matches(token) &&
      owner != null && Regex("[A-Za-z0-9_-]{1,100}").matches(owner)))
    require((!issuance || token == null) && (!post || issuance || token != null))
    val maximumRequestBytes = if (path.startsWith(prefix + "session/")) 128 else 16384
    // Refuse oversized bridge strings before allocating an encoded copy.
    require(if (post) input.body != null && input.body.length <= maximumRequestBytes && headers["Content-Type"] == "application/json"
      else input.body == null && headers["Content-Type"] == null)
    val body = input.body?.toByteArray(Charsets.UTF_8)
    require(body == null || body.size <= maximumRequestBytes)
    val builder = Request.Builder().url(input.url).tag(GCJSONDispatch::class.java, GCJSONDispatch())
    headers.forEach { (name, value) -> builder.header(name, value) }
    return builder.method(input.method, body?.let { GCJSONOneShotBody(it) }).build()
  }
  fun head(response: Response): Map<String, Any?> {
    val type = response.header("Content-Type")
    val cache = response.header("Cache-Control")
    // OkHttp removes Content-Encoding after its automatic gzip decoding. Other
    // encodings are refused; no extra decompressor or buffering library is used.
    val encoding = response.header("Content-Encoding")
    require(response.code in 200..599 && response.code !in 300..399 && response.header("X-API-Version") == "1" &&
      type != null && type.length <= 128 && Regex("application/json(?:\\s*;\\s*charset=utf-8)?", RegexOption.IGNORE_CASE).matches(type) &&
      cache != null && cache.length <= 256 && cache.split(',').any { it.trim().equals("no-store", true) } &&
      (encoding == null || encoding.equals("identity", true)))
    val retry = response.header("Retry-After")?.takeIf { it.length <= 128 && ascii.matches(it) }
    return mapOf("status" to response.code, "apiVersion" to "1", "contentType" to type, "cacheControl" to cache, "retryAfter" to retry)
  }
  fun decode(bytes: ByteArray): String {
    require(bytes.size <= MAXIMUM_BYTES)
    return Charsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT)
      .decode(ByteBuffer.wrap(bytes)).toString()
  }
}

// OkHttp preserves tag values across newBuilder/follow-up requests. This guard
// also prevents body-less GET replay after a 503 with Retry-After: 0.
internal class GCJSONDispatch {
  private val used = AtomicBoolean(false)
  fun take() = used.compareAndSet(false, true)
}

internal class GCJSONOneShotBody(private val bytes: ByteArray) : RequestBody() {
  private val used = AtomicBoolean(false)
  override fun contentType() = "application/json".toMediaType()
  override fun contentLength() = bytes.size.toLong()
  override fun isOneShot() = true
  override fun writeTo(sink: BufferedSink) {
    if (!used.compareAndSet(false, true)) throw IOException("Native request could not be confirmed.")
    sink.write(bytes)
  }
}
