import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { AccessibilityInfo, ActivityIndicator, AppState, Platform, View } from "react-native";
import type { createNativeRuntime } from "../session/runtime";
import type { SessionSnapshot } from "../session/session-controller";
import type { ReadingSnapshot } from "../reading/read-controller";
import { observeSessionVisibility } from "../platform/session-visibility";
import { readNativeWindowFocus } from "../platform/native-visibility";
import { Button, Card, Screen, Text } from "./primitives";
import { NativePost } from "./NativePost";
import { PasswordSignIn } from "./PasswordSignIn";
import { useTheme } from "./theme";

type Runtime = ReturnType<typeof createNativeRuntime>;
type SignInMode = { kind: "password" } | { kind: "fixture"; signIn: () => Promise<void>;
  credentials: Readonly<{ email: string; password: string }> };

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

function Reading({ runtime, state, post }: { runtime: Runtime; state: ReadingSnapshot; post: boolean }) {
  const { theme } = useTheme();
  function act(command: () => Promise<unknown>) {
    // Only direct user interaction renews activity. Passive rendering, native
    // lifecycle notifications and the reader's recheck timer never call this.
    void runtime.recordForegroundActivity();
    void command();
  }
  const open = (id: string) => act(() => runtime.open({ kind: "post", postId: id }));
  return <>
    <Text variant="title">{post ? "Post" : "Your community"}</Text>
    {post ? <Button label="Back to feed" secondary onPress={() => act(runtime.backToFeed)} /> : null}
    {state.kind === "loading" ? <View accessibilityLiveRegion="polite" style={{ gap: theme.space.content }}>
      <ActivityIndicator color={theme.color.action} /><Text>Checking current access and loading {state.target === "post" ? "post" : "posts"}...</Text>
    </View> : null}
    {state.kind === "error" ? <ReadingError state={state} runtime={runtime} act={act} /> : null}
    {state.kind === "feed" ? <>
      <View style={{ gap: theme.space.inline }}>
        <Button label="Latest" secondary selected={state.feed.mode === "latest"} onPress={() => act(() => runtime.startFeed("latest"))} />
        <Button label="Friends" secondary selected={state.feed.mode === "friends"} onPress={() => act(() => runtime.startFeed("friends"))} />
        <Button label="Refresh feed" secondary onPress={() => act(runtime.refresh)} />
      </View>
      {state.feed.notice ? <Text accessibilityLiveRegion="polite">{state.feed.notice}</Text> : null}
      {state.feed.page.items.length === 0 ? <Text>No posts are available in this feed yet.</Text> : null}
      {state.feed.page.items.map((item, index) => <NativePost key={item.id + ":" + index} post={item} onOpen={open} />)}
      {state.feed.page.nextCursor ? <Button label="Next page" onPress={() => act(runtime.nextPage)} /> : <Text variant="small" tone="muted">You're up to date on this page.</Text>}
    </> : null}
    {state.kind === "post" ? <NativePost post={state.post} detail revealed={state.revealed} onOpen={open}
      onReveal={() => act(runtime.reveal)} /> : null}
    {state.kind === "idle" ? <Button label="Load posts" onPress={() => act(() => runtime.startFeed("latest"))} /> : null}
  </>;
}

/** The caller owns one runtime. No native credentials or network activate from
 * this import. Real password mode requires the separate native acceptance gates. */
export function NativeJourney({ runtime, signInMode, previewTools }:
  { runtime: Runtime; signInMode: SignInMode; previewTools?: ReactNode }) {
  const state = useSyncExternalStore(runtime.session.subscribe, runtime.session.getSnapshot);
  const navigation = useSyncExternalStore(runtime.navigation.subscribe, runtime.navigation.getSnapshot);
  const reading = useSyncExternalStore(runtime.reading.subscribe, runtime.reading.getSnapshot);
  const [scroll, setScroll] = useState({ generation: state.generation, page: "" });
  // Keep just one bounded page address through a loading/recheck state. A new
  // page resets scrolling; rechecking the same page or revealing text does not.
  const page = reading.kind === "feed" ? JSON.stringify([reading.feed.mode, reading.feed.scope, reading.feed.pageCursor]) :
    scroll.generation === state.generation ? scroll.page : "";
  if (scroll.generation !== state.generation || scroll.page !== page) setScroll({ generation: state.generation, page });
  useEffect(() => observeSessionVisibility({
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
  const visible = state.foreground && state.phase !== "concealed";
  const post = navigation.destination?.kind === "post";
  const routeKey = post ? "post:" + navigation.destination.postId : "feed:" + page;
  return <Screen foreground={visible} scrollKey={state.generation + ":" + routeKey}>
    <Text variant="small" tone="muted">GOD'S CHURCHES</Text>
    {signInMode.kind === "fixture" ? <Text variant="small" tone="muted">Development preview. Fictional accounts and posts only.</Text> : null}
    <SessionNotice state={state} runtime={runtime} />
    {state.phase === "signed-out" ? <SignIn key={state.generation} runtime={runtime} mode={signInMode} /> : null}
    {state.phase === "verifying" || state.phase === "signing-in" ? <>
      <Text accessibilityLiveRegion="polite">{state.phase === "signing-in" ? "Signing in..." : "Checking your session..."}</Text>
      <Button label="Cancel and sign out" secondary onPress={() => { void runtime.cancelSignIn(); }} />
    </> : null}
    {state.phase === "unavailable" ? <Button label="Check access again" onPress={() => { void runtime.retryVerification(); }} /> : null}
    {state.phase === "ready" && state.account ? <Reading key={state.account.id + ":" + state.generation} runtime={runtime} state={reading} post={post} /> : null}
    {state.phase === "ready" || state.phase === "unavailable" || state.cleanup === "cleanup-pending" || state.cleanup === "unconfirmed" ?
      <Button label={state.phase === "ready" ? "Sign out" : "Retry sign-out"} secondary onPress={() => { void runtime.signOut(); }} /> : null}
    {signInMode.kind === "fixture" ? previewTools : null}
  </Screen>;
}
