"use client";
import Link from "next/link";
import {
  useCallback,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode
} from "react";
import type { SupportSnapshot } from "@/lib/platform/support-types";
import { ReadVisibility, useReadVisibility } from "./read-visibility";
import type { AdminCaseDetail } from "@/lib/platform/admin-detail";
import { adminPriorities, adminSourceTypes } from "@/lib/platform/admin-types";
import { AdminForm, type AdminField } from "./admin-form";
import { adminCaseHref } from "./admin-worklist";
import { SupportViews, supportStatusOptions } from "./support-views";
import { SupportTime } from "./regional-support-presentation";
import { CommunityReportReview } from "./community-report-review";
const options = (values: Record<string, string>) =>
  Object.entries(values).map(([value, label]) => ({ value, label }));
const textField = (
  name: string,
  label: string,
  max: number,
  value = ""
): AdminField => ({
  name,
  label,
  max,
  value,
  optional: true,
  type: "textarea"
});
// Disclosure and command owners survive concealment; private DOM does not.
function CaseDisclosure({
  visible,
  title,
  children,
  className
}: {
  visible: boolean;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <details
      className={className}
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      {visible && (
        <summary className="min-h-11 cursor-pointer font-semibold">
          {title}
        </summary>
      )}
      {children}
    </details>
  );
}
function CaseAction({
  workKey,
  onWorkChange,
  ...props
}: ComponentProps<typeof AdminForm> & {
  workKey: string;
  onWorkChange: (id: string, pending: boolean) => void;
}) {
  const changed = useCallback(
    (pending: boolean) => onWorkChange(workKey, pending),
    [workKey, onWorkChange]
  );
  return <AdminForm {...props} onDraftChange={changed} />;
}
// Replace current text/versions only when every mounted native command survives.
function nativeStructure(snapshot: SupportSnapshot | null) {
  const c = snapshot?.detail;
  if (!c) return "unavailable";
  const closed = ["RESOLVED", "CLOSED"].includes(c.status);
  return JSON.stringify({
    viewer: snapshot?.viewer.id,
    caseId: c.id,
    requester: c.requester.id,
    owner: c.owner?.id,
    coordinator: c.coordinator?.id,
    access: c.access,
    reply:
      !closed &&
      (!c.feedback || c.feedback.contactAllowed || c.access.requester),
    reopen: closed && (c.access.requester || c.access.owner),
    status:
      (c.access.owner || c.access.requester) && c.status !== "CLOSED"
        ? supportStatusOptions(c).map((option) => option.value)
        : null,
    feedback: c.feedback
      ? {
          kind: c.feedback.kind,
          redacted: !!c.feedback.redactedAt,
          attachments: c.feedback.attachments.map((image) => image.id)
        }
      : null,
    feature: c.access.owner && !!c.featureDecision,
    handoff: c.access.owner
      ? c.ownerOptions.map((option) => [option.id, option.version])
      : [],
    sharing:
      c.access.requester && !c.feedback
        ? c.coordinator
          ? ["revoke", c.coordinator.id]
          : !closed
            ? c.shareOptions.map((option) => [option.id, option.version])
            : []
        : null
  });
}
export function AdminCase({
  data,
  back,
  onRefresh
}: {
  data: AdminCaseDetail;
  back: string;
  onRefresh: () => void;
}) {
  const { row, notes, history, navigation } = data,
    owner = navigation.viewer.id,
    fixed = {
      sourceType: row.sourceType,
      sourceId: row.sourceId,
      expectedVersion: row.version
    };
  const here = adminCaseHref(row.sourceType, row.sourceId, back);
  const present = useReadVisibility() && row.canRead;
  const work = useRef(new Set<string>());
  const [workKeys, setWorkKeys] = useState<string[]>([]);
  const onWorkChange = useCallback((id: string, pending: boolean) => {
    if (work.current.has(id) === pending) return;
    if (pending) work.current.add(id);
    else work.current.delete(id);
    setWorkKeys([...work.current]);
  }, []);
  const onNativeWorkChange = useCallback(
    (id: string, pending: boolean) => {
      onWorkChange(`native:${id}`, pending);
    },
    [onWorkChange]
  );
  const [navigationNotice, setNavigationNotice] = useState("");
  const onNavigate = useCallback(
    (id: string, destination: string, intent?: "saved" | "discarded") => {
      if ([...work.current].some((other) => other !== `native:${id}`)) {
        setNavigationNotice(
          intent === "discarded"
            ? "That form’s local entries were discarded. Other local entries remain on this page; review, save or discard them before leaving."
            : "That request was saved. Other local entries remain on this page; review, save or discard them before leaving."
        );
        onRefresh();
      } else window.location.assign(destination);
    },
    [onRefresh]
  );
  const [acceptedSupport, setAcceptedSupport] = useState(data.support);
  const nativeWork = workKeys.some((key) => key.startsWith("native:"));
  const replaceSupport =
    !nativeWork ||
    (nativeStructure(acceptedSupport) === nativeStructure(data.support) &&
      (!acceptedSupport?.detail?.unread || !!data.support?.detail?.unread));
  const support = replaceSupport ? data.support : acceptedSupport;
  if (replaceSupport && acceptedSupport !== data.support)
    setAcceptedSupport(data.support);
  const nativeVisible = present && replaceSupport;
  const nativePrivacy = {
    visible: nativeVisible,
    currentAccess: present && !!data.support?.detail,
    onAccessDenied: () =>
      window.dispatchEvent(new Event("admin-access-changed")),
    onWorkChange: onNativeWorkChange,
    onNavigate
  };
  const actionProps = {
    owner,
    fixed,
    onSaved: onRefresh,
    onWorkChange,
    available: row.canTriage,
    privacy: { visible: present, currentAccess: present && row.canTriage }
  };
  const noteIds = [
    ...new Set([
      ...notes.map((note) => note.id),
      ...workKeys
        .filter((key) => key.startsWith("redact:"))
        .map((key) => key.slice(7))
    ])
  ];
  return (
    <div className="space-y-6">
      {present && (
        <>
          <Link className="text-gc-accent underline" href={back}>
            Back to filtered requests
          </Link>
          <header className="space-y-2">
            <p className="text-sm text-gc-muted">
              {adminSourceTypes[row.sourceType]} ·{" "}
              {row.nativeStatus.replaceAll("_", " ").toLowerCase()} · Version{" "}
              {row.version}
            </p>
            <h1 className="break-words text-3xl font-semibold">{row.title}</h1>
            <p className="text-sm text-gc-muted">
              {row.ownerName
                ? `Owner: ${row.ownerName}`
                : "Awaiting assignment"}{" "}
              · Received <SupportTime value={row.createdAt} />
            </p>
            <p className="break-all text-xs text-gc-muted">
              Reference: {row.sourceId}
            </p>
          </header>
          {data.support?.detail?.feedback?.kind === "SUGGESTION" &&
            navigation.capabilities.includes("MANAGE_PRODUCT_FEEDBACK") && (
              <Link
                className="gc-button gc-button-quiet"
                href={`/platform/admin/feedback/ideas/${row.sourceId}`}
              >
                Review a public idea from this suggestion
              </Link>
            )}
        </>
      )}
      <CaseDisclosure
        visible={present}
        title="Priority, next action and reminder"
        className="rounded-xl border border-gc-divider p-4"
      >
        <CaseAction
          {...actionProps}
          owner={owner}
          workKey="triage"
          operation="triage"
          fixed={fixed}
          fields={[
            {
              name: "priority",
              label: "Priority",
              type: "select",
              value: row.priority,
              options: options(adminPriorities)
            },
            textField(
              "nextAction",
              "Next internal action",
              500,
              row.nextAction
            ),
            {
              name: "tags",
              label: "Internal tags, separated by commas",
              type: "tags",
              max: 247,
              optional: true,
              value: row.tags.join(", ")
            },
            {
              name: "reminderAt",
              label: "Internal reminder, in this device’s time zone",
              type: "datetime-local",
              optional: true,
              value: row.reminderAt ? localDateInput(row.reminderAt) : ""
            }
          ]}
          button="Save triage details"
          onSaved={onRefresh}
          caution="A reminder appears in the internal due filter. It sends no message and promises no response time."
        />
      </CaseDisclosure>
      {row.sourceType !== "SUPPORT" && (
        <CaseDisclosure
          visible={present}
          title="Reviewer assignment"
          className="rounded-xl border border-gc-divider p-4"
        >
          <CaseAction
            {...actionProps}
            owner={owner}
            workKey="assign"
            operation="assign"
            fixed={fixed}
            fields={[
              {
                name: "username",
                label:
                  "Exact eligible reviewer username; blank clears the assignment",
                max: 40,
                optional: true
              }
            ]}
            button="Save reviewer assignment"
            onSaved={onRefresh}
            caution="The selected reviewer must already have permission to open this case. Assignment grants no access."
          />
        </CaseDisclosure>
      )}
      {support && (
        <section aria-labelledby="admin-requester-history">
          <h2
            id="admin-requester-history"
            className="mb-4 text-xl font-semibold"
          >
            {present ? "Requester conversation and native actions" : ""}
          </h2>
          <ReadVisibility.Provider value={nativeVisible}>
            <SupportViews
              snapshot={support}
              privacy={nativePrivacy}
              view="detail"
              detailBase={here}
              handoffDestination={back}
              onRefresh={onRefresh}
            />
          </ReadVisibility.Provider>
        </section>
      )}
      {row.sourceType === "REPORT" && (
        <section aria-labelledby="admin-native-review">
          <h2 id="admin-native-review" className="mb-4 text-xl font-semibold">
            {present ? "Content review and decision" : ""}
          </h2>
          <CommunityReportReview
            owner={owner}
            id={row.sourceId}
            closed={row.nativeStatus === "CLOSED"}
          />
        </section>
      )}
      {present && row.sourceType === "CLAIM" && (
        <section className="space-y-4 rounded-xl border border-gc-divider p-5">
          <h2 className="text-xl font-semibold">Church verification</h2>
          <p>
            Review proof and requested permissions in the dedicated verification
            form. Its independent review and current authority checks determine
            the available decisions.
          </p>
          <Link
            className="gc-button"
            href={`/platform/church-claims/review/${encodeURIComponent(row.sourceId)}?adminReturnTo=${encodeURIComponent(back)}`}
          >
            Open verification and decisions
          </Link>
        </section>
      )}
      <section
        aria-labelledby="admin-internal-notes"
        className="space-y-4 rounded-xl border border-gc-divider p-5"
      >
        {present && (
          <>
            <h2 id="admin-internal-notes" className="text-xl font-semibold">
              Internal notes
            </h2>
            <p className="text-sm text-gc-muted">
              Visible only to currently authorized case reviewers. These are
              separate from replies and never appear in the requester’s
              conversation. Do not copy passwords, codes or unnecessary personal
              details.
            </p>
          </>
        )}
        <CaseAction
          {...actionProps}
          owner={owner}
          workKey="note"
          operation="note"
          fixed={fixed}
          fields={[
            {
              name: "body",
              label: "Internal note",
              type: "textarea",
              max: 2000,
              min: 1
            }
          ]}
          button="Save internal note"
          onSaved={onRefresh}
        />
        {present && notes.length === 0 && (
          <p className="text-gc-muted">
            No internal notes on this history page.
          </p>
        )}
        <ol className="space-y-4">
          {noteIds.map((noteId) => {
            const note = notes.find((item) => item.id === noteId);
            const eligible = !!note?.canRedact && !note.redacted;
            return (
              <li
                key={noteId}
                className="rounded-lg border border-gc-divider p-4"
              >
                {present && note && (
                  <>
                    <p className="whitespace-pre-wrap break-words">
                      {note.body}
                    </p>
                    <p className="mt-2 text-xs text-gc-muted">
                      {note.author} · <SupportTime value={note.createdAt} /> ·
                      Version {note.version}
                    </p>
                  </>
                )}
                {(eligible || workKeys.includes(`redact:${noteId}`)) && (
                  <CaseDisclosure
                    visible={present}
                    title={
                      eligible
                        ? "Redact private information"
                        : "Confirm earlier note redaction"
                    }
                    className="mt-3"
                  >
                    <CaseAction
                      {...actionProps}
                      workKey={`redact:${noteId}`}
                      operation="redact-note"
                      fixed={{ ...fixed, noteId }}
                      available={row.canTriage && eligible}
                      fields={[
                        {
                          name: "reason",
                          label: "Verified reason",
                          type: "select",
                          options: options({
                            SECRET: "Accidentally submitted secret",
                            PRIVATE_INFORMATION: "Verified privacy removal"
                          })
                        }
                      ]}
                      button={
                        eligible
                          ? "Redact this internal note"
                          : "Confirm earlier note redaction"
                      }
                    />
                  </CaseDisclosure>
                )}
              </li>
            );
          })}
        </ol>
      </section>
      {data.bug && (
        <CaseDisclosure
          visible={present}
          title="Bug reproduction and engineering link"
          className="rounded-xl border border-gc-divider p-4"
        >
          <CaseAction
            {...actionProps}
            owner={owner}
            workKey="bug"
            operation="bug"
            fixed={fixed}
            fields={[
              textField("steps", "Reproduction steps", 1500, data.bug.bugSteps),
              textField(
                "expected",
                "Expected behavior",
                1500,
                data.bug.bugExpected
              ),
              textField("actual", "Actual behavior", 1500, data.bug.bugActual),
              {
                name: "environment",
                label: "App version, device and browser",
                max: 300,
                optional: true,
                value: data.bug.bugEnvironment
              },
              {
                name: "reproducibility",
                label: "Observed result",
                type: "select",
                value: data.bug.reproducibility,
                options: options({
                  UNREVIEWED: "Not reviewed",
                  REPRODUCED: "Reproduced",
                  NOT_REPRODUCED: "Not reproduced",
                  NEEDS_INFORMATION: "More information needed"
                })
              },
              {
                name: "engineeringUrl",
                label: "Existing GitHub issue or pull request",
                max: 500,
                optional: true,
                value: data.bug.engineeringUrl
              }
            ]}
            button="Save reproduction details"
            onSaved={onRefresh}
            caution="Remove private contacts, secrets and personal content. A link does not create or send an engineering issue."
          />
        </CaseDisclosure>
      )}
      <section className="space-y-4 rounded-xl border border-gc-divider p-5">
        {present && (
          <>
            <h2 className="text-xl font-semibold">Related requests</h2>
            {data.group ? (
              <>
                <h3 className="font-semibold">{data.group.title}</h3>
                <p className="text-sm text-gc-muted">
                  {data.group.restricted
                    ? "Only currently permitted requests are shown. Shared counts and details are unavailable."
                    : `${data.group.rows.length} separate requests from ${data.group.affectedAccounts} distinct accounts. Grouping is not a vote.`}
                </p>
                {data.group.engineeringUrl && (
                  <a
                    className="text-gc-accent underline"
                    href={data.group.engineeringUrl}
                    rel="noreferrer"
                  >
                    Existing engineering issue
                  </a>
                )}
                <ul className="space-y-2">
                  {data.group.rows.map((r) => (
                    <li key={r.sourceType + ":" + r.sourceId}>
                      <Link
                        className="text-gc-accent underline"
                        href={adminCaseHref(r.sourceType, r.sourceId, back)}
                      >
                        {r.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="text-gc-muted">
                This request has no duplicate group.
              </p>
            )}
          </>
        )}
        <CaseAction
          {...actionProps}
          owner={owner}
          workKey="ungroup"
          available={row.canTriage && !!data.group}
          privacy={{
            ...actionProps.privacy,
            visible: present && (!!data.group || workKeys.includes("ungroup"))
          }}
          operation="ungroup"
          fixed={fixed}
          button="Ungroup this request"
          onSaved={onRefresh}
        />
        <CaseDisclosure visible={present} title="Link another original request">
          <CaseAction
            {...actionProps}
            owner={owner}
            workKey="group"
            operation="group"
            fixed={fixed}
            fields={[
              {
                name: "relatedSourceType",
                label: "Other request type",
                type: "select",
                options: options(adminSourceTypes)
              },
              {
                name: "relatedSourceId",
                label: "Other request reference",
                max: 100
              },
              {
                name: "relatedVersion",
                label: "Version shown on the other case",
                type: "number",
                min: 1
              },
              {
                name: "title",
                label: "Internal summary (existing groups keep their summary)",
                max: 120,
                min: 1
              },
              {
                name: "engineeringUrl",
                label: "Existing GitHub issue or pull request",
                max: 500,
                optional: true
              }
            ]}
            button="Link original requests"
            onSaved={onRefresh}
            caution="Each original conversation stays private to its participants. Explicitly ungroup a request before moving it between groups."
          />
        </CaseDisclosure>
      </section>
      {present && (
        <>
          <section className="space-y-3">
            <h2 className="text-xl font-semibold">Admin action history</h2>
            {history.length === 0 ? (
              <p className="text-gc-muted">
                No admin changes on this history page. Native history appears
                above.
              </p>
            ) : (
              <ol className="space-y-3">
                {history.map((item) => (
                  <li key={item.id} className="text-sm">
                    {item.action.replaceAll("-", " ")} · {item.author} · Version{" "}
                    {item.version} · <SupportTime value={item.createdAt} />
                    {item.reason &&
                      ` · ${item.reason.replaceAll("_", " ").toLowerCase()}`}
                  </li>
                ))}
              </ol>
            )}
          </section>
          <nav aria-label="Case history pages" className="flex flex-wrap gap-3">
            {data.page > 0 && (
              <Link
                className="gc-button gc-button-quiet"
                href={here + "&page=" + (data.page - 1)}
              >
                Newer history
              </Link>
            )}
            {data.more && data.page < 99 && (
              <Link
                className="gc-button gc-button-quiet"
                href={here + "&page=" + (data.page + 1)}
              >
                Older history
              </Link>
            )}
            <Link className="gc-button gc-button-quiet" href={back}>
              Back to filtered requests
            </Link>
          </nav>
        </>
      )}
      {present && navigationNotice && <p role="status">{navigationNotice}</p>}
    </div>
  );
}
function localDateInput(raw: string) {
  const date = new Date(raw);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
