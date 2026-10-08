import ExpoModulesCore
import UIKit

@MainActor
private final class GCPrivacyCover: UIView {
  private let title = UILabel()

  init() {
    super.init(frame: .zero)
    backgroundColor = .systemBackground
    isOpaque = true
    autoresizingMask = [.flexibleWidth, .flexibleHeight]
    isAccessibilityElement = true
    accessibilityLabel = "God's Churches"
    accessibilityViewIsModal = true
    title.text = "God's Churches"
    title.textColor = .label
    title.font = .preferredFont(forTextStyle: .title1)
    title.adjustsFontForContentSizeCategory = true
    title.numberOfLines = 0
    title.isAccessibilityElement = false
    addSubview(title)
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) { fatalError("Unavailable initializer") }

  override func layoutSubviews() {
    super.layoutSubviews()
    let available = bounds.inset(by: UIEdgeInsets(top: safeAreaInsets.top + 24, left: 24,
      bottom: safeAreaInsets.bottom + 24, right: 24))
    title.frame = CGRect(origin: available.origin,
      size: title.sizeThatFits(CGSize(width: max(0, available.width), height: max(0, available.height))))
  }
}

@MainActor
private final class GCPrivacyWindow {
  weak var window: UIWindow?
  weak var scene: UIWindowScene?
  let id = UUID()
  var sceneId = UUID()
  let cover = GCPrivacyCover()
  var presenters: [ObjectIdentifier: GCWeakPrivacyView] = [:]
  var accepted: [ObjectIdentifier: GCPrivacyProof] = [:]

  init(_ window: UIWindow) { self.window = window; scene = window.windowScene }

  func conceal(invalidateAll: Bool = true) {
    if invalidateAll { accepted.removeAll() }
    guard let window else { return }
    // A synchronous UIKit mutation, not a JavaScript event or delayed render.
    UIView.performWithoutAnimation {
      cover.frame = window.bounds
      if cover.superview !== window { window.addSubview(cover) }
      cover.isHidden = false
      window.bringSubviewToFront(cover)
      cover.setNeedsLayout()
      cover.layoutIfNeeded()
    }
  }
}

@MainActor
private final class GCWeakPrivacyView {
  weak var value: GCPrivacyPresentationView?
  init(_ value: GCPrivacyPresentationView) { self.value = value }
}

@MainActor
private final class GCPrivacyCoordinator {
  static let shared = GCPrivacyCoordinator()
  private var policy = GCPrivacyPolicy()
  private var windows: [ObjectIdentifier: GCPrivacyWindow] = [:]
  private var listeners: [UUID: (GCPrivacySnapshot) -> Void] = [:]

  func readState() -> GCPrivacySnapshot {
    let current = policy.snapshot
    return GCPrivacySnapshot(epoch: current.epoch,
      active: current.active && UIApplication.shared.applicationState == .active)
  }

  func listen(_ id: UUID, listener: @escaping (GCPrivacySnapshot) -> Void) { listeners[id] = listener }
  func removeListener(_ id: UUID) { listeners[id] = nil }

  func transition(active: Bool) {
    // Even activation only invalidates and notifies. It never uncovers a window.
    for entry in windows.values { entry.conceal() }
    windows = windows.filter { $0.value.window != nil }
    policy.transition(active: active)
    let current = readState()
    for listener in Array(listeners.values) { listener(current) }
  }

  func ownerDestroyed() { transition(active: policy.snapshot.active) }

  func detach(_ view: GCPrivacyPresentationView) {
    if let entry = view.registeredWindow {
      entry.presenters[ObjectIdentifier(view)] = nil
      entry.accepted[ObjectIdentifier(view)] = nil
      entry.conceal(invalidateAll: false)
    }
    view.registeredWindow = nil
    view.binding = nil
  }

  func attach(_ view: GCPrivacyPresentationView) {
    detach(view)
    guard let window = view.window else { return }
    let identity = ObjectIdentifier(window)
    let entry = windows[identity] ?? GCPrivacyWindow(window)
    windows[identity] = entry
    if entry.scene !== window.windowScene {
      entry.scene = window.windowScene
      entry.sceneId = UUID()
      entry.accepted.removeAll()
    }
    entry.presenters[ObjectIdentifier(view)] = GCWeakPrivacyView(view)
    view.registeredWindow = entry
    view.binding = GCPrivacyBinding(attachment: UUID(), window: entry.id, scene: entry.sceneId)
    entry.conceal(invalidateAll: false)
  }

  func presentationChanged(_ view: GCPrivacyPresentationView) {
    guard let entry = view.registeredWindow else { return }
    let identity = ObjectIdentifier(view)
    let proof = policy.proof(view.presentation, binding: view.binding)
    if let proof, entry.accepted[identity] == proof, entry.cover.isHidden { return }
    // A prop update that replaces the prior proof must close the window first.
    entry.accepted[identity] = nil
    entry.conceal(invalidateAll: false)
    guard let proof else { return }
    // Fabric finalizes Expo props before insertion for new views. This queued
    // main turn runs after that synchronous mounting batch, not after a timeout.
    DispatchQueue.main.async { [weak view] in
      guard let view else { return }
      self.finish(view, proof: proof)
    }
  }

  private func current(_ view: GCPrivacyPresentationView, entry: GCPrivacyWindow, proof: GCPrivacyProof) -> Bool {
    guard let window = entry.window, let scene = entry.scene,
      view.registeredWindow === entry, view.window === window, window.windowScene === scene,
      view.binding?.window == entry.id, view.binding?.scene == entry.sceneId else { return false }
    return policy.permits(proof, presentation: view.presentation, binding: view.binding,
      sceneActive: scene.activationState == .foregroundActive,
      applicationActive: UIApplication.shared.applicationState == .active)
  }

  private func finish(_ view: GCPrivacyPresentationView, proof: GCPrivacyProof) {
    guard let entry = view.registeredWindow, current(view, entry: entry, proof: proof) else { return }
    entry.accepted[ObjectIdentifier(view)] = proof
    // Multiple presentations in one window cannot acknowledge for each other.
    // A detached/dead presenter is never a reason to remove an existing cover.
    guard allCurrent(entry), let window = entry.window else { return }
    UIView.performWithoutAnimation {
      window.layoutIfNeeded()
      // Layout can reenter attachment callbacks; check again immediately before hiding.
      if current(view, entry: entry, proof: proof), allCurrent(entry) { entry.cover.isHidden = true }
    }
  }

  private func allCurrent(_ entry: GCPrivacyWindow) -> Bool {
    !entry.presenters.isEmpty && entry.presenters.allSatisfy { identity, weakView in
      guard let other = weakView.value, let accepted = entry.accepted[identity] else { return false }
      return current(other, entry: entry, proof: accepted)
    }
  }
}

@MainActor
private final class GCPrivacyPresentationView: ExpoView {
  var epoch: Double = 0
  var sessionGeneration: Double = -1
  var presentationId = ""
  var ready = false
  var registeredWindow: GCPrivacyWindow?
  var binding: GCPrivacyBinding?
  var presentation: GCPrivacyPresentation? {
    GCPrivacyPresentation(epoch: epoch, sessionGeneration: sessionGeneration,
      presentationId: presentationId, ready: ready)
  }

  override func willMove(toWindow newWindow: UIWindow?) {
    if newWindow !== window { GCPrivacyCoordinator.shared.detach(self) }
    super.willMove(toWindow: newWindow)
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    GCPrivacyCoordinator.shared.attach(self)
    GCPrivacyCoordinator.shared.presentationChanged(self)
  }
}

/// Expo 57 forwards scene lifecycle callbacks through these subscriber methods.
/// Module background hooks alone do not cover the earlier inactive transition.
public final class GCPrivacyAppDelegateSubscriber: ExpoAppDelegateSubscriber {
  public func applicationDidBecomeActive(_ application: UIApplication) {
    GCPrivacyCoordinator.shared.transition(active: true)
  }
  public func applicationWillResignActive(_ application: UIApplication) {
    GCPrivacyCoordinator.shared.transition(active: false)
  }
  public func applicationDidEnterBackground(_ application: UIApplication) {
    GCPrivacyCoordinator.shared.transition(active: false)
  }
}

// The module carries an immutable observer ID. All mutable privacy state and
// event relay work are confined to the main actor.
public final class GCNativePrivacyModule: Module, @unchecked Sendable {
  private let observerId = UUID()

  public func definition() -> ModuleDefinition {
    Name("GCNativePrivacy")
    Events("onStateChange")
    OnCreate { [weak self] in
      DispatchQueue.main.async { [weak self] in
        guard let self else { return }
        GCPrivacyCoordinator.shared.listen(self.observerId) { [weak self] state in
          self?.sendEvent("onStateChange", ["epoch": state.epoch, "active": state.active])
        }
      }
    }
    OnDestroy { [observerId = self.observerId] in
      DispatchQueue.main.async {
        GCPrivacyCoordinator.shared.removeListener(observerId)
        GCPrivacyCoordinator.shared.ownerDestroyed()
      }
    }
    AsyncFunction("readState") { (promise: Promise) in
      DispatchQueue.main.async {
        let state = GCPrivacyCoordinator.shared.readState()
        promise.resolve(["epoch": state.epoch, "active": state.active] as [String: Any])
      }
    }
    View(GCPrivacyPresentationView.self) {
      Prop("epoch") { (view, value: Double) in view.epoch = value }
      Prop("sessionGeneration") { (view, value: Double) in view.sessionGeneration = value }
      Prop("presentationId") { (view, value: String) in view.presentationId = value }
      Prop("ready") { (view, value: Bool) in view.ready = value }
      OnViewDidUpdateProps { view in GCPrivacyCoordinator.shared.presentationChanged(view) }
    }
  }
}
