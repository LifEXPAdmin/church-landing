import { accountConfig } from "./account-config";

export function accountDeletionAvailable() {
  return (
    process.env.ACCOUNT_DELETION_ENABLED === "true" &&
    !!(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID)
  );
}

// Pages receive only availability, never sender credentials or configuration.
export function accountDeliveryAvailable() {
  try {
    return accountConfig().delivery !== "disabled";
  } catch {
    return false;
  }
}
