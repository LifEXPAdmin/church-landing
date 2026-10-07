import { requireNativeModule } from "expo";
import { randomUUID } from "expo-crypto";
import { createBridgedNativeWire, type NativeJsonBridge } from "./native-wire.ts";
import type { NativeApiConfiguration } from "./request-adapter.ts";

/** Lazy: importing preparation code must not activate networking in fixture UI. */
export function nativeJsonWire(configuration: NativeApiConfiguration) {
  return createBridgedNativeWire(configuration, requireNativeModule<NativeJsonBridge>("GCNativeJson"), randomUUID);
}
