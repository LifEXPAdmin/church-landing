package expo.modules.gcnativevisibility

import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** Snapshot only. React Native AppState remains the focus/change event owner. */
class GCNativeVisibilityModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("GCNativeVisibility")
    AsyncFunction<Boolean?>("readWindowFocus") {
      val activity = appContext.currentActivity
      if (activity == null || activity.isFinishing || activity.isDestroyed) {
        null
      } else {
        activity.window?.peekDecorView()?.hasWindowFocus()
      }
    }.runOnQueue(Queues.MAIN)
  }
}
