export type RecoveryPurpose = "RESET_PASSWORD" | "VERIFY_EMAIL";

// New links derive their purpose from the route, leaving one fragment parameter.
// Continue accepting purpose-bearing links already delivered to people's inboxes.
export function readAccountLink(hash: string, fallback: RecoveryPurpose) {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const token = params.get("token");
  const purpose = params.get("purpose") ?? fallback;
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  if (purpose !== "RESET_PASSWORD" && purpose !== "VERIFY_EMAIL") return null;
  return { token, purpose };
}
