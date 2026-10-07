import { useState } from "react";
import { Platform } from "react-native";
import { runDiagnosticProbe, type DiagnosticReport } from "../platform/diagnostics";
import { Button, Card, Text } from "./primitives";

/** Loaded only by the development preview. One report, no persistence or sender. */
export function DiagnosticControls() {
  const [report, setReport] = useState<DiagnosticReport | null>(null);
  return <Card>
    <Text variant="heading">Local diagnostic check</Text>
    <Text variant="body">Create one report with app build and platform details. Nothing is sent or saved to a file.</Text>
    <Button label="Run diagnostic check" onPress={() => setReport(runDiagnosticProbe({
      platform: Platform.OS,
      platformVersion: Platform.Version,
      appVersion: process.env.EXPO_PUBLIC_APP_VERSION,
      variant: process.env.EXPO_PUBLIC_APP_VARIANT,
      sourceBase: process.env.EXPO_PUBLIC_SOURCE_BASE,
      sourceState: process.env.EXPO_PUBLIC_SOURCE_STATE
    }))} />
    {report ? <>
      <Text variant="small" selectable accessibilityLiveRegion="polite">{JSON.stringify(report, null, 2)}</Text>
      <Button label="Clear diagnostic" secondary onPress={() => setReport(null)} />
    </> : null}
  </Card>;
}
