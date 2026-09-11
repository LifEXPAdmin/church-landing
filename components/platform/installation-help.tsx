"use client";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { Download } from "lucide-react";

type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};
type InstallState = {
  available: boolean;
  installed: boolean;
  pending: boolean;
  message: string;
  install: () => Promise<void>;
};
const InstallContext = createContext<InstallState | null>(null);
export function InstallationProvider({
  children
}: {
  children: React.ReactNode;
}) {
  const prompt = useRef<InstallPrompt | null>(null);
  const busy = useRef(false);
  const [available, setAvailable] = useState(false),
    [installed, setInstalled] = useState(false),
    [pending, setPending] = useState(false),
    [message, setMessage] = useState("");
  useEffect(() => {
    const display = window.matchMedia("(display-mode: standalone)");
    const detect = () =>
      setInstalled(
        display.matches ||
          (navigator as Navigator & { standalone?: boolean }).standalone ===
            true
      );
    const offer = (event: Event) => {
      if (typeof (event as InstallPrompt).prompt !== "function") return;
      event.preventDefault();
      prompt.current = event as InstallPrompt;
      setAvailable(true);
      setMessage("");
    };
    const done = () => {
      prompt.current = null;
      setAvailable(false);
      setInstalled(true);
      setMessage("Your browser reports Godschurches is installed.");
    };
    detect();
    display.addEventListener("change", detect);
    window.addEventListener("beforeinstallprompt", offer);
    window.addEventListener("appinstalled", done);
    return () => {
      display.removeEventListener("change", detect);
      window.removeEventListener("beforeinstallprompt", offer);
      window.removeEventListener("appinstalled", done);
    };
  }, []);
  async function install() {
    const event = prompt.current;
    if (!event || busy.current || installed) return;
    busy.current = true;
    prompt.current = null;
    setAvailable(false);
    setPending(true);
    try {
      await event.prompt();
      const choice = await event.userChoice;
      setMessage(
        choice.outcome === "accepted"
          ? "Installation requested. Follow your browser’s instructions and look for Godschurches in your apps."
          : "Installation dismissed. You can keep using this browser."
      );
    } catch {
      setMessage(
        "The browser could not open installation. Try its menu instructions below."
      );
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  return (
    <InstallContext.Provider
      value={{ available, installed, pending, message, install }}
    >
      {children}
    </InstallContext.Provider>
  );
}
export function InstallationHelp() {
  const state = useContext(InstallContext);
  const dialog = useRef<HTMLDialogElement>(null),
    trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const element = dialog.current!;
    const opener = trigger.current;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    element.showModal();
    return () => {
      element.close();
      document.body.style.overflow = overflow;
      opener?.focus({ preventScroll: true });
    };
  }, [open]);
  if (!state) return null;
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="gc-menu-link w-full text-left"
        onClick={() => setOpen(true)}
      >
        <Download aria-hidden="true" />
        <span>
          <span className="gc-menu-link-title">Install Godschurches</span>
          <span className="gc-menu-link-description">
            Add an app shortcut, or keep using your browser.
          </span>
        </span>
      </button>
      <dialog
        ref={dialog}
        className="gc-profile-leave-dialog max-h-[85dvh] overflow-y-auto"
        aria-labelledby="installation-title"
        onCancel={() => setOpen(false)}
      >
        <div className="space-y-4 p-2">
          <div className="flex items-start justify-between gap-3">
            <h2 id="installation-title" className="text-2xl">
              Install Godschurches
            </h2>
            <button
              type="button"
              className="gc-button gc-button-quiet"
              onClick={() => setOpen(false)}
            >
              Close
            </button>
          </div>
          <p role="status">
            {state.installed
              ? "Godschurches is open as an installed app, or your browser has reported installation."
              : state.message ||
                (state.available
                  ? "Your browser offers installation. Open its prompt when you are ready."
                  : "This browser has not offered an install prompt. It may use a menu option, already have the app, or not support installation.")}
          </p>
          {state.available && !state.installed && (
            <button
              type="button"
              className="gc-button"
              disabled={state.pending}
              onClick={() => void state.install()}
            >
              Install app
            </button>
          )}
          {state.pending && (
            <p role="status">Follow the browser’s installation prompt.</p>
          )}
          {!state.installed && (
            <div className="space-y-3">
              <details>
                <summary className="cursor-pointer font-semibold">
                  Android · Chrome
                </summary>
                <p className="mt-2">
                  Open Godschurches in Chrome. Open More beside the address bar,
                  choose Install and create shortcut, then Install. Follow the
                  browser’s steps; wording can vary by version.
                </p>
                <a
                  className="underline"
                  href="https://support.google.com/chrome/answer/9658361?co=GENIE.Platform%3DAndroid&hl=en"
                  target="_blank"
                  rel="noreferrer"
                >
                  Google’s Android instructions
                </a>
              </details>
              <details>
                <summary className="cursor-pointer font-semibold">
                  iPhone · Safari
                </summary>
                <p className="mt-2">
                  Open Godschurches in Safari. Tap More, then Share (or the
                  Share button). Choose Add to Home Screen, turn on Open as Web
                  App when shown, then Add. If the option is missing, check Edit
                  Actions.
                </p>
                <a
                  className="underline"
                  href="https://support.apple.com/guide/iphone/open-as-web-app-iphea86e5236/ios"
                  target="_blank"
                  rel="noreferrer"
                >
                  Apple’s iPhone instructions
                </a>
              </details>
              <details>
                <summary className="cursor-pointer font-semibold">
                  Computer · Chrome
                </summary>
                <p className="mt-2">
                  Open Chrome’s More menu, then Cast, save, and share → Install
                  page as app. Some versions also show an Install icon in the
                  address bar.
                </p>
                <a
                  className="underline"
                  href="https://support.google.com/chrome/answer/9658361?co=GENIE.Platform%3DDesktop&hl=en"
                  target="_blank"
                  rel="noreferrer"
                >
                  Google’s computer instructions
                </a>
              </details>
              <p>
                On another browser, check its app or home-screen menu. If
                installation is unavailable, bookmark Godschurches and use it
                here.
              </p>
            </div>
          )}
          <p className="text-sm text-gc-muted">
            A connection is needed for current content. Installation does not
            sign you in or enable notifications. Keep unsent work in its open
            tab.
          </p>
        </div>
      </dialog>
    </>
  );
}
