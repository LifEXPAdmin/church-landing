"use client";
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState
} from "react";
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
  apple: boolean;
  bannerDismissed: boolean;
  dismissBanner: () => void;
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
    [apple, setApple] = useState(false),
    [bannerDismissed, setBannerDismissed] = useState(true),
    [message, setMessage] = useState("");
  useEffect(() => {
    // Device hints choose instructions only; they never establish install capability.
    setApple(
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
    );
    try {
      setBannerDismissed(
        localStorage.getItem("gc-install-help-dismissed-v1") === "yes"
      );
    } catch {
      setBannerDismissed(false);
    }
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
  function dismissBanner() {
    setBannerDismissed(true);
    try {
      localStorage.setItem("gc-install-help-dismissed-v1", "yes");
    } catch {
      /* The current visit still remembers dismissal. */
    }
  }
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
      value={{
        available,
        installed,
        pending,
        message,
        install,
        apple,
        bannerDismissed,
        dismissBanner
      }}
    >
      {children}
    </InstallContext.Provider>
  );
}
export function InstallationBanner() {
  const state = useContext(InstallContext);
  if (
    !state ||
    state.installed ||
    state.bannerDismissed ||
    (!state.apple && !state.available)
  )
    return null;
  return (
    <aside
      aria-label="Home Screen installation"
      className="space-y-3 rounded-xl border border-gc-divider bg-gc-surface p-4"
    >
      <h2 className="text-xl">Add Godschurches to your Home Screen</h2>
      <p>
        {state.apple
          ? "On iPhone or iPad, use Safari’s Share menu. We’ll show you the steps."
          : "Your browser offers an app shortcut. Install when you are ready."}
      </p>
      <div className="flex flex-wrap gap-2">
        <InstallationHelp compact />
        <button
          type="button"
          className="gc-button gc-button-quiet"
          onClick={state.dismissBanner}
        >
          Dismiss installation banner
        </button>
      </div>
      <p className="text-sm text-gc-muted">
        Installation help stays in Menu after dismissal.
      </p>
    </aside>
  );
}
export function InstallationHelp({ compact = false }: { compact?: boolean }) {
  const state = useContext(InstallContext);
  const titleId = useId();
  const dialog = useRef<HTMLDialogElement>(null),
    trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [copyMessage, setCopyMessage] = useState("");
  const [copyUrl, setCopyUrl] = useState("");
  useEffect(() => {
    if (!open) return;
    const element = dialog.current!;
    const opener = trigger.current;
    const overflow = document.body.style.overflow;
    setCopyUrl(
      window.location.origin + window.location.pathname + window.location.search
    );
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
        className={compact ? "gc-button" : "gc-menu-link w-full text-left"}
        onClick={() => setOpen(true)}
      >
        <Download aria-hidden="true" />
        {compact ? (
          <span>Show installation steps</span>
        ) : (
          <span>
            <span className="gc-menu-link-title">Install Godschurches</span>
            <span className="gc-menu-link-description">
              Add an app shortcut, or keep using your browser.
            </span>
          </span>
        )}
      </button>
      <dialog
        ref={dialog}
        className="gc-profile-leave-dialog max-h-[85dvh] overflow-y-auto"
        aria-labelledby={titleId}
        onCancel={() => setOpen(false)}
      >
        <div className="space-y-4 p-2">
          <div className="flex items-start justify-between gap-3">
            <h2 id={titleId} className="text-2xl">
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
              <details open={state.apple}>
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
              <details open={state.apple}>
                <summary className="cursor-pointer font-semibold">
                  Opened inside another app?
                </summary>
                <p className="mt-2">
                  If you opened this page inside a mail, social or QR app, use
                  its menu to open in Safari on iPhone, or your usual browser on
                  Android. If that option is missing, copy this link and paste
                  it into the browser. Then follow the installation steps above.
                </p>
                <button
                  type="button"
                  className="gc-button gc-button-quiet"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(copyUrl);
                      setCopyMessage(
                        "Link copied. Paste it into Safari or your usual browser."
                      );
                    } catch {
                      setCopyMessage("Select and copy the link below.");
                    }
                  }}
                >
                  Copy this page link
                </button>
                <label className="mt-2 block">
                  Page link
                  <input
                    readOnly
                    value={copyUrl}
                    className="block w-full rounded border p-2"
                    onFocus={(e) => e.currentTarget.select()}
                  />
                </label>
                <p role="status">{copyMessage}</p>
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
