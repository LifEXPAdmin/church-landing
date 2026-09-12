"use client";
import { useEffect, useRef, useState } from "react";
import { AccountConfirmation, useAccountConfirmation } from "./google-account";

export function AccountExport() {
  const confirmation = useAccountConfirmation("prepare-export");
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
        "This download has expired. Confirm your account to prepare another."
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
        Get a JSON file containing your profile and appearance, personal image
        metadata and photo albums, posts, comments, likes and follows. It also
        includes your private drafts, saved collection organization, social
        choices, friend invitation records, personal polls and your votes,
        volunteer signups, personal calendars and event responses, church
        directory choices, your private church setup and listing submissions,
        and your own support submissions. Save this personal information
        somewhere private.
      </p>
      <p className="text-sm text-gc-muted">
        Saved collections include your organization, not copies of source posts.
        Other people’s content, church administration, staff replies, passwords
        and security records are excluded. Reading preferences saved only on
        this browser are separate. Downloads support up to 2,000 records per
        category and 4 MiB, with up to 50 photo albums and 100 entries per
        album; larger exports stop with a message instead of leaving data out.
        Image files are referenced through links that require current access;
        the image bytes are not included in this JSON file.
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
          const credentials = confirmation.credentials(new FormData(form));
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
              ...credentials
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
              "Your file is ready. Select Save account data within one minute. After that, confirm your account to prepare a new file."
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
            confirmation.finish();
            busy.current = false;
            setPending(false);
            requestAnimationFrame(() => feedback.current?.focus());
          }
        }}
      >
        <AccountConfirmation
          value={confirmation}
          id="account-export-password"
          label="Confirm your current password"
        />
        <button
          type="submit"
          className="gc-button gc-button-quiet"
          disabled={pending || !confirmation.ready}
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
