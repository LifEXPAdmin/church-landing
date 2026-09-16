"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import QRCode from "qrcode";
import type { PrivilegedAuthenticationSnapshot } from "@/lib/platform/privileged-auth";
import { GoogleAccountOptions } from "./google-account";
import { AdminForm } from "./admin-form";
import { socialRequest, SocialClientError } from "@/lib/platform/social-client";

const purposes = [
  { value: "privileged-work", label: "Use my assigned duties" },
  { value: "change-access", label: "Change church or topic access" },
  { value: "export-metrics", label: "Download platform metrics" },
  { value: "redact-support", label: "Remove private information from Support" },
  { value: "send-announcement", label: "Send a reviewed founder announcement" }
];
export function PrivilegedAuthenticator({ data, purpose }: { data: PrivilegedAuthenticationSnapshot; purpose?: string }) {
  const [current, setCurrent] = useState(data), [visible, setVisible] = useState(false),
    [notice, setNotice] = useState("Checking your current sign-in…"), [retired, setRetired] = useState(false);
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    const request = ++generation.current;
    setVisible(false);
    try {
      const { data: next } = await socialRequest<PrivilegedAuthenticationSnapshot>("/api/platform/authenticator", undefined, data.ownerId);
      if (request !== generation.current) return;
      if (next.ownerId !== data.ownerId || next.viewKey !== data.viewKey)
        throw new SocialClientError(401, "Your sign-in changed. Reload your authenticator settings.");
      setCurrent(next); setVisible(true); setNotice("");
    } catch (error) {
      if (request !== generation.current) return;
      if (error instanceof SocialClientError && error.status === 401) setRetired(true);
      setNotice(error instanceof Error ? error.message : "Your sign-in could not be checked. Private entries are concealed.");
    }
  }, [data.ownerId, data.viewKey]);
  useEffect(() => {
    const invalidate = () => { generation.current++; };
    const hide = () => { invalidate(); setVisible(false); };
    const resume = () => { if (document.visibilityState !== "hidden") void refresh(); };
    const visibility = () => document.visibilityState === "hidden" ? hide() : resume();
    resume();
    window.addEventListener("blur", hide); window.addEventListener("offline", hide);
    window.addEventListener("focus", resume); window.addEventListener("online", resume);
    window.addEventListener("pageshow", resume); window.addEventListener("admin-access-changed", resume);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      invalidate();
      window.removeEventListener("blur", hide); window.removeEventListener("offline", hide);
      window.removeEventListener("focus", resume); window.removeEventListener("online", resume);
      window.removeEventListener("pageshow", resume); window.removeEventListener("admin-access-changed", resume);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [refresh]);
  return <div className="space-y-4">
    {!visible && <div className="space-y-3"><p role="status">{notice || "Checking your current sign-in. Private entries are concealed."}</p>
      {retired ? <a className="gc-button" href="/platform/account/authenticator">Reload authenticator settings</a>
        : <button className="gc-button gc-button-quiet" onClick={() => void refresh()}>Recheck current sign-in</button>}
    </div>}
    {!retired && <div hidden={!visible}><AuthenticatorContent data={current} purpose={purpose} refresh={refresh} /></div>}
  </div>;
}
function AuthenticatorContent({ data, purpose, refresh }: { data: PrivilegedAuthenticationSnapshot; purpose?: string; refresh: () => Promise<void> }) {
  const [secret, setSecret] = useState(""), [codes, setCodes] = useState<string[]>([]), [qr, setQr] = useState("");
  const displayedVersion = useRef<number | null>(null);
  const factor = data.factor;
  useEffect(() => {
    if (displayedVersion.current !== null && displayedVersion.current !== factor?.version) {
      setSecret(""); setCodes([]); setQr(""); displayedVersion.current = null;
    }
  }, [factor?.version]);
  useEffect(() => {
    let active = true;
    setQr("");
    if (secret) {
      const uri = `otpauth://totp/${encodeURIComponent("God's Churches:" + data.username)}?secret=${secret}&issuer=${encodeURIComponent("God's Churches")}&algorithm=SHA1&digits=6&period=30`;
      void QRCode.toDataURL(uri, { errorCorrectionLevel: "M", margin: 4, width: 260 })
        .then(value => { if (active) setQr(value); }).catch(() => { if (active) setQr(""); });
    }
    return () => { active = false; };
  }, [secret, data.username]);
  useEffect(() => {
    if (!secret && !codes.length) return;
    const timer = setTimeout(() => { setSecret(""); setCodes([]); setQr(""); }, 600000);
    return () => clearTimeout(timer);
  }, [secret, codes.length]);
  const receive = (result: Record<string, unknown>) => {
    displayedVersion.current = Number(result.version);
    if (typeof result.secret === "string") { setSecret(result.secret); setCodes([]); }
    if (Array.isArray(result.recoveryCodes)) {
      setCodes(result.recoveryCodes.filter((v): v is string => typeof v === "string"));
      setSecret(""); setQr("");
    }
  };
  const common = { owner: data.ownerId, endpoint: "/api/platform/authenticator" as const,
    fixed: { expectedVersion: factor?.version ?? 0 }, onSaved: () => void refresh(), onResult: receive };
  const code = { name: "code", label: "Six-digit authenticator code", min: 6, max: 6 };
  return <GoogleAccountOptions enabled={data.googleAvailable}>
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold">Your authenticator</h1>
      <p>This protects assigned church, topic, Support and platform duties. Setting it up creates no new permissions. Your personal account remains available when a protected action needs confirmation.</p>
      {!data.available ? <p role="status">Authenticator setup is not available yet.</p>
        : !data.eligible ? <p>Verify your account email and adult eligibility before setting up an authenticator. <Link className="underline" href="/platform/account/verify">Review email verification</Link>.</p>
        : factor?.quarantined ? <p role="status">This authenticator was retired during protected recovery. Contact your trusted operator through an established contact method for identity review. Email recovery alone cannot restore assigned duties.</p>
        : <>
          {data.mode === "enroll" && <p className="rounded-xl border border-gc-divider p-4">Enrollment is being prepared. Broader enforcement is not active yet.</p>}
          <p>{factor?.confirmed ? `Authenticator confirmed. ${factor.recoveryCodesRemaining} recovery codes remain.` : "No authenticator is confirmed yet."}</p>
          {!factor?.confirmed && <>
            <AdminForm {...common} operation="mfa-start" confirmationPurpose="manage-privileged-authenticator"
              button={factor ? "Restart authenticator setup" : "Start authenticator setup"}
              caution="Confirm your current sign-in first. A new setup key expires in ten minutes. Restarting replaces an unconfirmed key." />
            {secret && <section className="space-y-3 rounded-xl border border-gc-action p-4" aria-label="Private authenticator setup">
              <p>Add an account in your authenticator app by scanning this private QR code or entering the key.</p>
              {qr && <Image src={qr} alt="Private authenticator setup QR code" width={260} height={260} unoptimized className="h-auto max-w-full" />}
              <code className="block select-all break-all">{secret}</code>
              <p>Keep this key private. It clears from this page after ten minutes.</p>
            </section>}
            {factor && <AdminForm {...common} operation="mfa-confirm" fields={[code]} button="Confirm authenticator" />}
          </>}
          {!!codes.length && <section className="space-y-3 rounded-xl border border-gc-action p-4" aria-label="Private recovery codes">
            <h2 className="text-xl font-semibold">Save your recovery codes now</h2>
            <p>Store them somewhere private and separate from this device. Each code replaces a lost authenticator once. They clear from this page after ten minutes.</p>
            <ul className="grid gap-2 sm:grid-cols-2">{codes.map(value => <li key={value}><code className="select-all break-all">{value}</code></li>)}</ul>
            <button className="gc-button gc-button-quiet" onClick={() => setCodes([])}>I saved my recovery codes; hide them</button>
          </section>}
          {factor?.confirmed && <>
            <section className="space-y-4" aria-label="Confirm protected work">
              <h2 className="text-xl font-semibold">Confirm protected work</h2>
              <p>{data.confirmedForWork ? "This sign-in currently has a confirmed window for assigned duties." : "Enter an unused code to confirm this sign-in for ten minutes."} Sensitive actions need their own one-use confirmation within five minutes.</p>
              <AdminForm {...common} operation="mfa-challenge" fields={[
                { name: "purpose", label: "Protected action", type: "select", value: purposes.some(p => p.value === purpose) ? purpose : "privileged-work", options: purposes }, code
              ]} button="Confirm protected work" />
              <p>Return to your original tab and retry the retained action after confirmation.</p>
            </section>
            <details><summary className="min-h-11 cursor-pointer font-semibold">Replace my authenticator</summary>
              <AdminForm {...common} operation="mfa-replace" confirmationPurpose="manage-privileged-authenticator" fields={[code]}
                button="Replace using my authenticator" caution="This retires the old factor and recovery codes and signs out other sessions. Confirm the replacement in this sign-in before doing protected work." />
            </details>
            <details><summary className="min-h-11 cursor-pointer font-semibold">Recover a lost authenticator</summary>
              <AdminForm {...common} operation="mfa-recover" confirmationPurpose="manage-privileged-authenticator"
                fields={[{ name: "recoveryCode", label: "One unused recovery code", type: "password", min: 20, max: 23 }]}
                button="Replace using my recovery code" caution="This retires every old recovery code and other sign-ins. Finish the replacement in this sign-in. Leaving before confirmation can require trusted identity review." />
            </details>
          </>}
          <p>If both your authenticator and recovery codes are lost, contact your trusted operator through an established contact method. A support reply or email confirmation cannot bypass this protection.</p>
        </>}
      {!!data.notices.length && <section className="space-y-3" aria-label="Authenticator security notices"><h2 className="text-xl font-semibold">Recent security notices</h2>
        <ul className="space-y-3">{data.notices.map(n => <li key={n.id}>Authenticator {n.action}. <time dateTime={n.createdAt}>{n.createdAt.replace("T", " ").replace("Z", " UTC")}</time>. {n.deliveredAt ? "Email provider accepted the notice." : "Email delivery has not been confirmed."}</li>)}</ul>
      </section>}
      <Link className="gc-button gc-button-quiet" href="/platform/settings/security">Return to Account security</Link>
    </div>
  </GoogleAccountOptions>;
}
