"use client";
import Link from "next/link";
import { useState } from "react";
import type {
  PantryRequestView,
  PantrySessionView
} from "@/lib/platform/pantry-reads";
import { pantryStates } from "@/lib/platform/pantry-options";
import { reportEntryHref } from "@/lib/platform/community-report-types";
import { usePrivateChoiceAction } from "./use-private-choice-action";
import { portalInputClass } from "./portal-action-form";
import { RegionalTime } from "./regional-presentation";
import { usePantryEdit } from "./pantry-edit-scope";
export function PantryRequestCard({
  owner,
  row,
  sessions = []
}: {
  owner: string;
  row: PantryRequestView;
  sessions?: PantrySessionView[];
}) {
  const [sessionId, setSessionId] = useState(""),
    [reason, setReason] = useState(""),
    [note, setNote] = useState(
      "coordinatorNote" in row ? (row.coordinatorNote ?? "") : ""
    );
  const edit = usePantryEdit("this private assistance request");
  const draftKind =
    note !== (row.coordinatorNote ?? "")
      ? "note"
      : sessionId
        ? "assign"
        : reason
          ? "outcome"
          : null;
  const differentDraft = (operation: string) =>
    !!draftKind && draftKind !== operation;
  const action = usePrivateChoiceAction(
    "/api/platform/pantry",
    owner,
    !!sessionId || !!reason || note !== (row.coordinatorNote ?? ""),
    undefined,
    true
  );
  const command = (operation: string, extra: Record<string, unknown> = {}) => {
    if (action.blocked || differentDraft(operation) || !edit.claim()) return;
    void action.command({
      operation,
      id: row.id,
      expectedVersion: row.version,
      ...extra
    });
  };
  const active = ["REQUESTED", "ASSIGNED"].includes(row.state);
  return (
    <article
      aria-label="Private assistance request"
      className="space-y-3 rounded-xl border border-gc-divider p-4"
    >
      <h2 className="text-2xl">{row.title}</h2>
      <p>
        {row.state === "ASSIGNED" && row.confirmedAt
          ? "Pickup confirmed"
          : (pantryStates[row.state as keyof typeof pantryStates] ?? row.state)}
      </p>
      <p>
        Requested <RegionalTime value={row.createdAt} />.
      </p>
      {row.requester && <p>Requester: {row.requester.name}</p>}
      {!row.current && (
        <p>
          Current source access has ended. Counterpart details are concealed.
          You can withdraw an outstanding request and clear your own ended
          entries.
        </p>
      )}
      {row.cleared && <p>Your private details are cleared.</p>}
      {!!row.items.length && (
        <ul className="list-disc pl-5">
          {row.items.map((i) => (
            <li key={i.categoryId}>
              {i.label}: {i.quantity} {i.unit}
            </li>
          ))}
        </ul>
      )}
      {row.note && (
        <p className="whitespace-pre-wrap break-words">
          Practical note: {row.note}
        </p>
      )}
      {row.pickupContact && (
        <p className="whitespace-pre-wrap break-words">
          Chosen pickup contact: {row.pickupContact}
        </p>
      )}
      {row.session && (
        <div className="space-y-2">
          <p>
            Pickup: <RegionalTime value={row.session.startsAt} /> to{" "}
            <RegionalTime value={row.session.endsAt} /> ({row.session.timeZone}
            ).
          </p>
          <p className="whitespace-pre-wrap break-words">
            {row.session.pickupDetails}
          </p>
          <p>An appointment does not guarantee the requested stock.</p>
        </div>
      )}
      {edit.notice}
      {draftKind && (
        <p>
          Save or discard this edit before changing another part of the request.
        </p>
      )}
      <fieldset
        disabled={action.blocked || edit.blocked}
        className="min-w-0 space-y-3"
      >
        {row.own && row.canWithdraw && (
          <button
            type="button"
            className="gc-button gc-button-quiet"
            onClick={() => {
              if (confirm("Cancel this request and release its pickup place?"))
                command("cancel");
            }}
          >
            Cancel request
          </button>
        )}
        {row.own &&
          row.current &&
          row.state === "ASSIGNED" &&
          !row.confirmedAt &&
          row.session && (
            <button
              type="button"
              className="gc-button"
              onClick={() =>
                command("confirm", {
                  sessionVersion: row.session!.offeredVersion
                })
              }
            >
              Confirm this pickup offer
            </button>
          )}
        {row.canClear && !row.cleared && (
          <button
            disabled={!!draftKind}
            type="button"
            className="gc-button gc-button-quiet"
            onClick={() => {
              if (
                confirm(
                  row.own
                    ? "Clear your private request text, selected items and chosen contact?"
                    : "Clear your private coordinator note and hide this ended request?"
                )
              )
                command("clear");
            }}
          >
            Clear my private details
          </button>
        )}
        {!row.own && row.current && !row.cleared && (
          <>
            {active && (
              <>
                <label className="block space-y-2">
                  <span>Offer a pickup session</span>
                  <select
                    className={portalInputClass}
                    value={sessionId}
                    disabled={differentDraft("assign")}
                    onChange={(e) => {
                      if (!edit.claim()) return;
                      setSessionId(e.target.value);
                      if (!e.target.value) edit.release();
                    }}
                  >
                    <option value="">Choose a current session</option>
                    {sessions
                      .filter(
                        (s) => s.active && Date.parse(s.startsAt) > Date.now()
                      )
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.startLocal} {s.timeZone}, {s.occupied} of{" "}
                          {s.capacity} places used
                        </option>
                      ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="gc-button"
                  disabled={!sessionId || differentDraft("assign")}
                  onClick={() => {
                    const session = sessions.find((s) => s.id === sessionId);
                    if (session)
                      command("assign", {
                        sessionId,
                        sessionVersion: session.version
                      });
                  }}
                >
                  Offer selected pickup
                </button>
                <button
                  type="button"
                  className="gc-button gc-button-quiet"
                  disabled={!!draftKind}
                  onClick={() => {
                    if (
                      confirm(
                        "Decline this request and release its pickup place?"
                      )
                    )
                      command("decline");
                  }}
                >
                  Decline request
                </button>
              </>
            )}
            {row.session &&
              ["ASSIGNED", "COLLECTED", "MISSED"].includes(row.state) && (
                <>
                  <label className="block space-y-2">
                    <span>Private outcome or correction reason</span>
                    <textarea
                      className={portalInputClass}
                      maxLength={300}
                      value={reason}
                      disabled={differentDraft("outcome")}
                      onChange={(e) => {
                        if (!edit.claim()) return;
                        setReason(e.target.value);
                        if (!e.target.value) edit.release();
                      }}
                    />
                  </label>
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      className="gc-button"
                      disabled={
                        reason.trim().length < 3 || differentDraft("outcome")
                      }
                      onClick={() =>
                        command("outcome", { state: "COLLECTED", reason })
                      }
                    >
                      Record collected
                    </button>
                    <button
                      type="button"
                      className="gc-button gc-button-quiet"
                      disabled={
                        reason.trim().length < 3 || differentDraft("outcome")
                      }
                      onClick={() =>
                        command("outcome", { state: "MISSED", reason })
                      }
                    >
                      Record missed pickup
                    </button>
                  </div>
                </>
              )}
            <label className="block space-y-2">
              <span>Coordinator-only note</span>
              <textarea
                className={portalInputClass}
                maxLength={1000}
                value={note}
                disabled={differentDraft("note")}
                onChange={(e) => {
                  if (!edit.claim()) return;
                  setNote(e.target.value);
                  if (e.target.value === (row.coordinatorNote ?? ""))
                    edit.release();
                }}
              />
            </label>
            <p className="text-sm text-gc-muted">
              Keep notes minimal. This note is separate from the requester’s own
              record and public stock history.
            </p>
            <button
              type="button"
              className="gc-button gc-button-quiet"
              disabled={differentDraft("note")}
              onClick={() => command("note", { note })}
            >
              Save private note
            </button>
          </>
        )}
        {edit.editing && (
          <button
            type="button"
            className="gc-button gc-button-quiet"
            onClick={() => {
              setSessionId("");
              setReason("");
              setNote(row.coordinatorNote ?? "");
              edit.release();
            }}
          >
            Discard local edits
          </button>
        )}
      </fieldset>
      {!row.cleared && (
        <Link
          prefetch={false}
          className="inline-flex min-h-11 items-center underline"
          href={reportEntryHref("PANTRY_REQUEST", row.id)}
        >
          Report this selected private request
        </Link>
      )}
      {!!row.outcomeHistory?.length && (
        <details>
          <summary className="min-h-11 cursor-pointer py-2">
            Recent private outcome corrections
          </summary>
          <p>The latest twenty recorded outcomes appear here.</p>
          <ol className="space-y-2">
            {row.outcomeHistory.map((e) => (
              <li key={e.id} className="whitespace-pre-wrap break-words">
                {e.action.toLowerCase()}, version {e.version},{" "}
                <RegionalTime value={e.createdAt} />: {e.reason}
              </li>
            ))}
          </ol>
        </details>
      )}
      {action.status}
    </article>
  );
}
