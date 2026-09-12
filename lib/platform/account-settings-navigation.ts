import type { RecentAuthenticationPurpose } from "./account-credential";

// The service-selected purpose determines the return path. Client input cannot
// supply a new destination or change the action authorized by a one-use proof.
const confirmationReturns: Record<RecentAuthenticationPurpose, string> = {
  "change-password": "/platform/settings/security/password",
  "revoke-other-sessions": "/platform/settings/account/sessions",
  "prepare-export": "/platform/settings/data/export",
  "deactivate-account": "/platform/settings/data/deactivate",
  "request-email-change": "/platform/settings/account/email",
  "confirm-email-change": "/platform/settings/account/email",
  "unlink-google": "/platform/settings/account/methods"
};
export function accountConfirmationReturn(
  purpose: RecentAuthenticationPurpose
) {
  return confirmationReturns[purpose];
}
