import { googleConfig } from "./google-provider";

// Page components receive only this boolean, never provider configuration.
export function googleAvailable() {
  try {
    return googleConfig() !== null;
  } catch {
    return false;
  }
}
