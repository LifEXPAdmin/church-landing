import Foundation

struct GCPrivacySnapshot: Equatable, Sendable {
  let epoch: Int
  let active: Bool
}

struct GCPrivacyPresentation: Equatable, Sendable {
  let epoch: Int
  let sessionGeneration: Int
  let presentationId: String
  let ready: Bool

  init?(epoch: Double, sessionGeneration: Double, presentationId: String, ready: Bool) {
    guard epoch.isFinite, epoch >= 1, epoch <= Double(GCPrivacyPolicy.maximumInteger), epoch.rounded() == epoch,
      sessionGeneration.isFinite, sessionGeneration >= 0,
      sessionGeneration <= Double(GCPrivacyPolicy.maximumInteger), sessionGeneration.rounded() == sessionGeneration,
      !presentationId.isEmpty, presentationId.utf8.count <= 128,
      presentationId.utf8.allSatisfy({ (33...126).contains($0) }) else { return nil }
    self.epoch = Int(epoch)
    self.sessionGeneration = Int(sessionGeneration)
    self.presentationId = presentationId
    self.ready = ready
  }
}

struct GCPrivacyBinding: Equatable, Sendable {
  let attachment: UUID
  let window: UUID
  let scene: UUID
}

struct GCPrivacyProof: Equatable, Sendable {
  let presentation: GCPrivacyPresentation
  let binding: GCPrivacyBinding
}

/// Native transition and presentation fencing only. The existing session
/// controller remains the authority for verification and private content.
struct GCPrivacyPolicy: Sendable {
  static let maximumInteger = 9_007_199_254_740_991
  private(set) var snapshot = GCPrivacySnapshot(epoch: 1, active: false)
  private var exhausted = false

  mutating func transition(active: Bool) {
    guard !exhausted, snapshot.epoch < Self.maximumInteger else {
      exhausted = true
      snapshot = GCPrivacySnapshot(epoch: snapshot.epoch, active: false)
      return
    }
    snapshot = GCPrivacySnapshot(epoch: snapshot.epoch + 1, active: active)
  }

  func proof(_ presentation: GCPrivacyPresentation?, binding: GCPrivacyBinding?) -> GCPrivacyProof? {
    guard let presentation, let binding, snapshot.active, presentation.ready,
      presentation.epoch == snapshot.epoch else { return nil }
    return GCPrivacyProof(presentation: presentation, binding: binding)
  }

  func permits(_ proof: GCPrivacyProof, presentation: GCPrivacyPresentation?, binding: GCPrivacyBinding?,
    sceneActive: Bool, applicationActive: Bool) -> Bool {
    guard sceneActive, applicationActive else { return false }
    return self.proof(presentation, binding: binding) == proof
  }
}
