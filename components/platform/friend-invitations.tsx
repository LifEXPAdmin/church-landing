"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { socialRequest, SocialClientError } from "@/lib/platform/social-client";
import { ShareQr } from "./public-share-controls";
import { PortalActionForm } from "./portal-action-form";
import { ADULT_POLICY } from "@/lib/platform/portal-types";
import { useUnsavedSocialWork } from "./use-unsaved-social-work";
type State = {
  accountId: string;
  name: string;
  eligible: boolean;
  emailVerified: boolean;
  adultAcknowledged: boolean;
  portalVersion: number;
  version: number;
  url: string | null;
  expiresAt: string | null;
  signup: { id: string; state: string; name: string; username: string } | null;
};
export function FriendInvitations({
  accountId,
  invitation
}: {
  accountId: string;
  invitation?: {
    code: string;
    name: string;
    username: string;
    inviterId: string;
  };
}) {
  const [data, setData] = useState<State | null>(null),
    [message, setMessage] = useState(""),
    [pending, setPending] = useState<string | null>(null),
    [knownFailure, setKnownFailure] = useState(false),
    [busy, setBusy] = useState(false),
    [consent, setConsent] = useState(false),
    [connected, setConnected] = useState(false);
  const flight = useRef(false),
    generation = useRef(0);
  useUnsavedSocialWork(
    { dirty: false, saving: !!pending, conflict: false },
    () => setMessage("Resolve the pending invitation request before leaving.")
  );
  const inviterId = invitation?.inviterId;
  const load = useCallback(async () => {
    const seq = ++generation.current;
    setData(null);
    setConnected(false);
    try {
      const r = await socialRequest<State>(
        "/api/platform/friend-invitations",
        undefined,
        accountId
      );
      let friends = false;
      if (inviterId) {
        const status = await socialRequest<{ friends: boolean }>(
          `/api/platform/relationships?view=status&kind=person&targetId=${encodeURIComponent(inviterId)}`,
          undefined,
          accountId
        );
        friends = status.data.friends;
      }
      if (seq === generation.current) {
        setData(r.data);
        setConnected(friends);
      }
    } catch (e) {
      if (seq === generation.current) {
        setData(null);
        setMessage(
          e instanceof Error ? e.message : "Reconnect to check your invitation."
        );
      }
    }
  }, [accountId, inviterId]);
  useEffect(() => {
    void load();
    const hide = () => {
      generation.current++;
      setData(null);
      setConnected(false);
    };
    const refresh = () => {
      if (document.visibilityState !== "hidden") void load();
    };
    const visibility = () =>
      document.visibilityState === "hidden" ? hide() : refresh();
    window.addEventListener("blur", hide);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    window.addEventListener("social-relationships-changed", refresh);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      hide();
      window.removeEventListener("blur", hide);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      window.removeEventListener("social-relationships-changed", refresh);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [load]);
  const eligibilityBusy = useRef(false);
  const eligibilityChanged = useCallback(
    (busy: boolean) => {
      const prior = eligibilityBusy.current;
      eligibilityBusy.current = busy;
      if (prior && !busy) void load();
    },
    [load]
  );
  async function send(body: string) {
    if (flight.current) return;
    flight.current = true;
    setBusy(true);
    setMessage("Saving your choice…");
    setKnownFailure(false);
    const seq = generation.current;
    try {
      await socialRequest("/api/platform/friend-invitations", body, accountId);
      setPending(null);
      if (seq !== generation.current) return;
      setConsent(false);
      await load();
      setMessage("Choice saved. Current invitation status is shown below.");
      window.dispatchEvent(new Event("social-relationships-changed"));
    } catch (e) {
      setKnownFailure(e instanceof SocialClientError && e.status < 500);
      setMessage(
        e instanceof Error
          ? e.message
          : "The result is unconfirmed. Retry the unchanged request."
      );
    } finally {
      flight.current = false;
      setBusy(false);
    }
  }
  function act(operation: string) {
    if (!data || pending) return;
    const body = JSON.stringify({
      operation,
      mutationId: crypto.randomUUID(),
      accountId,
      expectedVersion: data.version,
      consent: true,
      ...(invitation ? { code: invitation.code } : {})
    });
    setPending(body);
    void send(body);
  }
  async function share(action: "copy" | "share") {
    if (flight.current) return;
    flight.current = true;
    setBusy(true);
    const seq = generation.current;
    try {
      const r = await socialRequest<State>(
        "/api/platform/friend-invitations",
        undefined,
        accountId
      );
      if (seq !== generation.current) return;
      setData(r.data);
      if (!r.data.url) throw Error("This invitation is no longer available.");
      if (action === "copy") {
        await navigator.clipboard.writeText(r.data.url);
        setMessage("Invitation link copied.");
      } else if (navigator.share) {
        await navigator.share({
          title: `Connect with ${r.data.name} on Godschurches`,
          url: r.data.url
        });
        setMessage("Share dialog completed.");
      } else
        setMessage(
          "Native sharing is unavailable. Copy the invitation link below."
        );
    } catch (e) {
      setMessage(
        e instanceof DOMException && e.name === "AbortError"
          ? "Sharing canceled."
          : "Sharing could not be confirmed. Select and copy the invitation link below."
      );
    } finally {
      flight.current = false;
      setBusy(false);
    }
  }
  async function validateDownload(url: string) {
    const seq = generation.current;
    try {
      const r = await socialRequest<State>(
        "/api/platform/friend-invitations",
        undefined,
        accountId
      );
      if (seq !== generation.current) return false;
      if (r.data.url !== url) {
        setData(r.data);
        setMessage("Your invitation changed. Use the current code shown here.");
        return false;
      }
      return true;
    } catch {
      if (seq === generation.current) {
        setData(null);
        setMessage(
          "Your invitation could not be checked. Reconnect before downloading."
        );
      }
      return false;
    }
  }
  return (
    <div className="space-y-5">
      <p role="status">{message}</p>
      {pending && (
        <div className="flex flex-wrap gap-2">
          <button
            className="gc-button"
            disabled={busy}
            onClick={() => void send(pending)}
          >
            Retry unchanged request
          </button>
          {knownFailure && (
            <button
              className="gc-button gc-button-quiet"
              disabled={busy}
              onClick={() => {
                setPending(null);
                void load();
              }}
            >
              Check current status
            </button>
          )}
        </div>
      )}
      {!data ? (
        <button className="gc-button" onClick={() => void load()}>
          Check invitation status
        </button>
      ) : (
        <>
          <p>Signed in as {data.name}.</p>
          {invitation && connected && (
            <section
              aria-label="Current friendship"
              className="space-y-3 rounded border p-4"
            >
              <h2 className="text-2xl">
                You’re already friends with {invitation.name}
              </h2>
              <p>
                Scanning again keeps your existing friendship. There is no new
                connection to accept.
              </p>
              <div className="flex flex-wrap gap-2">
                <Link
                  className="gc-button"
                  href={`/platform/profile/${invitation.username}`}
                >
                  Open profile
                </Link>
                <Link
                  className="gc-button gc-button-quiet"
                  href="/platform/invitations"
                >
                  Share your own QR
                </Link>
              </div>
            </section>
          )}
          {data.signup && (
            <section
              aria-label="Signup connection"
              className="space-y-3 rounded border p-4"
            >
              <h2 className="text-2xl">
                {data.signup.state === "CONNECTED"
                  ? `You’re connected with ${data.signup.name}`
                  : `Your signup invitation from ${data.signup.name}`}
              </h2>
              {data.signup.state === "CONNECTED" ? (
                <Link
                  href={`/platform/profile/${data.signup.username}`}
                  className="gc-button"
                >
                  Open profile
                </Link>
              ) : data.signup.state === "PENDING" ? (
                <>
                  <p>
                    Your account is created. Finish verification and adult
                    eligibility to connect. If you already finished, retry
                    safely.
                  </p>
                  <button
                    className="gc-button"
                    disabled={busy || !!pending}
                    onClick={() => act("retry-signup")}
                  >
                    Retry signup connection
                  </button>
                </>
              ) : (
                <p>
                  This invitation is no longer available. Your account remains
                  usable; no connection has been restored.
                </p>
              )}
            </section>
          )}
          {!data.eligible && (
            <section className="space-y-3">
              <h2 className="text-2xl">
                {connected ? "Your account verification" : "Before connecting"}
              </h2>
              <p>
                {connected
                  ? "Your friendship is already in place. Email verification and adult confirmation are account requirements, not a request to become friends again."
                  : "Verify your email and confirm you are at least 18. Invitations do not bypass account eligibility."}
              </p>
              {!data.emailVerified && (
                <Link
                  className="gc-button"
                  href={`/platform/account/verify?next=${encodeURIComponent(invitation ? `/platform/invite/${invitation.code}` : "/platform/invitations")}`}
                >
                  Verify your account email
                </Link>
              )}
              {!data.adultAcknowledged && (
                <PortalActionForm
                  onBusyChange={eligibilityChanged}
                  disabled={busy || !!pending}
                  operation="ack-adult"
                  payload={{
                    expectedVersion: data.portalVersion,
                    policy: ADULT_POLICY,
                    acknowledged: true
                  }}
                  label="Confirm adult eligibility"
                  confirmation="I confirm that I am at least 18 years old."
                />
              )}
              <button
                className="gc-button gc-button-quiet"
                onClick={() => void load()}
              >
                Refresh eligibility and connection
              </button>
            </section>
          )}
          {invitation ? (
            !connected && (
              <section className="space-y-3">
                <p>
                  Connect with {invitation.name}? Both of you will become
                  friends. Either person can remove the friendship or block. No
                  church or private-content access is added.
                </p>
                <button
                  className="gc-button"
                  disabled={!data.eligible || busy || !!pending}
                  onClick={() => act("accept")}
                >
                  Connect with {invitation.name}
                </button>
              </section>
            )
          ) : (
            <>
              {data.url ? (
                <section className="space-y-3">
                  <p>People who join with this code can connect with you.</p>
                  <ShareQr
                    key={data.url}
                    url={data.url}
                    inline
                    personal
                    onDownload={validateDownload}
                  />
                  <p>
                    Expires {new Date(data.expiresAt!).toLocaleDateString()}.
                  </p>
                  <label className="block">
                    Your invitation link
                    <input
                      aria-label="Your invitation link"
                      className="block w-full rounded border p-2"
                      value={data.url}
                      readOnly
                      onFocus={(e) => e.currentTarget.select()}
                    />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      className="gc-button"
                      disabled={busy || !!pending}
                      onClick={() => void share("copy")}
                    >
                      Copy invitation link
                    </button>
                    <button
                      className="gc-button gc-button-quiet"
                      disabled={busy || !!pending}
                      onClick={() => void share("share")}
                    >
                      Share invitation
                    </button>
                    <button
                      className="gc-button gc-button-quiet"
                      disabled={busy || !!pending}
                      onClick={() => act("revoke")}
                    >
                      Revoke invitation
                    </button>
                  </div>
                </section>
              ) : (
                <p>Your personal invitation is not enabled or has expired.</p>
              )}
              {data.eligible && (
                <section className="space-y-3">
                  <label className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={consent}
                      onChange={(e) => setConsent(e.target.checked)}
                      disabled={busy || !!pending}
                    />
                    <span>
                      I agree to become friends automatically with eligible
                      people who knowingly accept this invitation. The code
                      lasts 30 days. I can revoke it, remove friends or block.
                    </span>
                  </label>
                  <button
                    className="gc-button"
                    disabled={!consent || busy || !!pending}
                    onClick={() => act(data.url ? "rotate" : "enable")}
                  >
                    {data.url
                      ? "Replace invitation code"
                      : "Enable my invitation"}
                  </button>
                  {data.url && (
                    <p>
                      Replacing the code invalidates the old code and unfinished
                      signups. Existing friends stay connected.
                    </p>
                  )}
                </section>
              )}
            </>
          )}
        </>
      )}
      <Link href="/platform/share?qr=1" className="gc-button gc-button-quiet">
        Share the general website instead
      </Link>
    </div>
  );
}
