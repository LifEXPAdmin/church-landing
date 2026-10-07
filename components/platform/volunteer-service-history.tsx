"use client";

import { useCallback, useId, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { VolunteerServiceRecord } from "@/lib/platform/volunteer-service-history";
import { prepareSocialRequest } from "@/lib/platform/social-client";
import type { PreparedRequest } from "@/packages/shared-core/src/request-client";
import { usePrivateRecovery } from "./private-snapshot-guard";
import {
  usePrivatePostRecovery,
  usePrivatePostWorkspace
} from "./private-post-workspace";
import { useReadVisibility } from "./read-visibility";
import { useUnsavedSocialWork } from "./use-unsaved-social-work";
import { settlePhotoNavigation } from "./use-photo-back-guard";
import { portalInputClass } from "./portal-action-form";
import { RegionalTime } from "./regional-presentation";

type ServiceReceipt = { id: string; version: number; message: string };
const foreground = () =>
  typeof document !== "undefined" &&
  document.hasFocus() &&
  document.visibilityState !== "hidden" &&
  navigator.onLine;

// Retain the exact account, target, payload and request until its matching
// receipt settles in the same foreground access generation. A background reply
// is not permission to discard local work or reveal it in another account.
function useServiceAction(
  owner: string,
  record: VolunteerServiceRecord,
  reason: string,
  clearReason: () => void
) {
  const router = useRouter(),
    visible = useReadVisibility(),
    scope = usePrivatePostWorkspace(),
    id = useId();
  const original = useRef({ owner, target: record.target }).current;
  const held = useRef<PreparedRequest<ServiceReceipt> | null>(null),
    flight = useRef(false);
  const [pending, setPending] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const latest = useRef({
    scope,
    visible,
    owner,
    target: record.target,
    clearReason
  });
  latest.current = {
    scope,
    visible,
    owner,
    target: record.target,
    clearReason
  };
  const access = useCallback(() => {
    const now = latest.current;
    return now.owner === original.owner &&
      now.target.kind === original.target.kind &&
      now.target.id === original.target.id &&
      now.scope?.owner === original.owner &&
      foreground()
      ? now.scope.accessVersion()
      : null;
  }, [original]);
  const send = useCallback(
    async (body: string) => {
      const generation = access();
      if (flight.current || generation === null) return;
      const input = JSON.parse(body) as {
        targetId: string;
        expectedVersion: number;
      };
      flight.current = true;
      setBusy(true);
      setPending(body);
      setMessage("Saving this service record…");
      try {
        held.current ??= prepareSocialRequest<ServiceReceipt>(
          "/api/platform/volunteers",
          body,
          original.owner,
          "POST",
          {
            idempotent: true,
            decode(value) {
              if (!value || typeof value !== "object" || Array.isArray(value))
                throw Error("Unconfirmed service response");
              const receipt = value as Record<string, unknown>;
              if (
                receipt.id !== original.target.id ||
                receipt.id !== input.targetId ||
                !Number.isSafeInteger(receipt.version) ||
                receipt.version !== input.expectedVersion + 1 ||
                typeof receipt.message !== "string"
              )
                throw Error("Unconfirmed service response");
              return {
                id: receipt.id as string,
                version: receipt.version as number,
                message: receipt.message
              };
            }
          }
        );
        const { data } = await held.current.run();
        if (access() !== generation) {
          setMessage(
            "The original request is retained. Recheck current access and confirm the same save."
          );
          return;
        }
        flushSync(() => {
          held.current = null;
          setPending(null);
          setBusy(false);
          setMessage(data.message);
          latest.current.clearReason();
        });
        await settlePhotoNavigation();
        if (access() === generation) router.refresh();
        else latest.current.scope?.refresh();
      } catch {
        setMessage(
          "This save could not be confirmed. Keep the original request and confirm it before another change. If access or the record changed, review current details before discarding local entries."
        );
      } finally {
        flight.current = false;
        setBusy(false);
      }
    },
    [access, original, router]
  );
  const retry = useCallback(() => {
    if (pending) void send(pending);
  }, [pending, send]);
  usePrivateRecovery("volunteer-service-" + id, !!pending, busy, retry);
  usePrivatePostRecovery(!!pending, busy, retry);
  useUnsavedSocialWork(
    { dirty: !!reason, saving: busy || !!pending, conflict: false },
    () =>
      setMessage(
        "Confirm or discard your local service entries before leaving."
      ),
    true
  );
  return {
    blocked: !visible || access() === null || busy || !!pending,
    command(value: Record<string, unknown>) {
      if (
        !latest.current.visible ||
        access() === null ||
        flight.current ||
        pending
      )
        return;
      return send(
        JSON.stringify({ ...value, mutationId: crypto.randomUUID() })
      );
    },
    status: (
      <div className="space-y-2" aria-live="polite">
        {message && <p role="status">{message}</p>}
        {pending && (
          <button
            type="button"
            className="gc-button gc-button-quiet"
            disabled={busy || access() === null}
            onClick={retry}
          >
            {busy ? "Confirming save…" : "Confirm original save"}
          </button>
        )}
      </div>
    )
  };
}

export function VolunteerServiceActions({
  owner,
  record
}: {
  owner: string;
  record: VolunteerServiceRecord;
}) {
  const noteId = useId();
  const [reason, setReason] = useState("");
  const action = useServiceAction(owner, record, reason, () => setReason(""));
  const target = {
    targetKind: record.target.kind,
    targetId: record.target.id
  };
  const complete = (completed: boolean) => {
    if (
      action.blocked ||
      !window.confirm(
        completed
          ? "Confirm that this volunteer actually completed the service? This does not share it on their profile."
          : "Correct this completion with the reason shown? It will also be removed from the volunteer's shared service history."
      )
    )
      return;
    void action.command({
      operation: "complete",
      ...target,
      expectedVersion: record.version,
      completed,
      reason
    });
  };
  const share = (shared: boolean) => {
    if (
      action.blocked ||
      !window.confirm(
        shared
          ? "Show this confirmed service on your member profile? Only members who can currently view its source can see it. You can hide it again."
          : "Hide this service from your profile? The private completion record remains."
      )
    )
      return;
    void action.command({
      operation: "service-visibility",
      ...target,
      expectedVersion: record.serviceVersion,
      completionVersion: record.completionVersion,
      shared
    });
  };
  return (
    <div className="space-y-3">
      {(record.canComplete || record.canCorrect) && (
        <fieldset disabled={action.blocked} className="space-y-3">
          <legend className="font-semibold">Organizer confirmation</legend>
          <p className="text-sm text-gc-muted">
            Record only service that actually happened. The volunteer chooses
            separately whether to share it on their profile.
          </p>
          <label className="block space-y-2" htmlFor={noteId}>
            <span>
              {record.canCorrect
                ? "Reason for correcting this completion"
                : "Optional private completion note"}
            </span>
            <textarea
              id={noteId}
              className={portalInputClass}
              value={reason}
              maxLength={500}
              rows={3}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          {record.canComplete && (
            <button
              type="button"
              className="gc-button"
              onClick={() => complete(true)}
            >
              Confirm completed service
            </button>
          )}
          {record.canCorrect && (
            <button
              type="button"
              className="gc-button gc-button-quiet"
              disabled={reason.trim().length < 3}
              onClick={() => complete(false)}
            >
              Correct completion
            </button>
          )}
        </fieldset>
      )}
      {(record.canShare || record.canHide) && (
        <fieldset disabled={action.blocked} className="space-y-3">
          <legend className="font-semibold">Your profile sharing choice</legend>
          <p>
            {record.shared
              ? "Shared with members who can view the source."
              : "This service is private and is not shared on your profile."}
          </p>
          <p className="text-sm text-gc-muted">
            Sharing shows the role and confirmation date. Application answers,
            availability and private notes stay private. A corrected completion
            requires a new sharing choice.
          </p>
          {record.canShare && !record.shared && (
            <button
              type="button"
              className="gc-button"
              onClick={() => share(true)}
            >
              Share confirmed service on my profile
            </button>
          )}
          {record.canHide && (
            <button
              type="button"
              className="gc-button gc-button-quiet"
              onClick={() => share(false)}
            >
              Hide service from my profile
            </button>
          )}
        </fieldset>
      )}
      {action.status}
    </div>
  );
}

export function VolunteerServiceCard({
  owner,
  record
}: {
  owner: string;
  record: VolunteerServiceRecord;
}) {
  return (
    <article className="space-y-4 rounded-xl border border-gc-divider p-4 max-[359px]:px-3">
      <h2 className="text-xl [overflow-wrap:anywhere]">{record.title}</h2>
      <p>
        {record.completed && record.completedAt ? (
          <>
            Confirmed completed on <RegionalTime value={record.completedAt} />.
          </>
        ) : (
          "Completion has not been confirmed."
        )}
      </p>
      {(!record.current || record.recoveryRequired) && (
        <p>
          Current service details are unavailable. Sharing is concealed until
          current access and the completion record can be confirmed. You can
          still remove your sharing choice.
        </p>
      )}
      {record.current && record.postId && (
        <Link
          className="inline-flex min-h-11 items-center underline"
          prefetch={false}
          href={
            record.opportunityId
              ? `/platform/serve/${record.opportunityId}`
              : `/platform/posts/${record.postId}`
          }
        >
          View service source
        </Link>
      )}
      <VolunteerServiceActions
        key={`${owner}:${record.target.kind}:${record.target.id}:${record.version}:${record.serviceVersion}`}
        owner={owner}
        record={record}
      />
    </article>
  );
}
