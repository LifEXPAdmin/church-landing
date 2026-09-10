import { accountConfig } from "./account-config";

// Pages receive only availability, never sender credentials or configuration.
export function accountDeliveryAvailable() {
  try {
    return accountConfig().delivery !== "disabled";
  } catch {
    return false;
  }
}
