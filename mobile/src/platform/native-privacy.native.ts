import { requireNativeView, requireOptionalNativeModule } from "expo";
import type { ViewProps } from "react-native";
import type { NativePrivacySource } from "./native-privacy.ts";

type Bridge = {
  readState(): Promise<unknown>;
  addListener(event: "onStateChange", listener: () => void): { remove(): void };
};
export type PrivacyViewProps = ViewProps & {
  epoch: number;
  sessionGeneration: number;
  presentationId: string;
  ready: boolean;
};

/** Deferred binding. An older binary without the cover cannot admit iOS UI. */
export function createNativePrivacySource(): NativePrivacySource | null {
  try {
    const bridge = requireOptionalNativeModule<Bridge>("GCNativePrivacy");
    if (!bridge) return null;
    return {
      readState: () => bridge.readState(),
      onStateChange(listener) {
        const subscription = bridge.addListener("onStateChange", listener);
        return () => subscription.remove();
      }
    };
  } catch { return null; }
}

export function nativePrivacyView() {
  try {
    if (!requireOptionalNativeModule<Bridge>("GCNativePrivacy")) return null;
    return requireNativeView<PrivacyViewProps>("GCNativePrivacy");
  } catch { return null; }
}
