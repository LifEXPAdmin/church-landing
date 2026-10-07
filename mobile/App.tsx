import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AccessibilityInfo, BackHandler, Keyboard, Platform } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as Linking from "expo-linking";
import { createNativeFixture } from "./src/spike/native-fixture";
import { fixturePostFromLink } from "./src/spike/links";
import { observeNativeLinks } from "./src/navigation/link-intake";
import { probeSecureStorage } from "./src/platform/storage-probe";
import { handleAndroidBack } from "./src/platform/android-back";
import { ThemeProvider } from "./src/ui/theme";
import { Button, Card, Screen, Text } from "./src/ui/primitives";
import { DisplayControls } from "./src/ui/DisplayControls";
import { NativeJourney } from "./src/ui/NativeJourney";

type Fixture = ReturnType<typeof createNativeFixture>;

function Preview({ fixture }: { fixture: Fixture }) {
  const { runtime } = fixture;
  const session = useSyncExternalStore(runtime.session.subscribe, runtime.session.getSnapshot);
  const [probe, setProbe] = useState("Not checked"), [linkStatus, setLinkStatus] = useState("");
  const storageRunning = useRef(false);
  useEffect(() => {
    if (Platform.OS === "ios" && runtime.session.getSnapshot().foreground && linkStatus)
      AccessibilityInfo.announceForAccessibility(linkStatus);
  }, [runtime, linkStatus]);
  useEffect(() => {
    if (Platform.OS === "ios" && runtime.session.getSnapshot().foreground && probe !== "Not checked")
      AccessibilityInfo.announceForAccessibility("Secure storage: " + probe);
  }, [runtime, probe]);

  useEffect(() => observeNativeLinks(runtime, {
    initial: () => Linking.getInitialURL(),
    subscribe(listener) {
      const subscription = Linking.addEventListener("url", ({ url }) => listener(url));
      return () => subscription.remove();
    }
  }, value => {
    const id = fixturePostFromLink(value);
    return id ? { kind: "post", postId: id } : null;
  }, value => setLinkStatus(value === "opened" ? "App link received." : value === "sign-in-required" ?
    "App link received. Continue with the demo account to open the post." : value === "unavailable" ?
      "Open the app link again after checking access." : "")), [runtime]);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => handleAndroidBack({
      isKeyboardVisible: () => Keyboard.isVisible(), dismissKeyboard: () => Keyboard.dismiss(),
      goBack: () => {
        if (runtime.session.getSnapshot().phase !== "ready" || runtime.navigation.getSnapshot().destination?.kind !== "post") return false;
        void runtime.recordForegroundActivity(); void runtime.backToFeed(); return true;
      }
    }));
    return () => subscription.remove();
  }, [runtime]);

  async function checkStorage() {
    if (storageRunning.current) return;
    storageRunning.current = true; setProbe("Checking");
    try { setProbe(await probeSecureStorage() ? "Write, read and removal passed." : "Secure storage is unavailable."); }
    catch { setProbe("Secure storage check failed. Retry on a native development build."); }
    finally { storageRunning.current = false; }
  }
  async function checkLink() {
    try {
      setLinkStatus("");
      await Linking.openURL(Linking.createURL("spike/post/fixture-welcome"));
      // Only receipt of the matching incoming event demonstrates the round trip.
      setLinkStatus(current => current || "Link opened. Waiting for the app to receive it.");
    } catch { setLinkStatus("Link could not open. Use a native development build."); }
  }
  function readCase(prepare: () => void) {
    prepare(); void runtime.recordForegroundActivity(); void runtime.refresh();
  }
  return <NativeJourney runtime={runtime} signInMode={{ kind: "fixture", signIn: fixture.signIn }} previewTools={<>
    <Card>
      <Text variant="heading">Preview checks</Text>
      <Text variant="small" tone="muted">Fictional responses stay in memory. These checks do not connect to a real account.</Text>
      <Button label="Try interrupted read" secondary disabled={session.phase !== "ready"} onPress={() => readCase(fixture.failNextRead)} />
      <Button label="Try empty feed" secondary disabled={session.phase !== "ready"} onPress={() => readCase(fixture.emptyNextFeed)} />
      <Button label="Test app link" secondary onPress={() => { void checkLink(); }} />
      {linkStatus ? <Text accessibilityLiveRegion="polite">{linkStatus}</Text> : null}
      <Text accessibilityLiveRegion="polite">Secure storage: {probe}</Text>
      <Button label="Check secure storage" secondary disabled={probe === "Checking"} onPress={() => { void checkStorage(); }} />
    </Card>
    <DisplayControls />
  </>} />;
}

function FixtureOwner() {
  const [fixture, setFixture] = useState<Fixture | null>(null);
  useEffect(() => {
    const created = createNativeFixture();
    setFixture(created);
    // Each setup creates a fresh owner. StrictMode never reuses a disposed one.
    return () => created.runtime.dispose();
  }, []);
  return fixture ? <Preview fixture={fixture} /> : <Screen><Text variant="title">God's Churches</Text></Screen>;
}

export default function App() {
  return <SafeAreaProvider><ThemeProvider><FixtureOwner /></ThemeProvider></SafeAreaProvider>;
}
