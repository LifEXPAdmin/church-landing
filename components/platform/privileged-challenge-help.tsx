"use client";
import { useEffect, useState } from "react";
import { privilegedChallengeHref } from "@/lib/platform/privileged-auth-navigation";
export function PrivilegedChallengeHelp() {
  const [href, setHref] = useState<string | null>(null);
  useEffect(() => {
    const show = (event: Event) => setHref(privilegedChallengeHref((event as CustomEvent<unknown>).detail));
    window.addEventListener("gc-authenticator-needed", show);
    return () => window.removeEventListener("gc-authenticator-needed", show);
  }, []);
  return href ? <aside role="alert" className="container-shell space-y-3 rounded-xl border border-gc-action p-4">
    <p>This protected action needs your authenticator. Keep your unsent form open.</p>
    <a className="gc-button" href={href} target="_blank" rel="noopener noreferrer">Confirm in another tab</a>
    <p>After confirmation, return here and retry the original action.</p>
    <button className="gc-button gc-button-quiet" onClick={() => setHref(null)}>Dismiss this help</button>
  </aside> : null;
}
