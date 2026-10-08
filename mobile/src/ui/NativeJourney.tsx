import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { AccessibilityInfo, ActivityIndicator, AppState, Platform, View, type ScrollView, type ScrollViewProps } from "react-native";
import type { createNativeRuntime } from "../session/runtime";
import type { SessionSnapshot } from "../session/session-controller";
import type { ReadingSnapshot } from "../reading/read-controller";
import { observeSessionVisibility } from "../platform/session-visibility";
import { readNativeWindowFocus } from "../platform/native-visibility";
import { createNativePrivacySource } from "../platform/native-privacy.native";
import { presentationMatches, type NativePrivacyPresentation as Presentation } from "../platform/native-privacy.ts";
import { Button, Card, Screen, Text } from "./primitives";
import { NativePost } from "./NativePost";
import { NativePendingLike, NativePostLike } from "./NativePostLike";
import { NativeFeedChoices } from "./NativeFeedChoices";
import { captureFeedScrollPosition, restoreFeedScrollPosition, type FeedScrollIdentity, type FeedScrollPosition } from "./feed-scroll-position";
import { PasswordSignIn } from "./PasswordSignIn";
import { NativePrivacyPresentation } from "./NativePrivacyPresentation";
import { useTheme } from "./theme";

type Runtime = ReturnType<typeof createNativeRuntime>;
type SignInMode = { kind: "password" } | { kind: "fixture"; signIn: () => Promise<void>;
  credentials: Readonly<{ email: string; password: string }> };

type FeedScrollMemory = { runtime: Runtime; position: FeedScrollPosition | null; mount: object | null };

/** A response owns stable handlers, but only an attached native view may use
 * them. The bookmark contains an address and pixels, never retained feed data. */
function feedScrollHandlers(runtime: Runtime, reading: Extract<ReadingSnapshot, { kind: "feed" }>,
  identity: FeedScrollIdentity, memory: FeedScrollMemory) {
  let view: ScrollView | null = null, attachment: object | null = null;
  let viewportHeight: number | null = null, contentHeight: number | null = null;
  let measured = false, pending: number | null = null;
  let detach: (() => void) | undefined;
  function current() {
    const attached = attachment, nativeView = view;
    if (!attached || !nativeView || memory.runtime !== runtime || memory.mount !== attached) return null;
    const session = runtime.session.getSnapshot();
    const currentReading = runtime.reading.getSnapshot();
    // Reading/session getters can synchronously expire access and notify React.
    // Recheck the session and attachment after those calls before any mutation.
    return session.foreground && session.phase === "ready" && session.account?.id === identity.owner &&
      session.generation === identity.generation && currentReading === reading &&
      runtime.session.getSnapshot() === session && runtime.reading.getSnapshot() === reading &&
      attachment === attached && memory.mount === attached && view === nativeView
      ? nativeView : null;
  }
  function restore() {
    if (measured || viewportHeight === null || contentHeight === null || !current()) return;
    const target = restoreFeedScrollPosition(memory.position, identity, { viewportHeight, contentHeight });
    const nativeView = current();
    if (!nativeView) return;
    measured = true;
    pending = target;
    if (target === null) memory.position = null;
    else {
      // A queued zero event must not replace the bookmark before native scroll
      // acknowledgement. A direct drag can take over if no event is emitted.
      nativeView.scrollTo({ x: 0, y: target, animated: false });
    }
  }
  function capture(y: number, dragging: boolean) {
    if (!current() || !Number.isFinite(y) || y < 0) return;
    if (dragging) { measured = true; pending = null; }
    if (!measured || (pending !== null && Math.abs(y - pending) > 1)) return;
    pending = null;
    memory.position = captureFeedScrollPosition(identity, y);
  }
  return {
    scrollRef(nativeView: ScrollView | null) {
      detach?.();
      if (!nativeView) return;
      const attached = {};
      if (memory.runtime !== runtime) memory.position = null;
      memory.runtime = runtime;
      attachment = attached; view = nativeView; memory.mount = attached;
      viewportHeight = null; contentHeight = null; measured = false; pending = null;
      const cleanup = () => {
        if (memory.mount === attached) memory.mount = null;
        if (attachment === attached) { attachment = null; view = null; }
      };
      detach = cleanup;
      return cleanup;
    },
    onLayout: ((event) => {
      if (!current()) return;
      const height = event.nativeEvent.layout.height;
      if (!Number.isFinite(height) || height <= 0) return;
      viewportHeight = height; restore();
    }) satisfies NonNullable<ScrollViewProps["onLayout"]>,
    onContentSizeChange: ((_width, height) => {
      if (!current() || !Number.isFinite(height) || height < 0) return;
      contentHeight = height; restore();
    }) satisfies NonNullable<ScrollViewProps["onContentSizeChange"]>,
    onScroll: ((event) => capture(event.nativeEvent.contentOffset.y, false)) satisfies NonNullable<ScrollViewProps["onScroll"]>,
    onScrollBeginDrag: ((event) => capture(event.nativeEvent.contentOffset.y, true)) satisfies NonNullable<ScrollViewProps["onScrollBeginDrag"]>,
    scrollEventThrottle: 16
  };
}

function useIosStatus(runtime: Runtime, message: string | null) {
  useEffect(() => {
    // Read current visibility when the effect runs, not a captured render value.
    // These announcements contain generic status only, never account/post text.
    if (Platform.OS === "ios" && message && runtime.session.getSnapshot().foreground)
      AccessibilityInfo.announceForAccessibility(message);
  }, [runtime, message]);
}

function SessionNotice({ state, runtime }: { state: SessionSnapshot; runtime: Runtime }) {
  const messages: Record<NonNullable<SessionSnapshot["problem"]>, string> = {
    "verification-unavailable": "We could not confirm your current access. Your account content is hidden.",
    "storage-unavailable": "Secure storage is unavailable. Your account content is hidden.",
    "sign-in-required": "Please sign in again to continue.",
    "sign-in-failed": "Sign-in could not be completed. Check your details and try again.",
    "sign-in-unconfirmed": "The sign-in response was interrupted. Its server outcome could not be confirmed.",
    "session-expired": "Your session needs to be checked again before you continue.",
    "service-unavailable": "This service is currently unavailable. Please try again later.",
    "update-required": "This app version is not supported by the server. Update the app before continuing."
  };
  const announcement = state.problem ? messages[state.problem] :
    state.cleanup === "unconfirmed" ? "Sign-out cleanup could not be confirmed. Retry sign-out." :
    state.cleanup === "cleanup-pending" ? "Access is blocked. Secure storage cleanup is pending." :
    state.revocation === "unconfirmed" ? "Server sign-out could not be confirmed." :
    state.revocation === "confirmed" ? "Server sign-out confirmed." :
    state.phase === "signing-in" ? "Signing in." : state.phase === "verifying" ? "Checking your session." : null;
  useIosStatus(runtime, announcement);
  return <>
    {state.problem ? <Text accessibilityLiveRegion="polite" tone="error">{messages[state.problem]}</Text> : null}
    {state.cleanup === "cleared" ? <Text accessibilityLiveRegion="polite">Saved sign-in details have been removed from this device.</Text> : null}
    {state.cleanup === "cleanup-pending" ? <Text accessibilityLiveRegion="polite">Access is blocked on this device. Secure storage cleanup still needs to finish.</Text> : null}
    {state.cleanup === "unconfirmed" ? <Text accessibilityLiveRegion="polite" tone="error">Your account content is hidden, but removal of saved sign-in details could not be confirmed. Retry sign-out.</Text> : null}
    {state.revocation === "pending" ? <Text accessibilityLiveRegion="polite">Confirming sign-out with the server...</Text> : null}
    {state.revocation === "confirmed" ? <Text accessibilityLiveRegion="polite">Server sign-out confirmed.</Text> : null}
    {state.revocation === "unconfirmed" ? <Text accessibilityLiveRegion="polite">Server sign-out could not be confirmed. Your account content is hidden. You can review your sessions on the website.</Text> : null}
  </>;
}

function SignIn({ runtime, mode }: { runtime: Runtime; mode: SignInMode }) {
  const [previewForm, setPreviewForm] = useState(false);
  // This component is keyed by session generation and unmounted on concealment
  // or sign-in. Submitted values never enter navigation, storage or diagnostics.
  return <Card>
    <Text variant="heading">Welcome to God's Churches</Text>
    <Text>Connect with your community, share encouragement and make room for prayer.</Text>
    {mode.kind === "fixture" ? <>
      {previewForm ? <>
        <Text variant="subheading">Fictional sign-in form</Text>
        <Text>Do not enter real account details. Use only the fictional details below.</Text>
        <Text variant="small">Email: {mode.credentials.email}</Text>
        <Text variant="small">Password: {mode.credentials.password}</Text>
        <PasswordSignIn runtime={runtime} />
        <Button label="Back to demo button" secondary onPress={() => setPreviewForm(false)} />
      </> : <>
        <Button label="Continue with demo account" onPress={() => { void mode.signIn(); }} />
        <Button label="Try fictional sign-in form" secondary onPress={() => setPreviewForm(true)} />
      </>}
    </> : <PasswordSignIn runtime={runtime} />}
  </Card>;
}

function ReadingError({ state, runtime, act }: { state: Extract<ReadingSnapshot, { kind: "error" }>; runtime: Runtime;
  act: (command: () => Promise<unknown>) => void }) {
  const messages = {
    unavailable: "This content could not be checked. Please try again when your connection is available.",
    "feature-unavailable": "This feature is currently unavailable in the app.",
    "not-found": "This content is unavailable or you no longer have access.",
    "refresh-required": "This page has changed. Refresh the feed to continue.",
    "recovery-required": "Your account needs attention on the website before you can continue.",
    "update-required": "This app needs an update before it can read this content.",
    "rate-limited": "Please wait before trying again."
  };
  useIosStatus(runtime, messages[state.problem]);
  return <Card>
    <Text accessibilityLiveRegion="polite">{messages[state.problem]}</Text>
    {state.problem === "rate-limited" && state.retryAfterSeconds !== null ?
      <Text variant="small" tone="muted">The server requested a pause of {state.retryAfterSeconds} seconds.</Text> : null}
    {state.problem === "refresh-required" ? <Button label="Refresh feed" onPress={() => act(runtime.refresh)} /> :
      state.problem === "feature-unavailable" ? <Button label="Check availability" onPress={() => act(runtime.retry)} /> :
      ["unavailable", "rate-limited"].includes(state.problem) ? <Button label="Try again" onPress={() => act(runtime.retry)} /> : null}
  </Card>;
}

function Reading({ runtime, state, post, clearScroll }:
  { runtime: Runtime; state: ReadingSnapshot; post: boolean; clearScroll: () => void }) {
  const { theme } = useTheme();
  function act(command: () => Promise<unknown>) {
    // Only direct user interaction renews activity. Passive rendering, native
    // lifecycle notifications and the reader's recheck timer never call this.
    void runtime.recordForegroundActivity();
    void command();
  }
  function reset(command: () => Promise<unknown>) { clearScroll(); act(command); }
  const open = (id: string) => act(() => runtime.open({ kind: "post", postId: id }));
  return <>
    <Text variant="title">{post ? "Post" : "Your community"}</Text>
    {post ? <Button label="Back to feed" secondary onPress={() => act(runtime.backToFeed)} /> : null}
    {state.kind === "loading" ? <View accessibilityLiveRegion="polite" style={{ gap: theme.space.content }}>
      <ActivityIndicator color={theme.color.action} /><Text>Checking current access and loading {state.target === "post" ? "post" : "posts"}...</Text>
    </View> : null}
    {state.kind === "error" ? <ReadingError state={state} runtime={runtime} act={reset} /> : null}
    {state.kind === "feed" ? <>
      <View style={{ gap: theme.space.inline }}>
        <NativeFeedChoices mode={state.feed.mode} onChoose={(mode) => reset(() => runtime.startFeed(mode))}
          onRefresh={() => reset(runtime.refresh)} />
      </View>
      {state.feed.notice ? <Text accessibilityLiveRegion="polite">{state.feed.notice}</Text> : null}
      {state.feed.page.items.length === 0 ? <Text>No posts are available in this feed yet.</Text> : null}
      {state.feed.page.items.map((item, index) => <NativePost key={item.id + ":" + index} post={item} onOpen={open} />)}
      {state.feed.page.nextCursor ? <Button label="Next page" onPress={() => reset(runtime.nextPage)} /> : <Text variant="small" tone="muted">You're up to date on this page.</Text>}
    </> : null}
    <NativePendingLike runtime={runtime} />
    {state.kind === "post" ? <NativePost post={state.post} detail revealed={state.revealed} onOpen={open}
      onReveal={() => act(runtime.reveal)} interaction={<NativePostLike runtime={runtime} postId={state.post.id} />} /> : null}
    {state.kind === "idle" ? <Button label="Load posts" onPress={() => reset(() => runtime.startFeed("latest"))} /> : null}
  </>;
}

/** The caller owns one runtime. No native credentials or network activate from
 * this import. Real password mode requires the separate native acceptance gates. */
export function NativeJourney({ runtime, signInMode, previewTools }:
  { runtime: Runtime; signInMode: SignInMode; previewTools?: ReactNode }) {
  const state = useSyncExternalStore(runtime.session.subscribe, runtime.session.getSnapshot);
  const navigation = useSyncExternalStore(runtime.navigation.subscribe, runtime.navigation.getSnapshot);
  const reading = useSyncExternalStore(runtime.reading.subscribe, runtime.reading.getSnapshot);
  const [presentation, setPresentation] = useState<Presentation | null>(null);
  const memory = useRef<FeedScrollMemory>({ runtime, position: null, mount: null }).current;
  const owner = state.account?.id ?? null;
  const makeScroll = (revision: number) => ({ runtime, reading, owner, generation: state.generation, revision,
    handlers: reading.kind === "feed" && owner ? feedScrollHandlers(runtime, reading,
      { owner, generation: state.generation, mode: reading.feed.mode, scope: reading.feed.scope, pageCursor: reading.feed.pageCursor }, memory) : null });
  const [scroll, setScroll] = useState(() => makeScroll(0));
  // Keep only the current response. Even coalesced loading renders must produce
  // a fresh native mount when a newly authorized response has the same address.
  if (scroll.runtime !== runtime || scroll.reading !== reading || scroll.owner !== owner || scroll.generation !== state.generation)
    setScroll(makeScroll(scroll.revision + 1));
  useEffect(() => observeSessionVisibility({
    nativePrivacy: Platform.OS === "ios" || Platform.OS === "android" ? { source: createNativePrivacySource(),
      generation: () => runtime.session.getSnapshot().generation, publish: setPresentation } : undefined,
    requiresFocus: Platform.OS === "android",
    currentFocus: readNativeWindowFocus,
    currentState: () => AppState.isAvailable ? AppState.currentState : null,
    onState(listener) {
      const subscription = AppState.addEventListener("change", listener);
      return () => subscription.remove();
    },
    onFocus(listener) {
      const focus = AppState.addEventListener("focus", () => listener(true));
      try {
        const blur = AppState.addEventListener("blur", () => listener(false));
        return () => { try { focus.remove(); } finally { blur.remove(); } };
      } catch (error) { focus.remove(); throw error; }
    }
  }, runtime.setForeground), [runtime]);
  const visible = state.foreground && state.phase !== "concealed" &&
    ((Platform.OS !== "ios" && Platform.OS !== "android") || presentationMatches(presentation, state));
  function clearScroll() { memory.position = null; memory.mount = null; }
  useLayoutEffect(() => {
    if (!visible || state.phase !== "ready" || !owner || reading.kind === "error") {
      memory.position = null; memory.mount = null;
    } else if (memory.position && (memory.position.identity.owner !== owner || memory.position.identity.generation !== state.generation))
      memory.position = null;
  }, [visible, state.phase, owner, state.generation, reading.kind, memory]);
  useLayoutEffect(() => () => {
    // An old runtime's layout cleanup may run after the new native ref attaches.
    if (memory.runtime === runtime) { memory.position = null; memory.mount = null; }
  }, [runtime, memory]);
  const post = navigation.destination?.kind === "post";
  const feedVisible = visible && state.phase === "ready" && !!owner && reading.kind === "feed" && !post;
  const routeKey = post ? "post:" + navigation.destination.postId : "feed:" + (feedVisible ? scroll.revision : "");
  return <><Screen foreground={visible} scrollKey={state.generation + ":" + routeKey} {...(feedVisible ? scroll.handlers : null)}>
    <Text variant="small" tone="muted">GOD'S CHURCHES</Text>
    {signInMode.kind === "fixture" ? <Text variant="small" tone="muted">Development preview. Fictional accounts and posts only.</Text> : null}
    <SessionNotice state={state} runtime={runtime} />
    {state.phase === "signed-out" ? <SignIn key={state.generation} runtime={runtime} mode={signInMode} /> : null}
    {state.phase === "verifying" || state.phase === "signing-in" ? <>
      <Text accessibilityLiveRegion="polite">{state.phase === "signing-in" ? "Signing in..." : "Checking your session..."}</Text>
      <Button label="Cancel and sign out" secondary onPress={() => { void runtime.cancelSignIn(); }} />
    </> : null}
    {state.phase === "unavailable" ? <Button label="Check access again" onPress={() => { void runtime.retryVerification(); }} /> : null}
    {state.phase === "ready" && state.account ? <Reading key={state.account.id + ":" + state.generation} runtime={runtime} state={reading} post={post} clearScroll={clearScroll} /> : null}
    {state.phase === "ready" || state.phase === "unavailable" || state.cleanup === "cleanup-pending" || state.cleanup === "unconfirmed" ?
      <Button label={state.phase === "ready" ? "Sign out" : "Retry sign-out"} secondary onPress={() => { void runtime.signOut(); }} /> : null}
    {signInMode.kind === "fixture" ? previewTools : null}
  </Screen><NativePrivacyPresentation presentation={presentation} generation={state.generation} ready={visible} /></>;
}
