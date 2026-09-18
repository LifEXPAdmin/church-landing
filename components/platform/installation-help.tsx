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
import Link from "next/link";
import { INSTALL_POLICY } from "@/lib/platform/install-policy";

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
      setMessage("Your browser reports God’s Churches is installed.");
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
          ? "Installation requested. Follow your browser’s instructions and look for God’s Churches in your apps."
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
      <h2 className="text-xl">Add God’s Churches to your Home Screen</h2>
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
export function PostSignupHelp({ emailPending }: { emailPending: boolean }) {
  const state = useContext(InstallContext);
  if (!state || state.installed || state.bannerDismissed) return null;
  return (
    <aside
      aria-label="Keep God’s Churches handy"
      className="container-shell mx-auto mt-5 max-w-2xl"
    >
      <div className="space-y-3 rounded-xl border border-gc-divider bg-gc-surface p-4">
        <h2 className="text-2xl">Keep God’s Churches handy</h2>
        <p>
          Your account is created.
          {emailPending
            ? " Email verification is still pending; finish verification and adult setup before participating."
            : " Continue with any remaining account setup."}{" "}
          Any invitation you accepted stays with your account.
        </p>
        <Link
          className="inline-flex min-h-11 items-center underline"
          href="/platform/invitations#account-and-invitation-status"
        >
          Check account and invitation status
        </Link>
        <p>
          Install the app on your home screen, or bookmark this page to come
          back anytime.
        </p>
        <div className="flex flex-wrap gap-2">
          <InstallationHelp compact label="Install the app" />
          <InstallationHelp
            compact
            bookmark
            label="How to bookmark this page"
          />
          <button
            type="button"
            className="gc-button gc-button-quiet"
            onClick={() => {
              state.dismissBanner();
              requestAnimationFrame(() =>
                document.getElementById("platform-content")?.focus()
              );
            }}
          >
            Continue in browser
          </button>
        </div>
        <p className="text-sm text-gc-muted">
          Both are optional. You can find these steps later in Menu.
        </p>
      </div>
    </aside>
  );
}

function BookmarkInstructions({ apple }: { apple: boolean }) {
  return (
    <div className="space-y-3">
      <p>
        First open the app page above. Bookmark that clean address using your
        browser’s controls. This website cannot save a bookmark for you.
      </p>
      <details open={apple}>
        <summary className="cursor-pointer font-semibold">
          iPhone · Safari bookmarks
        </summary>
        <p className="mt-2">
          Tap More, then Add Bookmark to, choose a location and Save. With a
          Bottom or Top tab layout, touch and hold Show Bookmarks, then choose
          Add Bookmark.
        </p>
        <a
          className="underline"
          href="https://support.apple.com/guide/iphone/iph42ab2f3a7/ios"
          target="_blank"
          rel="noreferrer"
        >
          Apple’s bookmark instructions
        </a>
      </details>
      <details>
        <summary className="cursor-pointer font-semibold">
          Android or iPhone · Chrome bookmarks
        </summary>
        <p className="mt-2">
          Open More beside the address bar, then choose Add to bookmarks (the
          star). You can find it later in More → Bookmarks.
        </p>
        <a
          className="underline"
          href="https://support.google.com/chrome/answer/188842?hl=en"
          target="_blank"
          rel="noreferrer"
        >
          Google’s bookmark instructions
        </a>
      </details>
      <details>
        <summary className="cursor-pointer font-semibold">
          Computer · Chrome or Edge bookmarks
        </summary>
        <p className="mt-2">
          Use the star in the address bar. Chrome calls it Bookmark; Edge calls
          it Add this page to favorites. Choose a folder and save when asked.
        </p>
        <a
          className="underline"
          href="https://support.microsoft.com/en-us/microsoft-edge/add-a-site-to-my-favorites-in-microsoft-edge-eb40d818-fd1f-cb19-d943-6fcfd1d9a935"
          target="_blank"
          rel="noreferrer"
        >
          Microsoft’s favorites instructions
        </a>
      </details>
      <details>
        <summary className="cursor-pointer font-semibold">
          Android · Firefox bookmarks
        </summary>
        <p className="mt-2">
          Open the three-dot menu, then tap Add next to Bookmarks.
        </p>
        <a
          className="underline"
          href="https://support.mozilla.org/en-US/kb/add-delete-and-view-bookmarked-webpages-firefox-android"
          target="_blank"
          rel="noreferrer"
        >
          Mozilla’s bookmark instructions
        </a>
      </details>
      <p>
        In another browser, use its Bookmarks or Favorites menu. Inside a mail,
        social or QR app, open or copy the app link into your regular browser
        first.
      </p>
    </div>
  );
}

export function InstallationHelp({
  compact = false,
  bookmark = false,
  label
}: {
  compact?: boolean;
  bookmark?: boolean;
  label?: string;
}) {
  const state = useContext(InstallContext);
  const titleId = useId();
  const dialog = useRef<HTMLDialogElement>(null),
    trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [copyMessage, setCopyMessage] = useState("");
  const copyUrl = new URL(
    INSTALL_POLICY.start_url,
    process.env.NEXT_PUBLIC_SITE_URL || "https://godschurches.com"
  ).href;
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
        className={compact ? "gc-button" : "gc-menu-link w-full text-left"}
        onClick={() => setOpen(true)}
      >
        <Download aria-hidden="true" />
        {compact ? (
          <span>{label ?? "Show installation steps"}</span>
        ) : (
          <span>
            <span className="gc-menu-link-title">
              {bookmark ? "Bookmark God’s Churches" : "Install God’s Churches"}
            </span>
            <span className="gc-menu-link-description">
              {bookmark
                ? "Save the app page in your browser’s bookmarks."
                : "Add an app shortcut, or keep using your browser."}
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
            <h2 id={titleId} className="min-w-0 flex-1 text-2xl">
              {bookmark ? "Bookmark God’s Churches" : "Install God’s Churches"}
            </h2>
            <button
              type="button"
              className="gc-button gc-button-quiet shrink-0 whitespace-nowrap"
              onClick={() => setOpen(false)}
            >
              Close
            </button>
          </div>
          <div className="space-y-2">
            <a
              className="gc-button"
              href={copyUrl}
              target="_blank"
              rel="noreferrer"
            >
              Open app page in a new tab
            </a>
            <p className="text-sm text-gc-muted">
              Use this app address for installation or bookmarking. Keep this
              tab open to finish verification or check your invitation. If
              another browser asks, sign in to the same account; you do not need
              to create it again.
            </p>
            <button
              type="button"
              className="gc-button gc-button-quiet"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(copyUrl);
                  setCopyMessage(
                    "App link copied. Paste it into Safari or your usual browser."
                  );
                } catch {
                  setCopyMessage("Select and copy the app link below.");
                }
              }}
            >
              Copy app link
            </button>
            <label className="block">
              App link
              <input
                readOnly
                value={copyUrl}
                className="block w-full rounded border p-2"
                onFocus={(event) => event.currentTarget.select()}
              />
            </label>
            <p role="status">{copyMessage}</p>
          </div>
          {bookmark ? (
            <BookmarkInstructions apple={state.apple} />
          ) : (
            <>
              <p role="status">
                {state.installed
                  ? "God’s Churches is open as an installed app, or your browser has reported installation."
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
                      Open God’s Churches in Chrome. Open More beside the address
                      bar, choose Install and create shortcut, then Install.
                      Follow the browser’s steps; wording can vary by version.
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
                      Open God’s Churches in Safari. Tap More, then Share (or the
                      Share button). Choose Add to Home Screen, turn on Open as
                      Web App when shown, then Add. If the option is missing,
                      check Edit Actions.
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
                      If you opened this page inside a mail, social or QR app,
                      use its menu to open in Safari on iPhone, or your usual
                      browser on Android. If that option is missing, copy this
                      link and paste it into the browser. Then follow the
                      installation steps above.
                    </p>
                  </details>
                  <details>
                    <summary className="cursor-pointer font-semibold">
                      Computer · Chrome
                    </summary>
                    <p className="mt-2">
                      Open Chrome’s More menu, then Cast, save, and share →
                      Install page as app. Some versions also show an Install
                      icon in the address bar.
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
                    installation is unavailable, bookmark God’s Churches and use
                    it here.
                  </p>
                </div>
              )}
              <p className="text-sm text-gc-muted">
                A connection is needed for current content. Installation does
                not sign you in or enable notifications. Keep unsent work in its
                open tab.
              </p>
            </>
          )}
        </div>
      </dialog>
    </>
  );
}
