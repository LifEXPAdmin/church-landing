// Middleware owns this value. Never accept a caller's nonce or CSP as authority.
export const CSP_NONCE_HEADER = "x-gc-csp-nonce";
export const CSP_REPORT_ENDPOINT = "/api/security/csp-report";

export function scriptPolicy(nonce: string, development: boolean) {
  if (!/^[A-Za-z0-9+/]{32}$/.test(nonce))
    throw new Error("Invalid script nonce");
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ""}`,
    "script-src-attr 'none'",
    // Existing style attributes include image sizes, concealment and charts.
    // This is a strict script policy, not a claim of nonce-only styles.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    `connect-src 'self'${development ? " ws: wss:" : ""}`,
    "worker-src 'self'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    `report-uri ${CSP_REPORT_ENDPOINT}`,
    "report-to csp"
  ].join("; ");
}

export function requestScriptPolicy(headers: Headers, development: boolean) {
  const nonce = btoa(
    String.fromCharCode(...crypto.getRandomValues(new Uint8Array(24)))
  );
  const policy = scriptPolicy(nonce, development);
  const forwarded = new Headers(headers);
  forwarded.set(CSP_NONCE_HEADER, nonce);
  // Next uses the request policy for its framework, Flight and streaming scripts.
  forwarded.set("Content-Security-Policy", policy);
  forwarded.delete("Content-Security-Policy-Report-Only");
  return { nonce, policy, forwarded };
}
