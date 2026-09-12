"use client";
import Link from "next/link";
import { useState } from "react";
import type { SettingsContext } from "@/lib/platform/settings-context";
import type { SettingsControl } from "@/lib/platform/settings-registry";
import { ReadingSettings } from "./reading-preferences";
import { RelationshipPrivacy } from "./relationship-privacy";
import { AccountSessions } from "./account-sessions";
import { AccountEmailChange } from "./account-email-change";
import { AccountExport } from "./account-export";
import { AccountLifecycle } from "./account-lifecycle";
import { AccountForm } from "./account-form";
import { GoogleSignInMethods } from "./google-sign-in-methods";
import { ChurchTools } from "./church-tools";
import { logoutPlatformAccount } from "@/app/platform/actions";

export function SettingsControls({
  control,
  data
}: {
  control: SettingsControl;
  data: SettingsContext;
}) {
  switch (control) {
    case "reading":
      return <ReadingSettings allowReset />;
    case "privacy":
      return <RelationshipPrivacy owner={data.ownerId} />;
    case "sessions":
      return <AccountSessions />;
    case "email":
      return <AccountEmailChange available={data.emailAvailable} />;
    case "export":
      return <AccountExport />;
    case "deactivate":
      return (
        <>
          <p className="my-4">
            <Link className="underline" href="/platform/settings/data/export">
              Download your data first
            </Link>{" "}
            if you want a copy. Deactivation does not delete your account.
          </p>
          <AccountLifecycle />
        </>
      );
    case "password":
      return <AccountForm operation="change-password" />;
    case "methods":
      return data.googleAvailable ? (
        <>
          <GoogleSignInMethods />
          <AccountForm operation="change-password" />
        </>
      ) : (
        <div className="gc-settings">
          <p>
            Google sign-in is not available. Your current password sign-in is
            unchanged.
          </p>
          <Link
            className="underline"
            href="/platform/settings/security/password"
          >
            Manage password
          </Link>
        </div>
      );
    case "verification":
      return (
        <div className="gc-settings">
          <p>
            {data.emailVerified
              ? "Your account email has been verified."
              : "Your account email has not been verified."}
          </p>
          {!data.emailVerified && (
            <Link className="gc-button" href="/platform/account/verify">
              Email verification options
            </Link>
          )}
        </div>
      );
    case "summary":
      return (
        <div className="gc-settings">
          <dl className="space-y-3">
            <div>
              <dt>Name</dt>
              <dd>{data.name}</dd>
            </div>
            <div>
              <dt>Username</dt>
              <dd>@{data.username}</dd>
            </div>
            <div>
              <dt>Private sign-in email</dt>
              <dd>{data.emailLabel}</dd>
            </div>
          </dl>
          <Link className="underline" href="/platform/profile/me">
            Edit member profile
          </Link>
          <form action={logoutPlatformAccount}>
            <button className="gc-button gc-button-quiet" type="submit">
              Log out on this device
            </button>
          </form>
        </div>
      );
    case "notifications":
      return (
        <div className="gc-settings">
          <p>
            In-app notification categories, email alerts, push and quiet hours
            are not available yet.
          </p>
          <p>
            You can follow or mute a conversation from its post. Those choices
            do not enable email or push delivery. Waitlist emails use the
            unsubscribe link in each email.
          </p>
          <Link className="underline" href="/platform">
            Open posts and conversation controls
          </Link>
        </div>
      );
    case "organization":
      return <OrganizationSettings data={data} />;
  }
}
function OrganizationSettings({ data }: { data: SettingsContext }) {
  const [selected, setSelected] = useState("");
  const church = data.churches.find((c) => c.id === selected);
  return (
    <div className="gc-settings">
      {data.churchError && <p role="status">{data.churchError}</p>}
      <p>
        Choose a church to review your current tools. Your personal preferences
        stay separate.
      </p>
      {data.churches.length ? (
        <>
          <label htmlFor="settings-church">Church</label>
          <select
            id="settings-church"
            value={church?.id ?? ""}
            onChange={(e) => setSelected(e.target.value)}
          >
            <option value="">Choose a church</option>
            {data.churches.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {church && (
            <section key={church.id} aria-label={"Settings for " + church.name}>
              <h2>{church.name}</h2>
              <p>Available tools depend on your current church role.</p>
              <ChurchTools churchId={church.id} />
            </section>
          )}
        </>
      ) : (
        <p>
          {data.churchError
            ? "Review My church for the next access step."
            : "You have no approved church connection to select. A follow or contributed listing does not appoint you to manage a church."}
        </p>
      )}
      <Link className="underline" href="/platform/my-church">
        Review My church and access
      </Link>
    </div>
  );
}
