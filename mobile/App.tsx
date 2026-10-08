import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AccessibilityInfo, BackHandler, Keyboard, Platform } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as Linking from "expo-linking";
import { createNativeFixture } from "./src/spike/native-fixture";
import { selectApplicationConfiguration } from "./application-configuration";
import { createNativeApplication } from "./src/session/native-application";
import { fixturePostFromLink } from "./src/spike/links";
import { observeNativeLinks } from "./src/navigation/link-intake";
import { handleAndroidBack } from "./src/platform/android-back";
import { ThemeProvider } from "./src/ui/theme";
import { Button, Card, Screen, Text } from "./src/ui/primitives";
import { DisplayControls } from "./src/ui/DisplayControls";
import { NativeJourney } from "./src/ui/NativeJourney";

const DiagnosticControls = __DEV__
  // Metro removes this development-only dependency from non-development exports.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ? (require("./src/ui/DiagnosticControls") as typeof import("./src/ui/DiagnosticControls")).DiagnosticControls
  : null;

type Fixture = ReturnType<typeof createNativeFixture>;

function useAndroidBack(runtime: Fixture["runtime"]) {
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
}

function Preview({ fixture }: { fixture: Fixture }) {
  const { runtime } = fixture;
  useAndroidBack(runtime);
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

  async function checkStorage() {
    if (storageRunning.current) return;
    storageRunning.current = true; setProbe("Checking");
    try {
      // The optional fixture check must not bind storage in an unavailable build.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { probeSecureStorage } = require("./src/platform/storage-probe") as typeof import("./src/platform/storage-probe");
      setProbe(await probeSecureStorage() ? "Write, read and removal passed." : "Secure storage is unavailable.");
    }
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
  return <NativeJourney runtime={runtime} signInMode={{ kind: "fixture", signIn: fixture.signIn, credentials: fixture.credentials }} previewTools={<>
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
    {DiagnosticControls ? <DiagnosticControls /> : null}
  </>} />;
}

type Application = { kind: "fixture"; fixture: Fixture } | ReturnType<typeof createNativeApplication>;

function ConnectedJourney({ runtime }: { runtime: Fixture["runtime"] }) {
  useAndroidBack(runtime);
  return <NativeJourney runtime={runtime} signInMode={{ kind: "password" }} />;
}

function ApplicationOwner() {
  const [application, setApplication] = useState<Application | null>(null);
  useEffect(() => {
    const selected = selectApplicationConfiguration(process.env.EXPO_PUBLIC_APPLICATION_MODE);
    if (selected.kind === "unavailable") {
      setApplication({ kind: "unavailable" });
      return;
    }
    if (selected.kind === "fixture") {
      const fixture = createNativeFixture();
      setApplication({ kind: "fixture", fixture });
      return () => fixture.runtime.dispose();
    }
    const created = createNativeApplication(selected.configuration, {
      wire(configuration) {
        // Bind native modules only after selection, inside construction's catch.
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { nativeJsonWire } = require("./src/platform/native-json.native") as typeof import("./src/platform/native-json.native");
        return nativeJsonWire(configuration);
      },
      vault(environment, origin) {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { nativeCredentialVault } = require("./src/platform/secure-credentials") as typeof import("./src/platform/secure-credentials");
        return nativeCredentialVault(environment, origin);
      }
    });
    setApplication(created);
    // Each setup creates a fresh owner. StrictMode never reuses a disposed one.
    return () => { if (created.kind === "ready") created.runtime.dispose(); };
  }, []);
  if (application?.kind === "fixture") return <Preview fixture={application.fixture} />;
  if (application?.kind === "ready") return <ConnectedJourney runtime={application.runtime} />;
  return <Screen><Text variant="title">God's Churches</Text>
    {application?.kind === "unavailable" ? <Text>Sign-in is unavailable in this build.</Text> : null}
  </Screen>;
}

export default function App() {
  return <SafeAreaProvider><ThemeProvider><ApplicationOwner /></ThemeProvider></SafeAreaProvider>;
}
