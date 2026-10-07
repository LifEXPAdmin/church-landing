package expo.modules.gcnativejson

import expo.modules.kotlin.Promise
import okhttp3.Authenticator
import okhttp3.Call
import okhttp3.Callback
import okhttp3.CookieJar
import okhttp3.Dispatcher
import okhttp3.OkHttpClient
import okhttp3.Response
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.ScheduledThreadPoolExecutor
import java.util.concurrent.TimeUnit

internal class GCJSONTransport {
  private class Flight(val id: String) {
    var timer: ScheduledFuture<*>? = null
    var call: Call? = null
    var promise: Promise? = null
    var ended = false
  }
  private val lock = Any()
  private var origin: String? = null
  private var environment: String? = null
  private var closed = false
  private val flights = mutableMapOf<String, Flight>()
  private val timers = ScheduledThreadPoolExecutor(1).apply { removeOnCancelPolicy = true }
  private val client = OkHttpClient.Builder()
    .cache(null).cookieJar(CookieJar.NO_COOKIES)
    .authenticator(Authenticator.NONE).proxyAuthenticator(Authenticator.NONE)
    .followRedirects(false).followSslRedirects(false).retryOnConnectionFailure(false)
    .addNetworkInterceptor { chain ->
      if (chain.request().tag(GCJSONDispatch::class.java)?.take() != true) throw IOException("Native request could not be confirmed.")
      val response = chain.proceed(chain.request())
      val retry = response.header("Retry-After")
      // The declared OkHttp version parses numeric follow-up hints as Int
      // before onResponse. Refuse overflow before its parser can throw.
      if (retry != null && (retry.length > 128 || (retry.isNotEmpty() && retry.all { it in '0'..'9' } && retry.toIntOrNull() == null))) {
        response.close()
        throw IOException("Native request could not be confirmed.")
      }
      response
    }
    .callTimeout(GCJSONPolicy.DEADLINE_SECONDS, TimeUnit.SECONDS)
    .connectTimeout(GCJSONPolicy.DEADLINE_SECONDS, TimeUnit.SECONDS)
    .readTimeout(GCJSONPolicy.DEADLINE_SECONDS, TimeUnit.SECONDS)
    .writeTimeout(GCJSONPolicy.DEADLINE_SECONDS, TimeUnit.SECONDS)
    .dispatcher(Dispatcher().apply { maxRequests = GCJSONPolicy.MAXIMUM_FLIGHTS; maxRequestsPerHost = GCJSONPolicy.MAXIMUM_FLIGHTS })
    .build()

  fun initialize(environment: String, origin: String, promise: Promise) = synchronized(lock) {
    try {
      GCJSONPolicy.origin(environment, origin)
      require(!closed && (this.origin == null || (this.origin == origin && this.environment == environment)))
      this.origin = origin; this.environment = environment; promise.resolve()
    } catch (_: Exception) { reject(promise) }
  }
  fun reserve(id: String, promise: Promise) = synchronized(lock) {
    try {
      require(!closed && origin != null && GCJSONPolicy.validID(id) && !flights.containsKey(id) && flights.size < GCJSONPolicy.MAXIMUM_FLIGHTS)
      val flight = Flight(id)
      flights[id] = flight
      flight.timer = timers.schedule({ synchronized(lock) { fail(flight) } }, GCJSONPolicy.DEADLINE_SECONDS, TimeUnit.SECONDS)
      promise.resolve()
    } catch (_: Exception) { reject(promise) }
  }
  fun send(id: String, request: GCJSONRequest, promise: Promise) {
    val flight: Flight
    val call: Call
    synchronized(lock) {
      val existing = flights[id]
      if (closed || existing == null || existing.call != null || existing.ended) { reject(promise); return }
      flight = existing
      flight.promise = promise
      try {
        call = client.newCall(GCJSONPolicy.request(request, requireNotNull(origin)))
        flight.call = call
      } catch (_: Exception) { fail(flight); return }
    }
    try {
      call.enqueue(object : Callback {
        override fun onFailure(call: Call, error: IOException) { complete(flight, null) }
        override fun onResponse(call: Call, response: Response) {
          var result: Map<String, Any?>? = null
          try {
            response.use {
              val head = GCJSONPolicy.head(response)
              val source = requireNotNull(response.body).source()
              val bytes = ByteArrayOutputStream()
              val chunk = ByteArray(8192)
              while (true) {
                synchronized(lock) { check(!flight.ended) }
                val count = source.read(chunk)
                if (count == -1) break
                require(count <= GCJSONPolicy.MAXIMUM_BYTES - bytes.size())
                bytes.write(chunk, 0, count)
              }
              result = head + ("body" to GCJSONPolicy.decode(bytes.toByteArray()))
            }
          } catch (_: Exception) { call.cancel() }
          finally { complete(flight, result) }
        }
      })
    } catch (_: Exception) { call.cancel(); complete(flight, null) }
  }
  fun cancel(id: String) = synchronized(lock) { flights[id]?.let { fail(it) }; Unit }
  fun close() = synchronized(lock) {
    closed = true
    flights.values.toList().forEach { fail(it) }
    timers.shutdownNow()
    client.connectionPool.evictAll()
    client.dispatcher.executorService.shutdown()
  }
  private fun fail(flight: Flight) {
    if (flights[flight.id] !== flight) return
    finish(flight, null)
    if (flight.call == null) flights.remove(flight.id) else flight.call?.cancel()
    // Keep a started call's slot until its callback/response reader has ended.
  }
  private fun complete(flight: Flight, result: Map<String, Any?>?) = synchronized(lock) {
    if (flights[flight.id] !== flight) return@synchronized
    finish(flight, result)
    flights.remove(flight.id)
  }
  private fun finish(flight: Flight, result: Map<String, Any?>?) {
    if (flight.ended) return
    flight.ended = true
    flight.timer?.cancel(false); flight.timer = null
    val promise = flight.promise; flight.promise = null
    if (promise != null) { if (result == null) reject(promise) else promise.resolve(result) }
  }
  private fun reject(promise: Promise) { promise.reject("E_UNCONFIRMED", "Native request could not be confirmed.", null) }
}
