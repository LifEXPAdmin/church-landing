import { useState } from "react";
import { Platform } from "react-native";
import { nativePrivacyView } from "../platform/native-privacy.native";
import type { NativePrivacyPresentation as Presentation } from "../platform/native-privacy.ts";

/** Props reach UIKit in the same Fabric mount as the screen. Native attachment
 * and lifecycle checks, not a JS effect or onLayout callback, release the cover. */
export function NativePrivacyPresentation({ presentation, generation, ready }:
  { presentation: Presentation | null; generation: number; ready: boolean }) {
  const [PrivacyView] = useState(() => Platform.OS === "ios" ? nativePrivacyView() : null);
  if (!PrivacyView) return null;
  return <PrivacyView epoch={presentation?.epoch ?? 0} sessionGeneration={generation}
    presentationId={presentation?.presentationId ?? ""} ready={ready && presentation !== null}
    collapsable={false} accessible={false} accessibilityElementsHidden pointerEvents="none"
    style={{ position: "absolute", width: 0, height: 0 }} />;
}
