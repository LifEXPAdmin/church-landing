"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { socialRequest } from "@/lib/platform/social-client";
type Preview = {
  available: boolean;
  url: string;
  title: string;
  description: string;
};
export function PublicShareControls({
  kind,
  id,
  siteUrl,
  showSiteQr = false
}: {
  kind: "post" | "church" | "event" | "site";
  id: string;
  siteUrl?: string;
  showSiteQr?: boolean;
}) {
  const [open, setOpen] = useState(showSiteQr && kind === "site"),
    [preview, setPreview] = useState<Preview | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [native, setNative] = useState(false),
    [qr, setQr] = useState<string | null>(null);
  const generation = useRef(0),
    inFlight = useRef(false),
    returnFocus = useRef<HTMLElement | null>(null);
  const path = `/api/platform/share-preview?${new URLSearchParams({ kind, id })}`;
  useEffect(() => setNative(typeof navigator.share === "function"), []);
  const read = useCallback(async () => {
    if (kind === "site" && siteUrl)
      return {
        available: true,
        url: siteUrl,
        title: "Godschurches",
        description: "Faith and community."
      };
    const r = await socialRequest<Preview>(path);
    return r.data;
  }, [path, kind, siteUrl]);
  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setPreview(null);
    const seq = ++generation.current;
    try {
      const p = await read();
      if (seq === generation.current) {
        setPreview(p);
        setMessage(
          p.available
            ? ""
            : "A public share link is not available for this page."
        );
      }
    } catch (e) {
      if (seq === generation.current)
        setMessage(
          e instanceof Error
            ? e.message
            : "The public link could not be checked."
        );
    } finally {
      if (seq === generation.current) {
        inFlight.current = false;
        setBusy(false);
      }
    }
  }, [read]);
  useEffect(() => {
    if (!open) return;
    void load();
    const conceal = () => {
      generation.current++;
      inFlight.current = false;
      setBusy(false);
      setPreview(null);
      setQr(null);
    };
    const restore = () => {
      if (document.visibilityState !== "hidden") void load();
    };
    const visibility = () =>
      document.visibilityState === "hidden" ? conceal() : restore();
    window.addEventListener("blur", conceal);
    window.addEventListener("focus", restore);
    window.addEventListener("social-relationships-changed", restore);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      conceal();
      window.removeEventListener("blur", conceal);
      window.removeEventListener("focus", restore);
      window.removeEventListener("social-relationships-changed", restore);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [open, load]);
  async function act(action: "copy" | "share" | "qr") {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setMessage("Checking the public link…");
    returnFocus.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const seq = ++generation.current;
    try {
      const p = await read();
      if (seq !== generation.current) return;
      setPreview(p);
      if (!p.available) {
        setQr(null);
        setMessage("A public share link is not available for this page.");
        return;
      }
      if (action === "copy") {
        if (!navigator.clipboard?.writeText)
          throw new Error(
            "Clipboard unavailable. Select and copy the public link below."
          );
        try {
          await navigator.clipboard.writeText(p.url);
        } catch {
          throw new Error(
            "The link was not copied. Select and copy the public link below."
          );
        }
        if (seq === generation.current) setMessage("Public link copied.");
      }
      if (action === "share") {
        if (!navigator.share) {
          setMessage("Native sharing is unavailable. Use Copy public link.");
          return;
        }
        try {
          await navigator.share({ title: p.title, url: p.url });
          if (seq === generation.current) setMessage("Share dialog completed.");
        } catch (e) {
          if (seq === generation.current)
            setMessage(
              e instanceof DOMException && e.name === "AbortError"
                ? "Sharing canceled."
                : "The share dialog could not open. Use Copy public link."
            );
        }
      }
      if (action === "qr") {
        setQr(p.url);
        setMessage("");
      }
    } catch (e) {
      if (seq === generation.current)
        setMessage(
          e instanceof Error
            ? e.message
            : "The public link could not be checked. Try again."
        );
    } finally {
      if (seq === generation.current) {
        inFlight.current = false;
        setBusy(false);
      }
    }
  }
  return (
    <>
      {showSiteQr && kind === "site" && siteUrl && (
        <ShareQr url={siteUrl} inline />
      )}
      <details
        open={open}
        onToggle={(e) => setOpen(e.currentTarget.open)}
        className="rounded border border-gc-divider p-2"
      >
        <summary className="min-h-11 cursor-pointer py-2 font-semibold">
          {kind === "site" ? "Share Godschurches" : "Share publicly"}
        </summary>
        {open && (
          <div
            role="group"
            aria-label="Public sharing choices"
            className="space-y-3"
          >
            <p role="status">{busy ? "Checking the public link…" : message}</p>
            {preview?.available && (
              <>
                <p>
                  A link grants no membership, management rights or permission
                  to RSVP.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="gc-button gc-button-quiet"
                    disabled={busy}
                    onClick={() => void act("copy")}
                  >
                    Copy public link
                  </button>
                  {native ? (
                    <button
                      type="button"
                      className="gc-button gc-button-quiet"
                      disabled={busy}
                      onClick={() => void act("share")}
                    >
                      Open share dialog
                    </button>
                  ) : (
                    <p>Native sharing is unavailable. Use Copy public link.</p>
                  )}
                  <button
                    type="button"
                    className="gc-button gc-button-quiet"
                    disabled={busy}
                    onClick={() => void act("qr")}
                  >
                    Show QR code
                  </button>
                </div>
                <label className="block">
                  Public link
                  <input
                    aria-label="Public link"
                    className="block w-full rounded border p-2"
                    readOnly
                    value={preview.url}
                    onFocus={(e) => e.currentTarget.select()}
                  />
                </label>
              </>
            )}
            <button
              type="button"
              className="gc-button gc-button-quiet"
              disabled={busy}
              onClick={() => void load()}
            >
              Refresh public link
            </button>
            {qr && (
              <ShareQr
                url={qr}
                onClose={() => {
                  setQr(null);
                  returnFocus.current?.focus();
                }}
              />
            )}
          </div>
        )}
      </details>
    </>
  );
}
function ShareQr({
  url,
  onClose,
  inline = false
}: {
  url: string;
  onClose?: () => void;
  inline?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    canvas = useRef<HTMLCanvasElement>(null),
    [error, setError] = useState(""),
    [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    const node = dialog.current;
    node?.showModal();
    void import("qrcode")
      .then(async (module) => {
        if (active && canvas.current)
          await module.toCanvas(canvas.current, url, {
            errorCorrectionLevel: "M",
            margin: 4,
            width: 512,
            color: { dark: "#000000", light: "#ffffff" }
          });
      })
      .then(() => {
        if (active) setReady(true);
      })
      .catch(() => {
        if (active)
          setError(
            "The QR code could not be drawn. Copy the public link instead."
          );
      });
    return () => {
      active = false;
      if (node?.open) node.close();
    };
  }, [url]);
  const content = (
    <>
      <h2 className="text-2xl">Open the public page</h2>
      <p>Scan with your phone camera. Sign in normally to join or respond.</p>
      {error ? (
        <p role="alert">{error}</p>
      ) : (
        <canvas
          ref={canvas}
          role="img"
          aria-label="QR code for the public link"
          className="mx-auto my-3 h-auto max-w-full"
        />
      )}
      <p className="break-all text-sm">{url}</p>
      {!inline && (
        <button
          type="button"
          className="gc-button gc-button-quiet"
          onClick={() => dialog.current?.close()}
        >
          Close QR code
        </button>
      )}
      <button
        type="button"
        className="gc-button gc-button-quiet"
        disabled={!ready || !!error}
        onClick={() => {
          if (!canvas.current) return;
          const link = document.createElement("a");
          link.href = canvas.current.toDataURL("image/png");
          link.download = "godschurches-qr.png";
          link.click();
        }}
      >
        Download QR PNG
      </button>
    </>
  );
  return inline ? (
    <section
      aria-label="Public link QR code"
      className="rounded-xl border border-gc-divider p-4"
    >
      {content}
    </section>
  ) : (
    <dialog
      ref={dialog}
      aria-label="Public link QR code"
      onClose={onClose}
      className="max-h-[90dvh] w-[min(90vw,36rem)] overflow-auto rounded-xl border border-gc-divider bg-gc-surface p-4 text-gc-text backdrop:bg-black/50"
    >
      {content}
    </dialog>
  );
}
