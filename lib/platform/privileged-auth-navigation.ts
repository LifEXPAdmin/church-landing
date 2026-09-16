export const privilegedPurposeNames = ["privileged-work", "change-access", "export-metrics", "redact-support", "send-announcement"] as const;
export function privilegedChallengeHref(value: unknown) {
  return typeof value === "string" && privilegedPurposeNames.some(p => p === value)
    ? "/platform/account/authenticator?purpose=" + value : null;
}
// This event only offers a link. The server still requires a current session,
// actual assigned authority and a verified one-use authenticator code.
export function announcePrivilegedChallenge(value: unknown) {
  if (typeof window === "undefined" || !value || typeof value !== "object") return false;
  const purpose = (value as Record<string, unknown>).authenticatorPurpose;
  if (privilegedChallengeHref(purpose)) {
    window.dispatchEvent(new CustomEvent("gc-authenticator-needed", { detail: purpose }));
    return true;
  }
  return false;
}
