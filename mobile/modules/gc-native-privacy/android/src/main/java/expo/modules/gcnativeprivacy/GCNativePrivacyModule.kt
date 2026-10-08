package expo.modules.gcnativeprivacy

import android.app.Activity
import android.app.Application
import android.content.Context
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.Window
import android.view.WindowManager
import android.view.inputmethod.InputMethodManager
import android.widget.FrameLayout
import android.widget.TextView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.LifecycleOwner
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.views.ExpoView
import java.lang.ref.WeakReference
import java.util.UUID

internal class PrivacyWindow(val activity: Activity, val window: Window, val decor: ViewGroup) {
  val id: UUID = UUID.randomUUID()
  val presenters = mutableMapOf<UUID, WeakReference<GCPrivacyPresentationView>>()
  val accepted = mutableMapOf<UUID, PrivacyProof>()
  var paused = false
  var focused = decor.hasWindowFocus()
  val content: ViewGroup = activity.findViewById(android.R.id.content)
  private val accessibility = content.importantForAccessibility
  private val focusability = content.descendantFocusability
  val cover = FrameLayout(activity).apply {
    setBackgroundColor(Color.WHITE)
    isClickable = true
    isFocusableInTouchMode = true
    importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_YES
    contentDescription = "God's Churches"
    elevation = 100f
    addView(TextView(activity).apply {
      text = "God's Churches"
      setTextColor(Color.BLACK)
      textSize = 24f
      gravity = Gravity.CENTER
      importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
      val padding = (24 * resources.displayMetrics.density).toInt()
      setPadding(padding, padding, padding, padding)
    }, FrameLayout.LayoutParams(-1, -1))
  }
  val lifecycleObserver = LifecycleEventObserver { _, _ -> PrivacyCoordinator.refresh() }

  init {
    // Configure before admitting any private presentation, not during onPause
    // when the system may already have cached the previous foreground frame.
    if (Build.VERSION.SDK_INT >= 33) activity.setRecentsScreenshotEnabled(false)
    else window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
    decor.addView(cover, ViewGroup.LayoutParams(-1, -1))
    conceal()
  }

  fun active() = !paused && focused && !activity.isFinishing && !activity.isDestroyed &&
    (activity as? LifecycleOwner)?.lifecycle?.currentState?.isAtLeast(Lifecycle.State.RESUMED) == true &&
    decor.isAttachedToWindow && decor.windowVisibility == View.VISIBLE && decor.hasWindowFocus()

  fun conceal(invalidateAll: Boolean = true) {
    if (invalidateAll) accepted.clear()
    val newlyCovered = cover.visibility != View.VISIBLE
    cover.visibility = View.VISIBLE
    decor.bringChildToFront(cover)
    content.importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS
    content.descendantFocusability = ViewGroup.FOCUS_BLOCK_DESCENDANTS
    // Clear a native editor immediately. A stalled JS thread cannot leave an
    // editable password behind the cover or keep its input connection active.
    if (newlyCovered || content.findFocus() != null) {
      content.findFocus()?.clearFocus()
      (activity.getSystemService(Context.INPUT_METHOD_SERVICE) as? InputMethodManager)
        ?.hideSoftInputFromWindow(decor.windowToken, 0)
      cover.requestFocus()
    }
  }

  fun reveal() {
    cover.visibility = View.GONE
    if (content.importantForAccessibility == View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS)
      content.importantForAccessibility = accessibility
    if (content.descendantFocusability == ViewGroup.FOCUS_BLOCK_DESCENDANTS)
      content.descendantFocusability = focusability
  }

  fun destroy() {
    conceal()
    (activity as? LifecycleOwner)?.lifecycle?.removeObserver(lifecycleObserver)
    decor.removeView(cover)
    presenters.clear()
    accepted.clear()
  }
}

/** Every mutable field and view operation is confined to Android's main thread. */
private object PrivacyCoordinator : Application.ActivityLifecycleCallbacks {
  val main = Handler(Looper.getMainLooper())
  private val policy = PrivacyPolicy()
  private var application: Application? = null
  private val windows = mutableMapOf<Window, PrivacyWindow>()
  private val listeners = mutableMapOf<UUID, (PrivacySnapshot) -> Unit>()

  fun listen(id: UUID, listener: (PrivacySnapshot) -> Unit) { listeners[id] = listener }
  fun remove(id: UUID) { listeners.remove(id); transition() }
  fun read(): PrivacySnapshot {
    val state = policy.snapshot
    return state.copy(active = state.active && windows.values.any { it.active() })
  }

  private fun transition() {
    windows.values.forEach { it.conceal() }
    policy.transition(windows.values.any { it.active() })
    val current = read()
    listeners.values.toList().forEach { it(current) }
  }

  fun refresh() = transition()

  fun attach(view: GCPrivacyPresentationView) {
    detach(view)
    val activity = view.appContext.currentActivity ?: return
    val window = activity.window ?: return
    val decor = window.peekDecorView() as? ViewGroup ?: return
    if (activity.isDestroyed || activity.isFinishing || view.rootView !== decor) return
    if (application == null) {
      application = activity.application
      application!!.registerActivityLifecycleCallbacks(this)
    }
    val entry = windows[window] ?: PrivacyWindow(activity, window, decor).also {
      windows[window] = it
      (activity as? LifecycleOwner)?.lifecycle?.addObserver(it.lifecycleObserver)
    }
    // Attachment does not replay a window-focus callback. A retained entry may
    // have blurred before detach and regained focus while no marker existed.
    entry.focused = decor.hasWindowFocus()
    view.entry = entry
    view.binding = PrivacyBinding(UUID.randomUUID(), entry.id)
    entry.presenters[view.identity] = WeakReference(view)
    transition()
    changed(view)
  }

  fun detach(view: GCPrivacyPresentationView) {
    view.pending?.let { main.removeCallbacks(it) }
    view.pending = null
    view.entry?.let {
      it.presenters.remove(view.identity)
      it.accepted.remove(view.identity)
      it.conceal(invalidateAll = false)
    }
    view.entry = null
    view.binding = null
  }

  fun changed(view: GCPrivacyPresentationView) {
    view.pending?.let { main.removeCallbacks(it) }
    view.pending = null
    val entry = view.entry ?: return
    val proof = policy.proof(view.presentation, view.binding)
    if (proof != null && entry.accepted[view.identity] == proof && entry.cover.visibility == View.GONE) return
    entry.accepted.remove(view.identity)
    entry.conceal(invalidateAll = false)
    if (proof == null) return
    val weak = WeakReference(view)
    // Runs after the current synchronous Fabric mounting batch. It carries an
    // exact proof, never an unfenced "ready" callback or a reveal timeout.
    val completion = Runnable {
      weak.get()?.let { mounted ->
        mounted.pending = null
        if (!current(mounted, entry, proof)) return@let
        entry.accepted[mounted.identity] = proof
        if (allCurrent(entry)) entry.reveal()
      }
    }
    view.pending = completion
    main.post(completion)
  }

  private fun current(view: GCPrivacyPresentationView, entry: PrivacyWindow, proof: PrivacyProof) =
    windows[entry.window] === entry && view.entry === entry && view.isAttachedToWindow &&
      view.rootView === entry.decor && view.windowToken != null && view.windowToken === entry.decor.windowToken &&
      view.binding?.window == entry.id &&
      policy.permits(proof, view.presentation, view.binding, entry.active())

  private fun allCurrent(entry: PrivacyWindow) = entry.presenters.isNotEmpty() &&
    entry.presenters.all { (id, reference) ->
      val other = reference.get()
      val proof = entry.accepted[id]
      other != null && proof != null && current(other, entry, proof)
    }

  private fun pause(activity: Activity) {
    windows.values.filter { it.activity === activity }.forEach { it.paused = true }
    transition()
  }
  override fun onActivityPrePaused(activity: Activity) = pause(activity)
  override fun onActivityPaused(activity: Activity) = pause(activity)
  override fun onActivityPreStopped(activity: Activity) = pause(activity)
  override fun onActivityStopped(activity: Activity) = pause(activity)
  override fun onActivityResumed(activity: Activity) {
    windows.values.filter { it.activity === activity }.forEach { it.paused = false }
    transition()
  }
  override fun onActivityPostResumed(activity: Activity) = transition()
  override fun onActivityDestroyed(activity: Activity) {
    windows.values.filter { it.activity === activity }.toList().forEach {
      windows.remove(it.window)
      it.destroy()
    }
    transition()
  }
  override fun onActivityCreated(activity: Activity, state: Bundle?) = Unit
  override fun onActivityStarted(activity: Activity) = Unit
  override fun onActivitySaveInstanceState(activity: Activity, state: Bundle) = Unit
}

class GCPrivacyPresentationView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  internal val identity: UUID = UUID.randomUUID()
  private var epochValue = 0.0
  private var generationValue = -1.0
  private var idValue = ""
  private var readyValue = false
  internal var entry: PrivacyWindow? = null
  internal var pending: Runnable? = null
  internal var binding: PrivacyBinding? = null
  internal val presentation get() = PrivacyPresentation.parse(epochValue, generationValue, idValue, readyValue)
  fun setEpoch(value: Double) { epochValue = value }
  fun setGeneration(value: Double) { generationValue = value }
  fun setPresentationId(value: String) { idValue = value }
  fun setReady(value: Boolean) { readyValue = value }
  fun propsChanged() = PrivacyCoordinator.changed(this)
  fun destroy() = PrivacyCoordinator.detach(this)
  override fun onAttachedToWindow() { super.onAttachedToWindow(); PrivacyCoordinator.attach(this) }
  override fun onDetachedFromWindow() { PrivacyCoordinator.detach(this); super.onDetachedFromWindow() }
  override fun onWindowFocusChanged(hasWindowFocus: Boolean) {
    super.onWindowFocusChanged(hasWindowFocus)
    entry?.focused = hasWindowFocus
    PrivacyCoordinator.refresh()
  }
  override fun onWindowVisibilityChanged(visibility: Int) {
    super.onWindowVisibilityChanged(visibility)
    PrivacyCoordinator.refresh()
  }
}

class GCNativePrivacyModule : Module() {
  private val observer = UUID.randomUUID()
  override fun definition() = ModuleDefinition {
    Name("GCNativePrivacy")
    Events("onStateChange")
    OnCreate {
      PrivacyCoordinator.main.post {
        PrivacyCoordinator.listen(observer) { state ->
          sendEvent("onStateChange", mapOf("epoch" to state.epoch.toDouble(), "active" to state.active))
        }
      }
    }
    OnDestroy { PrivacyCoordinator.main.post { PrivacyCoordinator.remove(observer) } }
    AsyncFunction("readState") {
      val state = PrivacyCoordinator.read()
      mapOf("epoch" to state.epoch.toDouble(), "active" to state.active)
    }.runOnQueue(Queues.MAIN)
    View(GCPrivacyPresentationView::class) {
      Prop("epoch") { view: GCPrivacyPresentationView, value: Double -> view.setEpoch(value) }
      Prop("sessionGeneration") { view: GCPrivacyPresentationView, value: Double -> view.setGeneration(value) }
      Prop("presentationId") { view: GCPrivacyPresentationView, value: String -> view.setPresentationId(value) }
      Prop("ready") { view: GCPrivacyPresentationView, value: Boolean -> view.setReady(value) }
      OnViewDidUpdateProps { view: GCPrivacyPresentationView -> view.propsChanged() }
      OnViewDestroys { view: GCPrivacyPresentationView -> view.destroy() }
    }
  }
}
