"use client";
import Image from "next/image";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode
} from "react";
import type { RecentAuthenticationPurpose } from "@/lib/platform/account-credential";
import { PasswordField } from "./account-fields";

export async function googleRequest(
  body: Record<string, unknown>,
  signal?: AbortSignal
) {
  let response: Response;
  let result;
  try {
    response = await fetch("/api/platform/google", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: signal ?? AbortSignal.timeout(30_000)
    });
    result = await response.json();
  } catch {
    throw new Error(
      "Could not reach sign-in. Check your connection and try again."
    );
  }
  if (!response.ok) throw new Error(result.message ?? "Please try again.");
  return result;
}
export function followAccountRedirect(destination: unknown) {
  if (typeof destination !== "string") throw new Error("Please try again.");
  const url = new URL(destination, window.location.origin);
  if (
    !(
      (url.origin === window.location.origin &&
        /^\/platform(?:[/?]|$)/.test(url.pathname)) ||
      (url.origin === "https://accounts.google.com" &&
        url.pathname === "/o/oauth2/v2/auth")
    )
  )
    throw new Error("Please return to sign-in and try again.");
  window.location.assign(url.href);
}
export function GoogleButton({
  body,
  label = "Sign in with Google",
  disabled = false,
  submit = false
}: {
  body: Record<string, unknown> | (() => Record<string, unknown> | null);
  label?: string;
  disabled?: boolean;
  submit?: boolean;
}) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const busy = useRef(false);
  useEffect(() => {
    const returned = () => {
      busy.current = false;
      setPending(false);
    };
    window.addEventListener("pageshow", returned);
    return () => window.removeEventListener("pageshow", returned);
  }, []);
  return (
    <div className="space-y-2">
      <button
        type={submit ? "submit" : "button"}
        aria-label={label}
        disabled={disabled || pending}
        className="inline-flex min-h-11 max-w-full items-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gc-focus disabled:opacity-60"
        onClick={async (event) => {
          event.preventDefault();
          if (busy.current) return;
          busy.current = true;
          setPending(true);
          setMessage("");
          try {
            const values = typeof body === "function" ? body() : body;
            if (!values) {
              busy.current = false;
              setPending(false);
              return;
            }
            followAccountRedirect((await googleRequest(values)).redirect);
          } catch (error) {
            setMessage(
              error instanceof Error && !(error instanceof TypeError)
                ? error.message
                : "Could not reach sign-in. Check your connection and try again."
            );
            busy.current = false;
            setPending(false);
          }
        }}
      >
        <Image
          src="/images/google-sign-in-button.png"
          alt="Sign in with Google"
          width={180}
          height={40}
          className="h-auto w-[180px] max-w-full"
          unoptimized
        />
      </button>
      {pending && (
        <p role="status" className="text-sm text-gc-muted">
          Opening Google…
        </p>
      )}
      {message && (
        <p role="alert" className="text-sm text-gc-error">
          {message}
        </p>
      )}
    </div>
  );
}
export type GoogleOptions = {
  signedIn: boolean;
  methods: { password: boolean; google: boolean } | null;
  recentPurpose: RecentAuthenticationPurpose | null;
  emailConfirmationReady: boolean;
  pending: "signup" | "reactivate" | null;
};
type AccountOptionsContext = {
  enabled: boolean;
  options: GoogleOptions | null;
  loading: boolean;
  refresh: () => Promise<void>;
  consume: () => void;
};
const defaultContext: AccountOptionsContext = {
  enabled: false,
  options: null,
  loading: false,
  refresh: async () => {},
  consume: () => {}
};
const AccountOptions = createContext(defaultContext);
export function GoogleAccountOptions({
  enabled,
  children
}: {
  enabled: boolean;
  children: ReactNode;
}) {
  const [options, setOptions] = useState<GoogleOptions | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [message, setMessage] = useState("");
  const controller = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    if (!enabled) return;
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setLoading(true);
    setMessage("");
    try {
      const result = await googleRequest(
        { operation: "status" },
        current.signal
      );
      if (!current.signal.aborted) setOptions(result);
    } catch (error) {
      if (!current.signal.aborted) {
        setOptions(null);
        setMessage(
          error instanceof Error && !(error instanceof TypeError)
            ? error.message
            : "Could not load your sign-in options. Try again."
        );
      }
    } finally {
      if (!current.signal.aborted) setLoading(false);
    }
  }, [enabled]);
  const consume = useCallback(() => {
    setOptions((current) =>
      current ? { ...current, recentPurpose: null } : null
    );
  }, []);
  useEffect(() => {
    void refresh();
    const returned = (event: PageTransitionEvent) => {
      if (event.persisted) void refresh();
    };
    window.addEventListener("pageshow", returned);
    return () => {
      controller.current?.abort();
      window.removeEventListener("pageshow", returned);
    };
  }, [refresh]);
  return (
    <AccountOptions.Provider
      value={{ enabled, options, loading, refresh, consume }}
    >
      {message && (
        <div className="gc-settings">
          <p role="alert">{message}</p>
          <button
            type="button"
            className="gc-button gc-button-quiet"
            disabled={loading}
            onClick={() => void refresh()}
          >
            Retry sign-in options
          </button>
        </div>
      )}
      {children}
    </AccountOptions.Provider>
  );
}
export const useGoogleAccountOptions = () => useContext(AccountOptions);
export function useAccountConfirmation(purpose: RecentAuthenticationPurpose) {
  const context = useGoogleAccountOptions();
  const [choice, setChoice] = useState<"password" | "google" | null>(null);
  const methods = context.options?.methods;
  const method =
    methods?.google &&
    (choice === "google" ||
      (!choice &&
        (!methods.password || context.options?.recentPurpose === purpose)))
      ? "google"
      : "password";
  const loaded = !context.enabled || (!context.loading && !!methods);
  const ready =
    loaded &&
    (method === "password"
      ? !context.enabled || !!methods?.password
      : context.options?.recentPurpose === purpose);
  return {
    ...context,
    purpose,
    method,
    methods,
    setChoice,
    ready,
    loaded,
    credentials: (values: FormData): Record<string, string> =>
      method === "google"
        ? { credentialMethod: "google" }
        : { currentPassword: String(values.get("currentPassword") ?? "") },
    finish: () => {
      if (method === "google") context.consume();
    }
  };
}
const confirmationActions: Record<RecentAuthenticationPurpose, string> = {
  "change-password": "setting your password",
  "revoke-other-sessions": "signing out other sessions",
  "prepare-export": "downloading account data",
  "deactivate-account": "deactivating your account",
  "request-email-change": "requesting an email change",
  "confirm-email-change": "changing your sign-in email",
  "unlink-google": "disconnecting Google"
};
export function AccountConfirmation({
  value,
  id,
  label,
  emailToken
}: {
  value: ReturnType<typeof useAccountConfirmation>;
  id: string;
  label: string;
  emailToken?: string | null;
}) {
  if (!value.loaded)
    return (
      <p role="status">
        {value.loading
          ? "Loading sign-in options…"
          : "Load your sign-in options before continuing."}
      </p>
    );
  return (
    <div className="space-y-3">
      {value.methods?.google && value.methods.password && (
        <div
          className="flex flex-wrap gap-3"
          aria-label="Account confirmation method"
        >
          <button
            type="button"
            className="gc-button gc-button-quiet"
            aria-pressed={value.method === "password"}
            onClick={() => value.setChoice("password")}
          >
            Use password
          </button>
          <button
            type="button"
            className="gc-button gc-button-quiet"
            aria-pressed={value.method === "google"}
            onClick={() => value.setChoice("google")}
          >
            Use Google
          </button>
        </div>
      )}
      {value.method === "password" ? (
        <PasswordField
          id={id}
          name="currentPassword"
          label={label}
          autocomplete="current-password"
        />
      ) : (
        <>
          <p className="text-sm text-gc-muted">
            Confirm this action with your linked Google account, then continue
            below. Google sign-in does not perform the action.
          </p>
          {value.ready ? (
            <p role="status" className="text-gc-accent">
              Google confirmation received for this action. Continue below.
            </p>
          ) : (
            <GoogleButton
              label={
                "Sign in with Google to confirm " +
                confirmationActions[value.purpose]
              }
              body={{
                operation: "reauthenticate",
                purpose: value.purpose,
                ...(emailToken ? { emailToken } : {})
              }}
            />
          )}
        </>
      )}
    </div>
  );
}
