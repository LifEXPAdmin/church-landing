"use client";
import Link from "next/link";
import type { AdminCaseDetail } from "@/lib/platform/admin-detail";
import { adminPriorities, adminSourceTypes } from "@/lib/platform/admin-types";
import { AdminForm, type AdminField } from "./admin-form";
import { adminCaseHref } from "./admin-worklist";
import { SupportViews } from "./support-views";
import { SupportTime } from "./support-presentation";
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
  return (
    <div className="space-y-6">
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
          {row.ownerName ? `Owner: ${row.ownerName}` : "Awaiting assignment"} ·
          Received <SupportTime value={row.createdAt} />
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
      <details className="rounded-xl border border-gc-divider p-4">
        <summary className="min-h-11 cursor-pointer font-semibold">
          Priority, next action and reminder
        </summary>
        <AdminForm
          owner={owner}
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
      </details>
      {row.sourceType !== "SUPPORT" && (
        <details className="rounded-xl border border-gc-divider p-4">
          <summary className="min-h-11 cursor-pointer font-semibold">
            Reviewer assignment
          </summary>
          <AdminForm
            owner={owner}
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
        </details>
      )}
      {data.support && (
        <section aria-labelledby="admin-requester-history">
          <h2
            id="admin-requester-history"
            className="mb-4 text-xl font-semibold"
          >
            Requester conversation and native actions
          </h2>
          <SupportViews
            snapshot={data.support}
            view="detail"
            detailBase={here}
            handoffDestination={back}
            onRefresh={onRefresh}
          />
        </section>
      )}
      {row.sourceType === "REPORT" && (
        <section aria-labelledby="admin-native-review">
          <h2 id="admin-native-review" className="mb-4 text-xl font-semibold">
            Content review and decision
          </h2>
          <CommunityReportReview
            owner={owner}
            id={row.sourceId}
            closed={row.nativeStatus === "CLOSED"}
          />
        </section>
      )}
      {row.sourceType === "CLAIM" && (
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
        <h2 id="admin-internal-notes" className="text-xl font-semibold">
          Internal notes
        </h2>
        <p className="text-sm text-gc-muted">
          Visible only to currently authorized case reviewers. These are
          separate from replies and never appear in the requester’s
          conversation. Do not copy passwords, codes or unnecessary personal
          details.
        </p>
        <AdminForm
          owner={owner}
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
        {notes.length === 0 ? (
          <p className="text-gc-muted">
            No internal notes on this history page.
          </p>
        ) : (
          <ol className="space-y-4">
            {notes.map((note) => (
              <li
                key={note.id}
                className="rounded-lg border border-gc-divider p-4"
              >
                <p className="whitespace-pre-wrap break-words">{note.body}</p>
                <p className="mt-2 text-xs text-gc-muted">
                  {note.author} · <SupportTime value={note.createdAt} /> ·
                  Version {note.version}
                </p>
                {note.canRedact && !note.redacted && (
                  <details className="mt-3">
                    <summary className="min-h-11 cursor-pointer text-sm font-semibold">
                      Redact private information
                    </summary>
                    <AdminForm
                      owner={owner}
                      operation="redact-note"
                      fixed={{ ...fixed, noteId: note.id }}
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
                      button="Redact this internal note"
                      onSaved={onRefresh}
                    />
                  </details>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>
      {data.bug && (
        <details className="rounded-xl border border-gc-divider p-4">
          <summary className="min-h-11 cursor-pointer font-semibold">
            Bug reproduction and engineering link
          </summary>
          <AdminForm
            owner={owner}
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
        </details>
      )}
      <section className="space-y-4 rounded-xl border border-gc-divider p-5">
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
            <AdminForm
              owner={owner}
              operation="ungroup"
              fixed={fixed}
              button="Ungroup this request"
              onSaved={onRefresh}
            />
          </>
        ) : (
          <p className="text-gc-muted">This request has no duplicate group.</p>
        )}
        <details>
          <summary className="min-h-11 cursor-pointer font-semibold">
            Link another original request
          </summary>
          <AdminForm
            owner={owner}
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
        </details>
      </section>
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Admin action history</h2>
        {history.length === 0 ? (
          <p className="text-gc-muted">
            No admin changes on this history page. Native history appears above.
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
    </div>
  );
}
function localDateInput(raw: string) {
  const date = new Date(raw);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
