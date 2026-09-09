"use client";
import { useEffect, useRef, useState } from "react";
import { PasswordField } from "./account-form";

export function AccountExport() {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [download, setDownload] = useState<string | null>(null);
  const busy = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const feedback = useRef<HTMLParagraphElement>(null);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (!download) return;
    // The file remains only in this page's memory for a short download window.
    const timer = setTimeout(() => {
      setDownload(null);
      setMessage(
        "This download has expired. Confirm your password to prepare another."
      );
    }, 60_000);
    return () => {
      clearTimeout(timer);
      URL.revokeObjectURL(download);
    };
  }, [download]);
  return (
    <section
      className="gc-settings"
      aria-labelledby="account-data-title"
      aria-busy={pending}
    >
      <h2 id="account-data-title">Download your account data</h2>
      <p className="text-gc-muted">
        Get a JSON file containing your profile, posts, comments, likes,
        follows, church directory choices and your own support submissions. It
        contains personal information, so save it somewhere private.
      </p>
      <p className="text-sm text-gc-muted">
        Other people’s content, church administration, staff replies, passwords
        and security records are excluded. Reading preferences saved only on
        this browser are separate. Downloads support up to 2,000 records per
        category and 10 MB; larger exports stop with a message instead of
        leaving data out.
      </p>
      <form
        method="post"
        action="/api/platform/account"
        className="space-y-4"
        aria-describedby="account-export-feedback"
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy.current) return;
          busy.current = true;
          controller.current = new AbortController();
          const form = event.currentTarget;
          const password = String(
            new FormData(form).get("currentPassword") ?? ""
          );
          setPending(true);
          setFailed(false);
          setDownload(null);
          setMessage("");
          const post = (body: Record<string, string>) =>
            fetch("/api/platform/account", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
              cache: "no-store",
              signal: controller.current!.signal
            });
          try {
            const prepared = await post({
              operation: "prepare-export",
              currentPassword: password
            });
            form.reset();
            const result = await prepared.json();
            if (!prepared.ok)
              throw new Error(
                result.message ?? "We could not prepare your download."
              );
            const response = await post({
              operation: "download-export",
              authorization: result.authorization
            });
            if (!response.ok) {
              const error = await response.json();
              throw new Error(
                error.message ?? "We could not create your download."
              );
            }
            setDownload(URL.createObjectURL(await response.blob()));
            setMessage(
              "Your file is ready. Select Save account data within one minute. After that, confirm your password to prepare a new file."
            );
          } catch (error) {
            form.reset();
            setFailed(true);
            setMessage(
              error instanceof Error && !(error instanceof TypeError)
                ? error.message
                : "The download could not be confirmed. Please try again."
            );
          } finally {
            busy.current = false;
            setPending(false);
            requestAnimationFrame(() => feedback.current?.focus());
          }
        }}
      >
        <PasswordField
          id="account-export-password"
          name="currentPassword"
          label="Confirm your current password"
          autocomplete="current-password"
        />
        <button
          type="submit"
          className="gc-button gc-button-quiet"
          disabled={pending}
        >
          {pending ? "Preparing your file…" : "Prepare account download"}
        </button>
      </form>
      <p
        id="account-export-feedback"
        ref={feedback}
        tabIndex={-1}
        role={failed ? "alert" : "status"}
      >
        {message}
      </p>
      {download && (
        <a
          href={download}
          download="godschurches-account.json"
          className="gc-button gc-button-primary"
        >
          Save account data
        </a>
      )}
    </section>
  );
}
