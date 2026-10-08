package expo.modules.gcnativeprivacy

import org.junit.Assert.*
import org.junit.Test
import java.util.UUID

class GCPrivacyPolicyTest {
  private val policy = PrivacyPolicy()
  private val binding = PrivacyBinding(UUID.randomUUID(), UUID.randomUUID())
  private fun presentation(generation: Double = 4.0, id: String = "fictional-owner", ready: Boolean = true) =
    PrivacyPresentation.parse(policy.snapshot.epoch.toDouble(), generation, id, ready)
  private fun activeProof(): PrivacyProof {
    policy.transition(true)
    return policy.proof(presentation(), binding)!!
  }

  @Test fun startupAndMissingMountStayCovered() {
    assertFalse(policy.snapshot.active)
    assertNull(policy.proof(presentation(), binding))
    policy.transition(true)
    assertNull(policy.proof(presentation(), null))
  }
  @Test fun currentProofRequiresLiveNativeActivity() {
    val proof = activeProof()
    assertTrue(policy.permits(proof, presentation(), binding, true))
    assertFalse(policy.permits(proof, presentation(), binding, false))
    assertFalse(policy.permits(proof, presentation(), null, true))
  }
  @Test fun oldMountAndOtherWindowCannotRelease() {
    val proof = activeProof()
    assertFalse(policy.permits(proof, presentation(), binding.copy(attachment = UUID.randomUUID()), true))
    assertFalse(policy.permits(proof, presentation(), binding.copy(window = UUID.randomUUID()), true))
  }
  @Test fun replacementSessionAndPropsRevokeQueuedProof() {
    val proof = activeProof()
    assertFalse(policy.permits(proof, presentation(generation = 5.0), binding, true))
    assertFalse(policy.permits(proof, presentation(id = "replacement-owner"), binding, true))
    assertFalse(policy.permits(proof, presentation(ready = false), binding, true))
    assertFalse(policy.permits(proof, null, binding, true))
  }
  @Test fun pauseAndFastResumeNeverReuseProof() {
    val proof = activeProof()
    val old = presentation()
    policy.transition(false)
    assertFalse(policy.permits(proof, old, binding, true))
    assertNull(policy.proof(presentation(), binding))
    policy.transition(true)
    assertNull(policy.proof(old, binding))
    val current = policy.proof(presentation(6.0), binding)!!
    assertTrue(policy.permits(current, presentation(6.0), binding, true))
    policy.transition(false)
    policy.transition(false)
    policy.transition(true)
    assertFalse(policy.permits(current, presentation(6.0), binding, true))
  }
  @Test fun malformedEpochAndGenerationCannotEnterProtocol() {
    for (bad in listOf(Double.NaN, Double.POSITIVE_INFINITY, -1.0, 0.0, 1.5,
      PrivacyPolicy.MAXIMUM_INTEGER.toDouble() + 1))
      assertNull(PrivacyPresentation.parse(bad, 0.0, "owner", true))
    for (bad in listOf(Double.NaN, Double.NEGATIVE_INFINITY, -1.0, 0.5,
      PrivacyPolicy.MAXIMUM_INTEGER.toDouble() + 1)) assertNull(presentation(bad))
    assertNotNull(presentation(0.0))
  }
  @Test fun presentationIdentifiersAreBoundedAndContainNoPrivateText() {
    for (bad in listOf("", "contains space", "line\nfeed", "private-é", "a".repeat(129)))
      assertNull(presentation(id = bad))
    assertNotNull(presentation(id = "a".repeat(128)))
  }
}
