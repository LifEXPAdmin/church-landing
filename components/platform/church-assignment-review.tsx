"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  rolePresets,
  roleRecommendationChoices,
  sensitiveRoleRecommendations
} from "@/lib/platform/church-role-library";
import {
  structureCapabilities,
  type StructureCapability,
  type StructureSnapshot
} from "@/lib/platform/church-structure-types";
import { portalButtonClass, portalInputClass } from "./portal-action-form";
import { portalLinkClass } from "./portal-ui";

type Review = NonNullable<StructureSnapshot["privileges"]> & {
  version: number;
  positionName: string;
};
type Stage = "select" | "privileges" | "review" | "saved";

export function ChurchAssignmentReview({
  church,
  positions,
  candidates,
  initialPositionId = "",
  initialConnectionId = "",
  assignmentId = ""
}: {
  church: { id: string; name: string };
  positions: { id: string; name: string }[];
  candidates: { id: string; name: string }[];
  initialPositionId?: string;
  initialConnectionId?: string;
  assignmentId?: string;
}) {
  const [positionId, setPositionId] = useState(initialPositionId);
  const [listed, setListed] = useState(
    candidates.some((c) => c.id === initialConnectionId)
      ? initialConnectionId
      : ""
  );
  const [code, setCode] = useState(
    candidates.some((c) => c.id === initialConnectionId)
      ? ""
      : initialConnectionId
  );
  const [stage, setStage] = useState<Stage>("select");
  const [baseline, setBaseline] = useState<Review | null>(null);
  const [selected, setSelected] = useState<StructureCapability[]>([]);
  const [requestKey, setRequestKey] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [needsReview, setNeedsReview] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [feedback, setFeedback] = useState<{
    error: boolean;
    message: string;
  } | null>(null);
  const feedbackRef = useRef<HTMLParagraphElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const base = `/platform/churches/${encodeURIComponent(church.id)}`;
  useEffect(() => {
    if (feedback) feedbackRef.current?.focus();
  }, [feedback]);
  useEffect(() => {
    headingRef.current?.focus();
  }, [stage]);

  async function loadReview(keepChoices = false) {
    if (inFlight.current) return;
    if (
      !positionId ||
      (!assignmentId && ((!listed && !code.trim()) || (listed && code.trim())))
    ) {
      setFeedback({
        error: true,
        message:
          "Choose a position and one member: use the listed member picker or a church assignment code."
      });
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setFeedback(null);
    try {
      const params = new URLSearchParams({
        churchId: church.id,
        view: "privileges",
        positionId,
        ...(assignmentId
          ? { assignmentId }
          : { connectionId: listed || code.trim() })
      });
      const response = await fetch(`/api/platform/church-structure?${params}`, {
        cache: "no-store"
      });
      const body = await response.json();
      if (!response.ok || !body.privileges)
        throw new Error(
          body.message ||
            "Current assignment access could not be loaded. Your choices are kept."
        );
      const snapshot = body as StructureSnapshot;
      const review = snapshot.privileges!;
      const position = snapshot.positions.find(
        (p) => p.id === review.positionId
      );
      if (!position)
        throw new Error("The selected position is no longer available.");
      setBaseline({
        ...review,
        version: snapshot.version,
        positionName: position.name
      });
      if (!keepChoices)
        setSelected(
          review.assigned
            ? review.selected
            : review.recommendations.filter(
                (c) =>
                  review.grantable.includes(c) &&
                  !sensitiveRoleRecommendations.includes(c)
              )
        );
      setRequestKey(crypto.randomUUID());
      setConfirmed(false);
      setNeedsReview(false);
      setUncertain(false);
      setStage("privileges");
      if (keepChoices)
        setFeedback({
          error: false,
          message:
            "Current saved access is loaded. Your choices are kept; compare them with the saved permissions and review again before saving."
        });
    } catch (error) {
      setFeedback({
        error: true,
        message:
          error instanceof Error
            ? error.message
            : "Current access could not be loaded. Your choices are kept."
      });
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function save() {
    if (!baseline || !confirmed || needsReview || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/platform/church-structure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operation: "assignment-privileges",
          churchId: church.id,
          positionId: baseline.positionId,
          connectionId: baseline.connectionId,
          expectedVersion: baseline.version,
          assignmentVersion: baseline.assignmentVersion,
          requestKey,
          capabilities: selected,
          privilegesReviewed: true,
          confirmed: true
        })
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        if ([400, 401, 403, 404, 409].includes(response.status)) {
          setNeedsReview(true);
          setUncertain(false);
        } else setUncertain(true);
        setFeedback({
          error: true,
          message:
            response.status === 409
              ? "Saved access changed while this review was open. Your choices are kept. Load current access and review again before saving."
              : body?.message ||
                "The result could not be confirmed. Your reviewed choices and save reference are kept."
        });
        return;
      }
      if (typeof body?.id !== "string" || typeof body?.version !== "number")
        throw new Error("Unconfirmed save");
      setUncertain(false);
      setStage("saved");
      setFeedback({
        error: false,
        message:
          "Assignment and reviewed privileges saved together. Other roles and independent grants are unchanged."
      });
    } catch {
      setUncertain(true);
      setFeedback({
        error: true,
        message:
          "We could not confirm the save. Retry the same reviewed change, or load current access before changing your choices."
      });
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  const outsideAuthority = baseline
    ? [...new Set([...selected, ...baseline.selected])].filter(
        (c) => !baseline.grantable.includes(c)
      )
    : [];
  const otherSources =
    baseline?.effective.filter(
      (g) =>
        g.source === "INDEPENDENT" || g.assignmentId !== baseline.assignmentId
    ) ?? [];
  const recommended = baseline?.recommendations ?? [];
  const changedPreset =
    selected.length !== recommended.length ||
    selected.some((c) => !recommended.includes(c));
  return (
    <div className="max-w-3xl space-y-6" aria-busy={busy}>
      <p className="text-sm text-gc-muted">
        Select a position and member → Privileges → Review and save. Nothing is
        assigned until the final save.
      </p>
      {feedback && (
        <p
          ref={feedbackRef}
          tabIndex={-1}
          role={feedback.error ? "alert" : "status"}
          className="rounded-xl border border-gc-divider p-4 focus:outline-none focus:ring-2 focus:ring-gc-focus"
        >
          {feedback.message}
        </p>
      )}
      <h2
        ref={headingRef}
        tabIndex={-1}
        className="font-display text-2xl focus:outline-none focus:ring-2 focus:ring-gc-focus"
      >
        {stage === "select"
          ? "Select role and member"
          : stage === "privileges"
            ? "Privileges"
            : stage === "review"
              ? "Review and save"
              : "Assignment saved"}
      </h2>
      {stage === "select" && (
        <>
          <form
            aria-label="Select role and member"
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void loadReview();
            }}
          >
            <fieldset disabled={busy} className="min-w-0 space-y-4">
              <legend className="sr-only">Select role and member</legend>
              <label className="block font-semibold">
                Position
                <select
                  required
                  value={positionId}
                  disabled={!!assignmentId || busy}
                  onChange={(event) => setPositionId(event.target.value)}
                  className={portalInputClass}
                >
                  <option value="">Choose a position</option>
                  {positions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · {p.id.slice(-6)}
                    </option>
                  ))}
                </select>
              </label>
              {assignmentId ? (
                <p>
                  Review the member already assigned to this position. Their
                  current directory choices will be respected.
                </p>
              ) : (
                <>
                  <label className="block font-semibold">
                    Choose a listed member
                    <select
                      value={listed}
                      onChange={(event) => setListed(event.target.value)}
                      className={portalInputClass}
                    >
                      <option value="">
                        Choose a member, or use an assignment code
                      </option>
                      {candidates.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block font-semibold">
                    Church assignment code
                    <input
                      value={code}
                      maxLength={100}
                      onChange={(event) => setCode(event.target.value)}
                      className={portalInputClass}
                      aria-describedby="assignment-code-help"
                    />
                  </label>
                  <p
                    id="assignment-code-help"
                    className="text-sm text-gc-muted"
                  >
                    Use one selection method. An unlisted member can share their
                    code from My responsibilities; their private name and
                    contact details stay hidden.
                  </p>
                </>
              )}
              <button className={portalButtonClass} type="submit">
                {busy ? "Loading privileges…" : "Continue to Privileges"}
              </button>
            </fieldset>
          </form>
          {!assignmentId && (
            <p className="text-sm text-gc-muted">
              Need a different title?{" "}
              <Link
                className={portalLinkClass}
                href={`${base}/structure/roles`}
              >
                Manage role titles
              </Link>
              , then{" "}
              <Link className={portalLinkClass} href={`${base}/structure/new`}>
                create a separate position
              </Link>
              . Those actions do not assign a member or grant permissions.
            </p>
          )}
          <Link className={portalLinkClass} href={`${base}/structure`}>
            Cancel and return to structure
          </Link>
        </>
      )}
      {baseline && (stage === "privileges" || stage === "review") && (
        <>
          <div className="space-y-2 rounded-xl border border-gc-divider bg-gc-surface p-4">
            <p className="font-semibold">{baseline.positionName}</p>
            <p>
              {baseline.memberLabel}
              {baseline.isSelf ? " (you)" : ""}
            </p>
            <p className="text-sm">Church scope: {church.name}</p>
            <p className="text-sm text-gc-muted">
              {baseline.assigned
                ? "Reviewing an existing assignment. Its reporting position stays unchanged."
                : "New assignment to the selected position. No supervisor is inferred and the existing position is not moved."}
            </p>
          </div>
          {stage === "privileges" && (
            <>
              <p>
                {baseline.assigned
                  ? "Saved assignment choices"
                  : changedPreset
                    ? "Customized choices"
                    : "Recommended starting choices"}{" "}
                · {rolePresets[baseline.presetKey].name}, version{" "}
                {baseline.presetVersion}. Review every choice. Sensitive
                management starts off for new assignments.
              </p>
              {baseline.isSelf && (
                <p className="text-sm text-gc-muted">
                  You cannot grant yourself permissions. Use Step down to end
                  your own role and its access.
                </p>
              )}
              {!baseline.grantable.length && !baseline.isSelf && (
                <p className="text-sm text-gc-muted">
                  You can review a role with no additional permissions. Granting
                  access also requires current delegation authority and each
                  selected permission.
                </p>
              )}
              <fieldset disabled={busy} className="min-w-0 space-y-3">
                <legend className="font-semibold">
                  Permissions supplied by this assignment
                </legend>
                {roleRecommendationChoices.map((c) => (
                  <label
                    key={c}
                    className="flex min-h-11 items-start gap-3 rounded-xl border border-gc-divider p-3"
                  >
                    <input
                      type="checkbox"
                      className="mt-1 h-5 w-5 shrink-0 accent-gc-action focus-visible:ring-2 focus-visible:ring-gc-focus"
                      checked={selected.includes(c)}
                      disabled={!baseline.grantable.includes(c)}
                      onChange={(event) => {
                        setSelected((current) =>
                          event.target.checked
                            ? [...current, c]
                            : current.filter((item) => item !== c)
                        );
                        setConfirmed(false);
                      }}
                    />
                    <span>
                      {structureCapabilities[c]}
                      <span className="block text-sm text-gc-muted">
                        {recommended.includes(c)
                          ? "Recommended for this title. "
                          : "Optional. "}
                        {sensitiveRoleRecommendations.includes(c)
                          ? "Sensitive management. "
                          : ""}
                        {!baseline.grantable.includes(c)
                          ? "Unavailable within your current delegation authority."
                          : "Applies only in this church."}
                      </span>
                    </span>
                  </label>
                ))}
              </fieldset>
              {rolePresets[baseline.presetKey].unavailable.map((message) => (
                <p className="text-sm text-gc-muted" key={message}>
                  {message}
                </p>
              ))}
              <p className="text-sm text-gc-muted">
                Public church verification and profile authority, ownership
                transfer, finance and platform administration use separate
                workflows. A title never unlocks them.
              </p>
            </>
          )}
          <section
            className="space-y-2"
            aria-label="Current and proposed permissions"
          >
            <h3 className="font-semibold">
              Changes from saved assignment access
            </h3>
            <p className="text-sm">
              Currently supplied by this role:{" "}
              {baseline.selected
                .map((c) => structureCapabilities[c])
                .join(", ") || "No additional permissions"}
              .
            </p>
            <p className="text-sm">
              After this save:{" "}
              {selected.map((c) => structureCapabilities[c]).join(", ") ||
                "No additional permissions"}
              .
            </p>
            <h3 className="font-semibold">Access from other sources remains</h3>
            {otherSources.length ? (
              <ul className="list-inside list-disc space-y-2 text-sm">
                {otherSources.map((g, i) => (
                  <li key={`${g.capability}-${g.assignmentId}-${i}`}>
                    {structureCapabilities[g.capability]} ·{" "}
                    {g.source === "INDEPENDENT"
                      ? "Independent grant"
                      : `Other role: ${g.positionName ?? "another current assignment"}`}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gc-muted">
                No other current grant sources.
              </p>
            )}
            <p className="text-sm text-gc-muted">
              Unchecking a permission removes only this assignment’s
              contribution. Another source can still supply that access.
            </p>
          </section>
          {outsideAuthority.length > 0 && (
            <p role="alert">
              You cannot save changes to this permission set with your current
              authority. Another authorized manager must review it.
            </p>
          )}
          {stage === "privileges" ? (
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                className={portalButtonClass}
                disabled={busy || outsideAuthority.length > 0}
                onClick={() => {
                  setConfirmed(false);
                  setFeedback(null);
                  setStage("review");
                }}
              >
                Review assignment
              </button>
              <button
                type="button"
                className={portalLinkClass}
                disabled={busy}
                onClick={() => {
                  setBaseline(null);
                  setFeedback(null);
                  setStage("select");
                }}
              >
                Back to role and member
              </button>
            </div>
          ) : (
            <form
              className="space-y-4"
              aria-label="Save reviewed assignment"
              onSubmit={(event) => {
                event.preventDefault();
                void save();
              }}
            >
              <label className="flex min-h-11 items-start gap-3">
                <input
                  type="checkbox"
                  required
                  checked={confirmed}
                  disabled={busy || needsReview || uncertain}
                  onChange={(event) => setConfirmed(event.target.checked)}
                  className="mt-1 h-5 w-5 shrink-0 accent-gc-action"
                />
                <span>
                  I reviewed the member, position and privileges, including any
                  choice of no additional permissions.
                </span>
              </label>
              <div className="flex flex-wrap gap-3">
                <button
                  type="submit"
                  className={portalButtonClass}
                  disabled={
                    busy ||
                    !confirmed ||
                    needsReview ||
                    outsideAuthority.length > 0
                  }
                >
                  {busy
                    ? "Saving…"
                    : uncertain
                      ? "Retry the same reviewed save"
                      : "Save assignment and privileges"}
                </button>
                <button
                  type="button"
                  className={portalLinkClass}
                  disabled={busy || uncertain || needsReview}
                  onClick={() => {
                    setConfirmed(false);
                    setStage("privileges");
                  }}
                >
                  Back to Privileges
                </button>
                {(needsReview || uncertain) && (
                  <button
                    type="button"
                    className={portalLinkClass}
                    disabled={busy}
                    onClick={() => void loadReview(true)}
                  >
                    Load current access and keep choices
                  </button>
                )}
              </div>
            </form>
          )}
          {!busy && !uncertain && (
            <Link className={portalLinkClass} href={`${base}/structure`}>
              Cancel and return to structure
            </Link>
          )}
        </>
      )}
      {stage === "saved" && baseline && (
        <Link
          className={portalLinkClass}
          href={`${base}/structure/${encodeURIComponent(baseline.positionId)}`}
        >
          View saved position and assignments
        </Link>
      )}
    </div>
  );
}
