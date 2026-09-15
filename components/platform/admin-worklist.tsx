"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  adminPriorities,
  adminQueueStates,
  adminSourceTypes,
  defaultAdminFilters,
  type AdminQueueFilters,
  type AdminQueueSnapshot
} from "@/lib/platform/admin-types";
import { AdminForm, adminInputClass } from "./admin-form";
export const adminCaseHref = (type: string, id: string, back: string) =>
  `/platform/admin/cases/${type}/${encodeURIComponent(id)}?returnTo=${encodeURIComponent(back)}`;
export function AdminWorklist({
  data,
  onRefresh,
  continuation,
  initialSelection = []
}: {
  data: AdminQueueSnapshot;
  onRefresh: () => void;
  continuation?: string | null;
  initialSelection?: string[];
}) {
  const [selection, setSelection] = useState<string[]>(() =>
      initialSelection.filter((key) =>
        data.rows.some((r) => r.sourceType + ":" + r.sourceId === key)
      )
    ),
    [bulk, setBulk] = useState("tags"),
    [bulkDirty, setBulkDirty] = useState(false),
    filterForm = useRef<HTMLFormElement>(null);
  const params = new URLSearchParams(
    Object.entries(data.filters).flatMap(([k, v]) =>
      v === defaultAdminFilters[k as keyof AdminQueueFilters]
        ? []
        : [[k, v === true ? "1" : String(v)]]
    )
  );
  if (continuation) params.set("after", continuation);
  if (selection.length) params.set("selected", selection.join(","));
  const back = "/platform/admin/requests" + (params.size ? "?" + params : "");
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (id && /^[A-Za-z0-9_-]+$/.test(id)) {
      const target =
        document.getElementById(id) ??
        document.querySelector<HTMLElement>('a[id^="request-"]') ??
        document.querySelector<HTMLElement>("[data-admin-request-list-title]");
      target?.focus();
    }
  }, [data]);
  const choices = (values: Record<string, string>) =>
    Object.entries(values).map(([value, label]) => (
      <option key={value} value={value}>
        {label}
      </option>
    ));
  const filter = (
    name: keyof AdminQueueFilters,
    label: string,
    values: Record<string, string>
  ) => (
    <label className="block text-sm font-semibold">
      {label}
      <select
        className={adminInputClass}
        name={name}
        defaultValue={String(data.filters[name])}
      >
        {choices(values)}
      </select>
    </label>
  );
  const selected = data.rows.filter((r) =>
    selection.includes(r.sourceType + ":" + r.sourceId)
  );
  return (
    <div className="space-y-6">
      <form
        ref={filterForm}
        action="/platform/admin/requests"
        className="space-y-4"
        aria-label="Filter requests"
      >
        <label className="block font-semibold">
          Search authorized titles or references
          <input
            className={adminInputClass}
            name="q"
            maxLength={100}
            defaultValue={data.filters.q}
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {filter("type", "Type", {
            ALL: "All types",
            ...adminSourceTypes,
            BUG: "Bug reports",
            SUGGESTION: "Suggestions",
            FEEDBACK: "Website feedback"
          })}
          {filter("state", "State", adminQueueStates)}
          {filter("priority", "Priority", {
            ALL: "All priorities",
            ...adminPriorities
          })}
          {filter("owner", "Owner", {
            ALL: "Any owner",
            ME: "Assigned to me",
            UNASSIGNED: "Unassigned"
          })}
        </div>
        <details
          className="rounded-xl border border-gc-divider p-4"
          open={
            data.filters.age !== "ALL" ||
            !!data.filters.churchId ||
            !!data.filters.topicId ||
            !!data.filters.tag ||
            data.filters.due
          }
        >
          <summary className="min-h-11 cursor-pointer font-semibold">
            More filters
          </summary>
          <div className="grid gap-4 sm:grid-cols-2">
            {filter("age", "Age", {
              ALL: "Any age",
              1: "At least one day",
              7: "At least one week",
              30: "At least thirty days"
            })}
            {filter("churchId", "Church", {
              "": "Any permitted church",
              ...Object.fromEntries(
                data.navigation.churches.map((c) => [c.id, c.name])
              )
            })}
            {filter("topicId", "Topic", {
              "": "Any permitted topic",
              ...Object.fromEntries(
                data.navigation.topics.map((c) => [c.id, c.name])
              )
            })}
            <label className="block text-sm font-semibold">
              Internal tag
              <input
                className={adminInputClass}
                name="tag"
                maxLength={30}
                defaultValue={data.filters.tag}
              />
            </label>
            <label className="flex min-h-11 items-center gap-3">
              <input
                type="checkbox"
                className="h-5 w-5"
                name="due"
                value="1"
                defaultChecked={data.filters.due}
              />
              Reminder due
            </label>
          </div>
        </details>
        <div className="flex flex-wrap gap-3">
          <button className="gc-button">Apply filters</button>
          <Link
            className="gc-button gc-button-quiet"
            href="/platform/admin/requests"
          >
            Clear filters
          </Link>
        </div>
      </form>
      <details className="rounded-xl border border-gc-divider p-4">
        <summary className="min-h-11 cursor-pointer font-semibold">
          My saved views
        </summary>
        <div className="space-y-4">
          {data.savedViews.map((view) => (
            <div key={view.id} className="flex flex-wrap items-center gap-3">
              <Link
                className="text-gc-accent underline"
                href={
                  "/platform/admin/requests?" +
                  new URLSearchParams(
                    Object.entries(view.filters).map(([k, v]) => [
                      k,
                      v === true ? "1" : v === false ? "0" : String(v)
                    ])
                  )
                }
              >
                {view.name}
              </Link>
              <AdminForm
                owner={data.navigation.viewer.id}
                operation="delete-view"
                fixed={{ id: view.id, expectedVersion: view.version }}
                button={`Remove ${view.name}`}
                onSaved={onRefresh}
              />
            </div>
          ))}
          <AdminForm
            owner={data.navigation.viewer.id}
            operation="save-view"
            fixed={{ filters: data.filters }}
            fields={[
              {
                name: "name",
                label: "Name for these applied filters",
                max: 60,
                min: 1
              }
            ]}
            button="Save private view"
            onSaved={onRefresh}
          />
        </div>
      </details>
      <p className="text-sm text-gc-muted">
        Newest received first. Each source keeps its own state. Counts and rows
        use your current access; no response time is promised.
      </p>
      {data.rows.length === 0 ? (
        <p className="rounded-xl border border-gc-divider p-5">
          No requests match these filters within your current access.
        </p>
      ) : (
        <ul className="space-y-3" aria-label="Requests">
          {data.rows.map((row) => {
            const key = row.sourceType + ":" + row.sourceId,
              dom = "request-" + row.sourceId;
            return (
              <li
                key={key}
                className="bg-gc-panel rounded-xl border border-gc-divider p-4"
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-1 h-5 w-5 shrink-0"
                    checked={selection.includes(key)}
                    aria-label={`Select ${row.title}`}
                    disabled={
                      bulkDirty ||
                      (!selection.includes(key) && selection.length >= 10)
                    }
                    onChange={(e) =>
                      setSelection((old) =>
                        e.target.checked
                          ? [...old, key]
                          : old.filter((v) => v !== key)
                      )
                    }
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap gap-2 text-xs text-gc-muted">
                      <span>{adminSourceTypes[row.sourceType]}</span>
                      <span>
                        {row.nativeStatus.replaceAll("_", " ").toLowerCase()}
                      </span>
                      <span>{adminPriorities[row.priority]} priority</span>
                    </div>
                    <Link
                      id={dom}
                      className="my-2 block break-words text-lg font-semibold text-gc-accent underline"
                      href={
                        row.canRead
                          ? adminCaseHref(
                              row.sourceType,
                              row.sourceId,
                              back + "#" + dom
                            )
                          : "/platform/help/routing"
                      }
                    >
                      {row.title}
                    </Link>
                    <p className="text-sm text-gc-muted">
                      {row.ownerName
                        ? `Owner: ${row.ownerName}`
                        : "Awaiting assignment"}{" "}
                      · Received {new Date(row.createdAt).toLocaleDateString()}{" "}
                      ·{" "}
                      {Math.max(
                        0,
                        Math.floor(
                          (Date.parse(data.asOf) - Date.parse(row.createdAt)) /
                            86400000
                        )
                      )}{" "}
                      days old
                    </p>
                    {row.nextAction && (
                      <p className="mt-2 break-words text-sm">
                        Next: {row.nextAction}
                      </p>
                    )}
                    {row.tags.length > 0 && (
                      <p className="mt-2 break-words text-xs text-gc-muted">
                        {row.tags.join(" · ")}
                      </p>
                    )}
                    <p className="mt-2 break-all text-xs text-gc-muted">
                      Reference {row.sourceId}
                    </p>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {data.next && (
        <Link
          className="gc-button gc-button-quiet"
          href={
            "/platform/admin/requests?" +
            new URLSearchParams({
              ...Object.fromEntries(params),
              after: data.next
            })
          }
        >
          Next requests
        </Link>
      )}
      {selected.length > 0 && (
        <section
          className="space-y-4 rounded-xl border border-gc-action p-4"
          aria-labelledby="admin-bulk"
        >
          <h2 id="admin-bulk" className="text-xl font-semibold">
            Update {selected.length} selected requests
          </h2>
          <p className="text-sm text-gc-muted">
            Each row can succeed or fail independently. Review its result before
            changing the selection.
          </p>
          <label className="block font-semibold">
            Action
            <select
              className={adminInputClass}
              value={bulk}
              disabled={bulkDirty}
              onChange={(event) => setBulk(event.target.value)}
            >
              <option value="tags">Replace internal tags</option>
              <option value="assign">Assign report or church reviewer</option>
              <option value="status">Update native status</option>
            </select>
          </label>
          <AdminForm
            key={bulk}
            onDraftChange={setBulkDirty}
            owner={data.navigation.viewer.id}
            operation="bulk"
            fixed={{
              action: bulk,
              rows: selected.map((r) => ({
                sourceType: r.sourceType,
                sourceId: r.sourceId,
                expectedVersion: r.version
              }))
            }}
            fields={
              bulk === "tags"
                ? [
                    {
                      name: "tags",
                      type: "tags",
                      label: "Internal tags, separated by commas",
                      max: 247,
                      optional: true
                    }
                  ]
                : bulk === "assign"
                  ? [
                      {
                        name: "username",
                        label:
                          "Exact current reviewer username; blank clears the assignment",
                        max: 40,
                        optional: true
                      }
                    ]
                  : [
                      {
                        name: "status",
                        type: "select",
                        label: "Native status",
                        options: choicesForStatuses
                      },
                      {
                        name: "reason",
                        type: "textarea",
                        label: "Reason for the change",
                        max: 1000,
                        min: 5
                      }
                    ]
            }
            button="Apply to selected requests"
            caution={
              bulk === "assign"
                ? "Ordinary support uses its disclosed owner handoff on the case. A reviewer assignment never grants permission."
                : "Church approval, account restrictions and permanent deletion require their individual authorized workflows."
            }
            onSaved={onRefresh}
          />
        </section>
      )}
    </div>
  );
}
const choicesForStatuses = [
  { value: "IN_PROGRESS", label: "Support: In progress" },
  { value: "WAITING_FOR_REQUESTER", label: "Support: Waiting for requester" },
  { value: "RESOLVED", label: "Support: Resolved" },
  { value: "RECEIVED", label: "Support: Reopen" },
  { value: "CLOSED", label: "Support or report: Closed" },
  { value: "FOLLOW_UP_REQUIRED", label: "Report: Further review required" }
];
