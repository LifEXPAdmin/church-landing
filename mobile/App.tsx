import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AccessibilityInfo, ActivityIndicator, AppState, BackHandler, Platform, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { fetch as nativeFetch } from "expo/fetch";
import * as Linking from "expo-linking";
import { createFixtureJourney } from "./src/spike/journey";
import { createFixtureHttpReader } from "./src/spike/http";
import { fixturePostFromLink } from "./src/spike/links";
import { probeSecureStorage } from "./src/platform/storage-probe";
import { Action } from "./src/ui/Action";
import { PostPreview } from "./src/ui/PostPreview";
import { ThemeProvider, useTheme } from "./src/ui/theme";
import { Card, Screen, Text } from "./src/ui/primitives";
import { DisplayControls } from "./src/ui/DisplayControls";

function useIosAnnouncement(message: string | null, foreground: boolean) {
  useEffect(() => {
    if (Platform.OS === "ios" && foreground && message) AccessibilityInfo.announceForAccessibility(message);
  }, [message, foreground]);
}

function Journey() {
  const { theme } = useTheme();
  const [journey] = useState(() => createFixtureJourney(createFixtureHttpReader(Platform.OS === "android" ? "http://10.0.2.2:4084" : "http://127.0.0.1:4084", nativeFetch)));
  const state = useSyncExternalStore(journey.subscribe, journey.getSnapshot);
  const [probe, setProbe] = useState("Not checked");
  const [probeBusy, setProbeBusy] = useState(false);
  const [linkStatus, setLinkStatus] = useState("");
  const pendingLink = useRef<string | null>(null);
  const storageRunning = useRef(false);
  const [foreground, setForeground] = useState(AppState.currentState === "active");
  useIosAnnouncement(state.screen === "welcome" ? state.notice : null, foreground);
  useIosAnnouncement(linkStatus, foreground);
  useIosAnnouncement(probe !== "Not checked" && probe !== "Checking" ? "Secure storage: " + probe : null, foreground);

  useEffect(() => () => journey.dispose(), [journey]);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => setForeground(next === "active"));
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    let mounted = true;
    const receive = (url: string | null) => {
      if (!mounted || !url) return;
      const postId = fixturePostFromLink(url);
      if (!postId) return;
      if (journey.openPost(postId)) {
        pendingLink.current = null;
        setLinkStatus("App link received.");
      } else {
        pendingLink.current = postId;
        setLinkStatus("App link received. Continue with the demo account to open the post.");
      }
    };
    const subscription = Linking.addEventListener("url", ({ url }) => receive(url));
    void Linking.getInitialURL().then(receive).catch(() => {});
    return () => { mounted = false; subscription.remove(); };
  }, [journey]);
  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (journey.getSnapshot().screen !== "post") return false;
      journey.back();
      return true;
    });
    return () => subscription.remove();
  }, [journey]);

  async function checkStorage() {
    if (storageRunning.current) return;
    storageRunning.current = true;
    setProbeBusy(true);
    setProbe("Checking");
    try { setProbe(await probeSecureStorage() ? "Write, read and removal passed." : "Secure storage is unavailable."); }
    catch { setProbe("Secure storage check failed. Retry on a native development build."); }
    finally { storageRunning.current = false; setProbeBusy(false); }
  }
  async function loadDemo(read: () => Promise<boolean> | undefined) {
    if (!(await read())) return;
    const target = pendingLink.current;
    if (target && journey.openPost(target)) {
      pendingLink.current = null;
      setLinkStatus("App link received.");
    }
  }
  async function checkLink() {
    try {
      await Linking.openURL(Linking.createURL("spike/post/fixture-welcome"));
      // The incoming event is the round-trip evidence, not openURL resolving.
      setLinkStatus((current) => current === "App link received." ? current : "Link opened. Waiting for the app to receive it.");
    } catch { setLinkStatus("Link could not open. Use a native development build."); }
  }

  return <Screen foreground={foreground} scrollKey={state.screen === "post" ? state.post.id : state.screen}>
      <Text variant="small" tone="muted" style={{ fontWeight: "600", letterSpacing: 1 }}>GOD'S CHURCHES</Text>
      <Text variant="small" tone="muted">Development preview. Fictional accounts and posts only.</Text>
      {state.screen === "welcome" ? <>
        <Text accessibilityRole="header" variant="title">A place to belong.</Text>
        <Text variant="body">Connect with your community, share encouragement and make room for prayer.</Text>
        <Card>
          <Text accessibilityRole="header" variant="heading">Try the first journey</Text>
          <Text variant="body">Continue as Alex, a demo member. Real sign-in will connect after the shared account adapter is verified.</Text>
          <Action label="Continue with demo account" onPress={() => { void loadDemo(journey.start); }} />
        </Card>
        {state.notice ? <Text accessibilityLiveRegion="polite" variant="body">{state.notice}</Text> : null}
      </> : <>
        <View style={{ gap: theme.space.content }}>
          <Text accessibilityRole="header" variant="title">{state.screen === "post" ? "Post" : "Your community"}</Text>
          <Action label="Sign out of demo" secondary onPress={() => { journey.signOut(); pendingLink.current = null; setLinkStatus(""); }} />
        </View>
        {state.screen === "feed" ? <>
          {state.status === "loading" ? <View accessibilityLiveRegion="polite"><ActivityIndicator color={theme.color.action} /><Text variant="body">Loading demo posts...</Text></View> : null}
          {state.status === "error" ? <Card><Text accessibilityRole="alert" variant="body">The demo could not load. Your next read starts when you retry.</Text><Action label="Retry demo feed" onPress={() => { void loadDemo(journey.retry); }} /></Card> : null}
          {state.status === "ready" && state.posts.length === 0 ? <Text variant="body">No demo posts yet.</Text> : null}
          {state.posts.map((post) => <PostPreview key={post.id} post={post} onOpen={() => journey.openPost(post.id)} />)}
          <Action label="Try offline state" secondary disabled={state.status === "loading"} onPress={() => { void journey.simulateOffline(); }} />
        </> : <Card>
          <Action label="Back to feed" secondary onPress={journey.back} />
          <Text variant="small" tone="muted" style={{ fontWeight: "600", letterSpacing: 1 }}>{state.post.author}</Text>
          <Text accessibilityRole="header" variant="heading">{state.post.title}</Text>
          {state.revealed ? <Text variant="reader">{state.post.body}</Text> : <>
            <Text variant="body">Content note: {state.post.contentNote}</Text>
            <Text variant="body">{state.post.excerpt}</Text>
            <Action label="Reveal this demo post" onPress={journey.reveal} />
          </>}
        </Card>}
        <Action label="Test app link" secondary onPress={() => { setLinkStatus(""); void checkLink(); }} />
      </>}
      {linkStatus ? <Text accessibilityLiveRegion="polite" variant="body">{linkStatus}</Text> : null}
      <Card>
        <Text accessibilityRole="header" variant="heading">Device checks</Text>
        <Text accessibilityLiveRegion="polite" variant="body">Secure storage: {probe}</Text>
        <Action label="Check secure storage" secondary disabled={probeBusy} onPress={() => { void checkStorage(); }} />
      </Card>
      <DisplayControls />
  </Screen>;
}
export default function App() { return <SafeAreaProvider><ThemeProvider><Journey /></ThemeProvider></SafeAreaProvider>; }
