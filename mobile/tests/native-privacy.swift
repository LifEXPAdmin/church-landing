import Foundation

private func expect(_ value: @autoclosure () -> Bool, _ message: String) {
  if !value() { fatalError(message) }
}

@main private struct NativePrivacyChecks {
  static func main() {
    var policy = GCPrivacyPolicy()
    let window = UUID(), scene = UUID()
    let binding = GCPrivacyBinding(attachment: UUID(), window: window, scene: scene)
    func presentation(_ epoch: Int, _ generation: Double = 4, _ id: String = "fictional-owner", _ ready: Bool = true) -> GCPrivacyPresentation? {
      GCPrivacyPresentation(epoch: Double(epoch), sessionGeneration: generation, presentationId: id, ready: ready)
    }
    func permitted(_ proof: GCPrivacyProof, _ value: GCPrivacyPresentation?, _ current: GCPrivacyBinding?,
      _ sceneActive: Bool = true, _ applicationActive: Bool = true) -> Bool {
      policy.permits(proof, presentation: value, binding: current,
        sceneActive: sceneActive, applicationActive: applicationActive)
    }
    func permitted(_ proof: GCPrivacyProof, _ value: GCPrivacyPresentation?) -> Bool {
      permitted(proof, value, binding)
    }

    expect(policy.snapshot.epoch == 1 && !policy.snapshot.active, "Default state must be inactive")
    expect(policy.proof(presentation(1), binding: binding) == nil, "Default state cannot release")
    policy.transition(active: true)
    let epoch = policy.snapshot.epoch
    let value = presentation(epoch)!
    let proof = policy.proof(value, binding: binding)!
    expect(permitted(proof, value), "A current mounted active presentation may release")
    expect(permitted(proof, value), "A duplicate current proof is idempotent")
    expect(!permitted(proof, value, nil), "An unmounted view cannot release")
    expect(!permitted(proof, value, binding, false), "The view's own scene must be active")
    expect(!permitted(proof, value, binding, true, false), "Application inactivity still covers")

    expect(!permitted(proof, value, GCPrivacyBinding(attachment: UUID(), window: window, scene: scene)), "Reattachment invalidates queued proof")
    expect(!permitted(proof, value, GCPrivacyBinding(attachment: binding.attachment, window: UUID(), scene: scene)), "Another window cannot release")
    expect(!permitted(proof, value, GCPrivacyBinding(attachment: binding.attachment, window: window, scene: UUID())), "Another scene cannot release")
    expect(!permitted(proof, presentation(epoch, 5)), "Changed generation invalidates queued proof")
    expect(!permitted(proof, presentation(epoch, 4, "replacement-owner")), "Changed presentation owner invalidates queued proof")
    expect(!permitted(proof, presentation(epoch, 4, "fictional-owner", false)), "Ready revocation invalidates queued proof")
    expect(!permitted(proof, nil), "Malformed replacement props cannot retain an older proof")

    policy.transition(active: false)
    expect(!permitted(proof, value), "Resignation covers even when JavaScript is blocked")
    expect(policy.proof(presentation(policy.snapshot.epoch), binding: binding) == nil, "No inactive acknowledgement can release")
    policy.transition(active: true)
    expect(!permitted(proof, value), "Inactive-only recovery cannot reuse a queued prior proof")
    let resumed = presentation(policy.snapshot.epoch, 6)!
    let resumedProof = policy.proof(resumed, binding: binding)!
    expect(permitted(resumedProof, resumed), "A freshly verified presentation can resume")
    policy.transition(active: false)
    policy.transition(active: false)
    policy.transition(active: true)
    expect(!permitted(resumedProof, resumed), "Rapid background/resume cannot resurrect a prior acknowledgement")
    expect(policy.proof(presentation(epoch), binding: binding) == nil, "An old epoch cannot create a new proof")

    for bad in [Double.nan, Double.infinity, -1, 0, 1.5, Double(GCPrivacyPolicy.maximumInteger) + 1] {
      expect(GCPrivacyPresentation(epoch: bad, sessionGeneration: 0, presentationId: "owner", ready: true) == nil, "Invalid epoch rejected")
    }
    for bad in [Double.nan, Double.infinity, -1, 0.5, Double(GCPrivacyPolicy.maximumInteger) + 1] {
      expect(presentation(policy.snapshot.epoch, bad) == nil, "Invalid generation rejected")
    }
    for bad in ["", "contains space", "line\nfeed", "private-é", String(repeating: "a", count: 129)] {
      expect(presentation(policy.snapshot.epoch, 0, bad) == nil, "Invalid presentation identifier rejected")
    }
    expect(presentation(policy.snapshot.epoch, 0, String(repeating: "a", count: 128)) != nil, "Bounded identifiers and zero generation are supported")
    print("Native privacy policy checks passed. UIKit, Expo and device snapshot acceptance remain separate.")
  }
}
