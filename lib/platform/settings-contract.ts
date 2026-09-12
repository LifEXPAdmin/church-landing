import type { SettingScope } from "./resource-contracts";

export type SettingValue =
  | string
  | number
  | boolean
  | null
  | {
      readonly [key: string]: SettingValue;
    }
  | readonly SettingValue[];

export type SettingSource = "browser" | "account" | "church" | "default";
export type SettingValueState<T extends SettingValue = SettingValue> =
  | {
      status: "ready";
      requested: T;
      effective: T;
      source: SettingSource;
      editable: true;
      version: number | null;
    }
  | {
      status: "locked";
      requested: T;
      effective: T;
      source: SettingSource;
      editable: false;
      reason: string;
      version: number | null;
    }
  | {
      status: "forbidden" | "unavailable" | "error";
      editable: false;
      reason: string;
    };

/** An adapter must establish access before constructing a value-bearing result. */
export function unavailableSetting(
  status: "forbidden" | "unavailable" | "error",
  reason: string
): SettingValueState<never> {
  return { status, editable: false, reason };
}

/** Exact scope equality; there is no implicit church or family override. */
export function sameSettingScope(a: SettingScope, b: SettingScope) {
  if (a.kind !== b.kind) return false;
  if (a.kind === "browser") return true;
  if (a.kind === "personal")
    return b.kind === "personal" && a.userId === b.userId;
  return b.kind === "church" && a.churchId === b.churchId;
}

// Only this independently persisted presentation family may use the initial
// restore action. Never dispatch a cross-service "reset everything" command.
export const displayResetFields = Object.freeze([
  "appearance",
  "mode",
  "size",
  "reduceMotion",
  "reduceData"
] as const);
export const inactiveSettingScopes = Object.freeze([
  "family",
  "business"
] as const);
