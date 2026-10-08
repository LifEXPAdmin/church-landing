package expo.modules.gcnativeprivacy

import java.util.UUID

internal data class PrivacySnapshot(val epoch: Long, val active: Boolean)
internal data class PrivacyPresentation(val epoch: Long, val generation: Long, val id: String, val ready: Boolean) {
  companion object {
    fun parse(epoch: Double, generation: Double, id: String, ready: Boolean): PrivacyPresentation? {
      fun valid(value: Double, minimum: Long) = value.isFinite() && value >= minimum &&
        value <= PrivacyPolicy.MAXIMUM_INTEGER && value == value.toLong().toDouble()
      if (!valid(epoch, 1) || !valid(generation, 0) || id.isEmpty() || id.length > 128 ||
        id.any { it.code !in 33..126 }) return null
      return PrivacyPresentation(epoch.toLong(), generation.toLong(), id, ready)
    }
  }
}
internal data class PrivacyBinding(val attachment: UUID, val window: UUID)
internal data class PrivacyProof(val presentation: PrivacyPresentation, val binding: PrivacyBinding)

/** Native lifecycle/mount fencing only. Shared session verification owns access. */
internal class PrivacyPolicy {
  companion object { const val MAXIMUM_INTEGER = 9_007_199_254_740_991L }
  var snapshot = PrivacySnapshot(1, false)
    private set
  private var exhausted = false

  fun transition(active: Boolean) {
    if (exhausted || snapshot.epoch >= MAXIMUM_INTEGER) {
      exhausted = true
      snapshot = PrivacySnapshot(snapshot.epoch, false)
    } else snapshot = PrivacySnapshot(snapshot.epoch + 1, active)
  }

  fun proof(presentation: PrivacyPresentation?, binding: PrivacyBinding?): PrivacyProof? {
    if (!snapshot.active || presentation == null || binding == null || !presentation.ready ||
      presentation.epoch != snapshot.epoch) return null
    return PrivacyProof(presentation, binding)
  }

  fun permits(proof: PrivacyProof, presentation: PrivacyPresentation?, binding: PrivacyBinding?, active: Boolean) =
    active && this.proof(presentation, binding) == proof
}
