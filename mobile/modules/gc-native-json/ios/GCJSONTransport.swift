import Foundation

/// All mutable state, URLSession delegates and timers use one serial queue.
final class GCJSONTransport: NSObject, URLSessionDataDelegate, @unchecked Sendable {
  typealias Completion = @Sendable (Result<GCJSONReply, GCJSONFailure>) -> Void
  private final class Flight {
    let id: String
    var timer: DispatchSourceTimer?
    var task: URLSessionTask?
    var completion: Completion?
    var upload: GCJSONOneShotBody?
    var head: GCJSONHead?
    var bytes = Data()
    var ended = false
    init(_ id: String) { self.id = id }
  }
  private let queue = DispatchQueue(label: "GCNativeJson.transport")
  private var origin: String?
  private var environment: String?
  private var flights: [String: Flight] = [:]
  private var closed = false
  private var session: URLSession!

  override convenience init() { self.init(configuration: .ephemeral) }
  // Configuration injection is native-test-only; the bridge cannot change it.
  init(configuration: URLSessionConfiguration) {
    super.init()
    configuration.urlCache = nil
    configuration.httpCookieStorage = nil
    configuration.urlCredentialStorage = nil
    configuration.httpShouldSetCookies = false
    configuration.httpCookieAcceptPolicy = .never
    configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
    configuration.timeoutIntervalForRequest = GCJSONPolicy.deadline
    configuration.timeoutIntervalForResource = GCJSONPolicy.deadline
    configuration.httpMaximumConnectionsPerHost = GCJSONPolicy.maximumFlights
    let delegates = OperationQueue()
    delegates.maxConcurrentOperationCount = 1
    delegates.underlyingQueue = queue
    session = URLSession(configuration: configuration, delegate: self, delegateQueue: delegates)
  }
  func initialize(environment: String, origin: String, completion: @escaping @Sendable (Bool) -> Void) {
    queue.async {
      guard !self.closed, (try? GCJSONPolicy.origin(environment: environment, value: origin)) != nil,
        self.origin == nil || (self.origin == origin && self.environment == environment) else { completion(false); return }
      self.origin = origin; self.environment = environment; completion(true)
    }
  }
  func reserve(_ id: String, completion: @escaping @Sendable (Bool) -> Void) {
    queue.async { [self] in
      guard !self.closed, self.origin != nil, GCJSONPolicy.validID(id), self.flights[id] == nil,
        self.flights.count < GCJSONPolicy.maximumFlights else { completion(false); return }
      let flight = Flight(id)
      self.flights[id] = flight
      let timer = DispatchSource.makeTimerSource(queue: self.queue)
      timer.schedule(deadline: .now() + GCJSONPolicy.deadline)
      timer.setEventHandler { [weak self, weak flight] in
        guard let self, let flight else { return }
        self.fail(flight)
      }
      flight.timer = timer; timer.resume(); completion(true)
    }
  }
  func send(_ id: String, request: GCJSONRequest, completion: @escaping Completion) {
    queue.async {
      guard !self.closed, let origin = self.origin, let flight = self.flights[id],
        flight.task == nil, !flight.ended else { completion(.failure(.unconfirmed)); return }
      flight.completion = completion
      do {
        let validated = try GCJSONPolicy.request(request, origin: origin)
        let task: URLSessionTask
        if let body = request.body {
          flight.upload = GCJSONOneShotBody(body)
          task = self.session.uploadTask(withStreamedRequest: validated)
        } else { task = self.session.dataTask(with: validated) }
        flight.task = task
        task.taskDescription = id
        task.resume()
      } catch { self.fail(flight) }
    }
  }
  func cancel(_ id: String, completion: @escaping @Sendable () -> Void) {
    queue.async { if let flight = self.flights[id] { self.fail(flight) }; completion() }
  }
  func close() {
    queue.async {
      self.closed = true
      for flight in Array(self.flights.values) { self.fail(flight) }
      self.session.invalidateAndCancel()
    }
  }
  private func flight(_ task: URLSessionTask) -> Flight? {
    guard let id = task.taskDescription, let value = flights[id], value.task === task else { return nil }
    return value
  }
  private func finish(_ flight: Flight, _ result: Result<GCJSONReply, GCJSONFailure>) {
    guard !flight.ended else { return }
    flight.ended = true
    flight.timer?.cancel(); flight.timer = nil
    flight.upload = nil; flight.head = nil; flight.bytes = Data()
    let callback = flight.completion; flight.completion = nil
    callback?(result)
  }
  private func fail(_ flight: Flight) {
    finish(flight, .failure(.unconfirmed))
    if let task = flight.task { task.cancel() }
    else { flights.removeValue(forKey: flight.id) }
    // A started task retains its slot until URLSession confirms completion.
  }
  func urlSession(_ session: URLSession, task: URLSessionTask, needNewBodyStream completionHandler: @escaping (InputStream?) -> Void) {
    guard let flight = flight(task), !flight.ended, let stream = flight.upload?.take() else {
      completionHandler(nil)
      if let flight = flight(task) { fail(flight) }
      return
    }
    completionHandler(stream)
  }
  func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
    completionHandler(nil)
    if let flight = flight(task) { fail(flight) }
  }
  func urlSession(_ session: URLSession, task: URLSessionTask, didReceive challenge: URLAuthenticationChallenge,
    completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void) {
    if challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust {
      completionHandler(.performDefaultHandling, nil)
    } else {
      completionHandler(.cancelAuthenticationChallenge, nil)
      if let flight = flight(task) { fail(flight) }
    }
  }
  func urlSession(_ session: URLSession, didReceive challenge: URLAuthenticationChallenge,
    completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void) {
    // Connection-level client-certificate/NTLM challenges do not necessarily
    // visit the task delegate. Never fall back to interactive credentials.
    completionHandler(challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust ? .performDefaultHandling : .cancelAuthenticationChallenge, nil)
  }
  func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse,
    completionHandler: @escaping (URLSession.ResponseDisposition) -> Void) {
    guard let flight = flight(dataTask), !flight.ended, let response = response as? HTTPURLResponse,
      let head = try? GCJSONPolicy.head(response) else {
      completionHandler(.cancel)
      if let flight = flight(dataTask) { fail(flight) }
      return
    }
    flight.head = head; completionHandler(.allow)
  }
  func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
    guard let flight = flight(dataTask), !flight.ended, flight.head != nil else { return }
    do { try GCJSONPolicy.append(data, to: &flight.bytes) } catch { fail(flight) }
  }
  func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, willCacheResponse proposedResponse: CachedURLResponse,
    completionHandler: @escaping (CachedURLResponse?) -> Void) { completionHandler(nil) }
  func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
    guard let flight = flight(task) else { return }
    if !flight.ended {
      if error == nil, let head = flight.head, let body = try? GCJSONPolicy.decode(flight.bytes) {
        finish(flight, .success(GCJSONReply(head: head, body: body)))
      } else { finish(flight, .failure(.unconfirmed)) }
    }
    flights.removeValue(forKey: flight.id)
  }
}
