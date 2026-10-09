import { validateNativeConfiguration } from "../../application-configuration.js";
import type { NativeApiConfiguration, NativeWire } from "../platform/request-adapter.ts";
import type { SessionPorts } from "./session-controller.ts";
import { createNativeRuntime } from "./runtime.ts";

export type NativeApplicationPorts = {
  mutationId?(): string;
  wire(configuration: NativeApiConfiguration): NativeWire;
  vault(environment: NativeApiConfiguration["environment"], origin: string): SessionPorts["vault"];
};
export type NativeApplication =
  | Readonly<{ kind: "ready"; runtime: ReturnType<typeof createNativeRuntime> }>
  | Readonly<{ kind: "unavailable" }>;
const unavailable = Object.freeze({ kind: "unavailable" } as const);

/** Call from the owning App effect. Ready means constructed, never authenticated;
 * the canonical session remains concealed until foreground verification. */
export function createNativeApplication(configuration: NativeApiConfiguration,
  ports: NativeApplicationPorts): NativeApplication {
  try {
    const fixed = validateNativeConfiguration(configuration);
    if (!fixed) return unavailable;
    const wire = ports.wire(fixed);
    const vault = ports.vault(fixed.environment, fixed.origin);
    return Object.freeze({ kind: "ready", runtime: createNativeRuntime({
      configuration: fixed, wire, vault, mutationId: ports.mutationId,
      availability: { screens: ["home"], resources: ["post"] }
    }) });
  } catch {
    // Construction errors may contain native paths or configuration details.
    return unavailable;
  }
}
