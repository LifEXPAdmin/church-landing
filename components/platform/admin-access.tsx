"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import QRCode from "qrcode";
import type { AdminAccessSnapshot } from "@/lib/platform/admin-access";
import { adminCapabilityLabels } from "@/lib/platform/admin-types";
import { AdminForm, adminInputClass } from "./admin-form";
import { GoogleAccountOptions } from "./google-account";

export function AdminAccess({
  data,
  onRefresh
}: {
  data: AdminAccessSnapshot;
  onRefresh: () => void;
}) {
  const [secret, setSecret] = useState(""),
    [qr, setQr] = useState(""),
    [codes, setCodes] = useState<string[]>([]),
    [capability, setCapability] = useState("VIEW_OPERATIONAL_HEALTH"),
    [grantDirty, setGrantDirty] = useState(false);
  const owner = data.navigation.viewer.id,
    factor = data.authenticator,
    base = {
      managerVersion: data.managerVersion,
      expectedVersion: factor?.version ?? 0
    };
  useEffect(() => {
    let cancelled = false;
    setQr("");
    if (secret) {
      const uri = `otpauth://totp/${encodeURIComponent("God's Churches:" + data.navigation.viewer.username)}?secret=${secret}&issuer=${encodeURIComponent("God's Churches")}&algorithm=SHA1&digits=6&period=30`;
      void QRCode.toDataURL(uri, {
        errorCorrectionLevel: "M",
        margin: 4,
        width: 260
      })
        .then((value) => {
          if (!cancelled) setQr(value);
        })
        .catch(() => {
          // The manual setup key remains available if local QR rendering fails.
          if (!cancelled) setQr("");
        });
    }
    return () => {
      cancelled = true;
    };
  }, [secret, data.navigation.viewer.username]);
  useEffect(() => {
    if (!secret && !codes.length) return;
    const timer = setTimeout(() => {
      setSecret("");
      setCodes([]);
      setQr("");
    }, 600000);
    return () => clearTimeout(timer);
  }, [secret, codes.length]);
  const receive = (result: Record<string, unknown>) => {
    if (typeof result.secret === "string") {
      setSecret(result.secret);
      setCodes([]);
    }
    if (Array.isArray(result.recoveryCodes)) {
      setCodes(
        result.recoveryCodes.filter((v): v is string => typeof v === "string")
      );
      setSecret("");
      setQr("");
    }
  };
  const selected = data.target?.grants.find((g) => g.capability === capability),
    enabled = !selected?.active;
  return (
    <GoogleAccountOptions enabled={data.googleAvailable}>
      <div className="space-y-6">
        <h1 className="text-3xl font-semibold">Admin access</h1>
        <p className="text-gc-muted">
          Assign one explicit duty at a time. Every change requires current
          sign-in confirmation and an unused authenticator code. This does not
          replace church verification or change who can read an existing help
          conversation.
        </p>
        <section className="space-y-4 rounded-xl border border-gc-divider p-5">
          <h2 className="text-xl font-semibold">Your admin authenticator</h2>
          <p>
            {factor?.confirmed
              ? `Confirmed. ${factor.recoveryCodesRemaining} recovery codes remain.`
              : factor
                ? "Setup is awaiting confirmation."
                : "No authenticator is confirmed yet."}
          </p>
          {!factor?.confirmed && (
            <>
              <AdminForm
                owner={owner}
                operation="mfa-start"
                fixed={base}
                confirmationPurpose="manage-admin-authenticator"
                button={
                  factor
                    ? "Restart authenticator setup"
                    : "Start authenticator setup"
                }
                onResult={receive}
                onSaved={onRefresh}
                caution="Confirm your current sign-in first. A new setup key expires in ten minutes. Restarting replaces an unconfirmed key."
              />
              {secret && (
                <div className="space-y-3 rounded-xl border border-gc-action p-4">
                  <p>
                    Add an account in your authenticator app by scanning this
                    private QR code or entering this key.
                  </p>
                  {qr && (
                    <Image
                      src={qr}
                      alt="Private admin authenticator setup QR code"
                      width={260}
                      height={260}
                      unoptimized
                      className="h-auto max-w-full"
                    />
                  )}
                  <code className="block select-all break-all">{secret}</code>
                  <p className="text-sm text-gc-muted">
                    Do not share or screenshot this key. It is shown only in
                    this browser and clears after ten minutes.
                  </p>
                </div>
              )}
              {factor && (
                <AdminForm
                  owner={owner}
                  operation="mfa-confirm"
                  fixed={base}
                  fields={[
                    {
                      name: "code",
                      label: "Six-digit authenticator code",
                      min: 6,
                      max: 6
                    }
                  ]}
                  button="Confirm authenticator"
                  onResult={receive}
                  onSaved={onRefresh}
                />
              )}
            </>
          )}
          {codes.length > 0 && (
            <div className="space-y-3 rounded-xl border border-gc-action p-4">
              <h3 className="font-semibold">Save your recovery codes now</h3>
              <p>
                Store them separately from this device, somewhere private. Each
                replaces a lost authenticator once. They clear from this page
                after ten minutes.
              </p>
              <ul className="grid gap-2 sm:grid-cols-2">
                {codes.map((code) => (
                  <li key={code}>
                    <code className="select-all break-all">{code}</code>
                  </li>
                ))}
              </ul>
              <button
                className="gc-button gc-button-quiet"
                onClick={() => setCodes([])}
              >
                I saved my recovery codes; hide them
              </button>
            </div>
          )}
          {factor?.confirmed && (
            <details>
              <summary className="min-h-11 cursor-pointer font-semibold">
                Replace a lost authenticator
              </summary>
              <AdminForm
                owner={owner}
                operation="mfa-recover"
                fixed={base}
                confirmationPurpose="manage-admin-authenticator"
                fields={[
                  {
                    name: "recoveryCode",
                    label: "One unused recovery code",
                    min: 20,
                    max: 23
                  }
                ]}
                button="Replace using this recovery code"
                onResult={receive}
                onSaved={onRefresh}
                caution="This retires the old authenticator and all its recovery codes, signs out other sessions, and requires confirming the replacement before another grant change."
              />
              <p className="mt-4 text-sm text-gc-muted">
                If the authenticator and recovery codes are both lost, use the
                trusted operator identity-review process. Email confirmation
                alone cannot bypass this check.
              </p>
            </details>
          )}
        </section>
        <section className="space-y-4">
          <h2 className="text-xl font-semibold">
            Choose an account for an explicit duty
          </h2>
          <form action="/platform/admin/access" className="space-y-3">
            <label className="block font-semibold">
              Complete username
              <input
                className={adminInputClass}
                name="username"
                defaultValue={data.query}
                maxLength={40}
                required
              />
            </label>
            <button className="gc-button">Find current grants</button>
          </form>
          {data.query && !data.target && (
            <p>No account matches that complete username.</p>
          )}
          {data.target && (
            <div className="space-y-4 rounded-xl border border-gc-divider p-5">
              <h3 className="text-xl font-semibold">
                {data.target.name} (@{data.target.username})
              </h3>
              <p>
                {data.target.eligible
                  ? "Active verified adult."
                  : "This account is not currently eligible for new grants."}
              </p>
              <ul className="space-y-2">
                {data.target.grants.map((g) => (
                  <li key={g.id}>
                    {adminCapabilityLabels[
                      g.capability as keyof typeof adminCapabilityLabels
                    ] ?? g.capability}
                    : {g.active ? "Active" : "Revoked"} · Version {g.version}
                  </li>
                ))}
              </ul>
              {data.target.id === owner ? (
                <p>
                  Your own grants use the trusted operator assignment process.
                </p>
              ) : (
                <>
                  <label className="block font-semibold">
                    Explicit capability
                    <select
                      className={adminInputClass}
                      value={capability}
                      disabled={grantDirty}
                      onChange={(e) => setCapability(e.target.value)}
                    >
                      {Object.entries(adminCapabilityLabels).map(
                        ([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        )
                      )}
                    </select>
                  </label>
                  {factor?.confirmed && (!enabled || data.target.eligible) ? (
                    <AdminForm
                      owner={owner}
                      operation="grant"
                      fixed={{
                        managerVersion: data.managerVersion,
                        expectedVersion: selected?.version ?? 0,
                        username: data.target.username,
                        capability,
                        enabled
                      }}
                      confirmationPurpose="manage-admin-access"
                      fields={[
                        {
                          name: "reason",
                          label: enabled
                            ? "Reason for this specific duty"
                            : "Reason for revoking this duty",
                          type: "textarea",
                          min: 5,
                          max: 500
                        },
                        {
                          name: "code",
                          label: "Next unused six-digit authenticator code",
                          min: 6,
                          max: 6
                        }
                      ]}
                      button={
                        enabled
                          ? "Grant this capability"
                          : "Revoke this capability"
                      }
                      onDraftChange={setGrantDirty}
                      onSaved={onRefresh}
                      caution="A code is accepted once. Wait for a new code after confirming setup or completing another access change. Existing roles do not imply permission for another duty."
                    />
                  ) : (
                    <p>
                      Confirm your authenticator and check the recipient’s
                      eligibility before granting access.
                    </p>
                  )}
                </>
              )}
            </div>
          )}
        </section>
      </div>
    </GoogleAccountOptions>
  );
}
