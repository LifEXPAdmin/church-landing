"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

const permissions = [
  { name: "camera", label: "Camera" },
  { name: "microphone", label: "Microphone" },
  { name: "geolocation", label: "Location" }
] as const;
type PermissionKey = (typeof permissions)[number]["name"];
type Status = PermissionState | "checking" | "unavailable";
const labels: Record<Status, string> = {
  checking: "Checking this browser…",
  granted: "Allowed by this browser",
  denied: "Blocked by this browser",
  prompt: "Ask before use",
  unavailable: "Not reported by this browser"
};
const checkedState = (state: unknown): Status =>
  state === "granted" || state === "denied" || state === "prompt"
    ? state
    : "unavailable";

export function SettingsData() {
  const [statuses, setStatuses] = useState<Record<PermissionKey, Status>>({
    camera: "checking",
    microphone: "checking",
    geolocation: "checking"
  });
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let current = true;
    const cleanup: (() => void)[] = [];
    setStatuses({
      camera: "checking",
      microphone: "checking",
      geolocation: "checking"
    });
    for (const permission of permissions) {
      void (async () => {
        try {
          // Query only: never request hardware or location access to learn status.
          const result = await navigator.permissions.query({
            name: permission.name
          });
          if (!current) return;
          const update = () => {
            if (current)
              setStatuses((previous) => ({
                ...previous,
                [permission.name]: checkedState(result.state)
              }));
          };
          update();
          result.addEventListener("change", update);
          cleanup.push(() => result.removeEventListener("change", update));
        } catch {
          if (current)
            setStatuses((previous) => ({
              ...previous,
              [permission.name]: "unavailable"
            }));
        }
      })();
    }
    const checkAgain = () => setRefresh((value) => value + 1);
    window.addEventListener("focus", checkAgain);
    return () => {
      current = false;
      window.removeEventListener("focus", checkAgain);
      cleanup.forEach((remove) => remove());
    };
  }, [refresh]);
  return (
    <div className="space-y-5">
      <section className="gc-settings space-y-3" aria-label="Your data choices">
        <h2 className="text-2xl">Your data choices</h2>
        <p>
          Download a private copy of your account information, review your
          sharing choices, or take a reversible break. Keeping an account and
          providing requested features requires storing their account and
          content records. Optional data-use switches and general connected-app
          access are unavailable.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            className="gc-button gc-button-quiet"
            href="/platform/settings/privacy"
          >
            Review sharing choices
          </Link>
          <Link
            className="gc-button gc-button-quiet"
            href="/platform/settings/account/methods"
          >
            Sign-in methods
          </Link>
          <Link className="gc-button gc-button-quiet" href="/privacy">
            Privacy policy
          </Link>
        </div>
        <p className="text-sm text-gc-muted">
          A linked Google identity, where available, is a sign-in method. It is
          separate from permission for another app to read your account data.
        </p>
      </section>
      <section
        id="browser-permissions"
        className="gc-settings space-y-4"
        aria-labelledby="browser-permissions-title"
      >
        <h2 id="browser-permissions-title" className="text-2xl">
          Browser permissions
        </h2>
        <p>
          These are this browser’s reported choices for this website. Checking
          them does not open your camera, microphone or location. A browser
          permission does not grant church access or publish your location.
        </p>
        <dl className="space-y-3" aria-live="polite">
          {permissions.map((permission) => (
            <div key={permission.name} data-permission={permission.name}>
              <dt className="font-semibold">{permission.label}</dt>
              <dd>{labels[statuses[permission.name]]}</dd>
            </div>
          ))}
        </dl>
        <button
          className="gc-button gc-button-quiet"
          type="button"
          onClick={() => setRefresh((value) => value + 1)}
        >
          Check permissions again
        </button>
        <p className="text-sm text-gc-muted">
          Photo uploads use the file picker. Godschurches currently has no live
          camera, microphone recording or automatic location feature. An allowed
          status does not mean these are running. Device settings may also limit
          access. If a status is not reported, review it in your browser; it
          does not mean access was allowed or denied.
        </p>
        <details>
          <summary className="cursor-pointer py-3">
            How to change browser permissions
          </summary>
          <ul className="list-disc space-y-3 pl-5">
            <li>
              In Chrome, open the site information beside the address, then Site
              settings.{" "}
              <a
                className="underline"
                href="https://support.google.com/chrome/answer/114662"
              >
                Chrome permission help
              </a>
              .
            </li>
            <li>
              In Safari on iPhone, open the page menu, then More, and review
              Website Settings. For general choices, open iPhone Settings, Apps,
              Safari.{" "}
              <a
                className="underline"
                href="https://support.apple.com/guide/iphone/iphb01fc3c85/ios"
              >
                Safari on iPhone privacy help
              </a>
              .
            </li>
            <li>
              On Mac, open Safari Settings, then Websites.{" "}
              <a
                className="underline"
                href="https://support.apple.com/guide/safari/ibrw7f78f7fe/mac"
              >
                Safari website settings help
              </a>
              .
            </li>
          </ul>
          <p className="mt-3 text-sm text-gc-muted">
            If you use an installed app or a different browser, check its site
            settings and your device’s privacy settings, then return here to
            check again. This page cannot change browser or device permissions.
          </p>
        </details>
      </section>
    </div>
  );
}
