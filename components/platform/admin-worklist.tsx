"use client";
import { RegionalTime } from "@/components/platform/regional-presentation";
import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import {
  adminPriorities,
  adminQueueStates,
  adminSourceTypes,
  defaultAdminFilters,
  type AdminQueueFilters,
  type AdminQueueSnapshot
} from "@/lib/platform/admin-types";
import { AdminForm, adminInputClass } from "./admin-form";
import { useReadVisibility } from "./read-visibility";
type SelectedRequest = Pick<
  AdminQueueSnapshot["rows"][number],
  "sourceType" | "sourceId" | "version"
>;
const requestKey = (row: SelectedRequest) =>
  row.sourceType + ":" + row.sourceId;
function SavedViewRemoval({
  id,
  view,
  owner,
  visible,
  currentAccess,
  onRefresh,
  onDraftChange
}: {
  id: string;
  view?: AdminQueueSnapshot["savedViews"][number];
  owner: string;
  visible: boolean;
  currentAccess: boolean;
  onRefresh: () => void;
  onDraftChange: (id: string, dirty: boolean) => void;
}) {
  const changed = useCallback(
    (dirty: boolean) => onDraftChange(id, dirty),
    [id, onDraftChange]
  );
  return (
    <div className={visible ? "flex flex-wrap items-center gap-3" : undefined}>
      {visible && currentAccess && view && (
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
      )}
      {visible && currentAccess && !view && (
        <p>
          This saved view is no longer in your current list. Confirm the
          original action or discard its local retry.
        </p>
      )}
      <AdminForm
        owner={owner}
        operation="delete-view"
        fixed={{ id, expectedVersion: view?.version ?? 0 }}
        button={view ? `Remove ${view.name}` : "Confirm removed saved view"}
        available={!!view && currentAccess}
        privacy={{ visible, currentAccess }}
        onDraftChange={changed}
        onSaved={onRefresh}
      />
    </div>
  );
}
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
  const visible = useReadVisibility();
  const [selection, setSelection] = useState<SelectedRequest[]>(() =>
      [...new Set(initialSelection)]
        .flatMap((key) => {
          const row = data.rows.find((r) => requestKey(r) === key);
          return row
            ? [
                {
                  sourceType: row.sourceType,
                  sourceId: row.sourceId,
                  version: row.version
                }
              ]
            : [];
        })
        .slice(0, 10)
    ),
    [bulk, setBulk] = useState("tags"),
    [bulkDirty, setBulkDirty] = useState(false),
    [saveDirty, setSaveDirty] = useState(false),
    [removingIds, setRemovingIds] = useState<string[]>([]),
    [filters, setFilters] = useState(data.filters),
    [moreOpen, setMoreOpen] = useState(
      data.filters.age !== "ALL" ||
        !!data.filters.churchId ||
        !!data.filters.topicId ||
        !!data.filters.tag ||
        data.filters.due
    ),
    [viewsOpen, setViewsOpen] = useState(false);
  const appliedFilters = JSON.stringify(data.filters);
  useLayoutEffect(() => {
    setFilters(JSON.parse(appliedFilters));
  }, [appliedFilters]);
  useEffect(() => {
    // Keep ordered identities and last known versions even when a refreshed
    // queue excludes rows changed by an unconfirmed bulk command.
    setSelection((old) => {
      const next = old.map((row) => {
        const current = data.rows.find(
          (r) => requestKey(r) === requestKey(row)
        );
        return current && current.version !== row.version
          ? { ...row, version: current.version }
          : row;
      });
      return next.some((row, i) => row !== old[i]) ? next : old;
    });
  }, [data.rows]);
  const removalChanged = useCallback((id: string, dirty: boolean) => {
    setRemovingIds((old) =>
      old.includes(id) === dirty
        ? old
        : dirty
          ? [...old, id]
          : old.filter((value) => value !== id)
    );
  }, []);
  const canQueue = data.navigation.sections.some(
      (section) => section.key === "requests"
    ),
    present = visible && canQueue,
    work = bulkDirty || saveDirty || removingIds.length > 0,
    selectionKeys = selection.map(requestKey),
    missingSelection = selection.some(
      (row) =>
        !data.rows.some((current) => requestKey(current) === requestKey(row))
    ),
    unavailableFilter =
      (!!filters.churchId &&
        !data.navigation.churches.some((c) => c.id === filters.churchId)) ||
      (!!filters.topicId &&
        !data.navigation.topics.some((t) => t.id === filters.topicId)),
    viewIds = [
      ...new Set([...data.savedViews.map((view) => view.id), ...removingIds])
    ];
  const params = new URLSearchParams(
    Object.entries(data.filters).flatMap(([k, v]) =>
      v === defaultAdminFilters[k as keyof AdminQueueFilters]
        ? []
        : [[k, v === true ? "1" : String(v)]]
    )
  );
  if (continuation) params.set("after", continuation);
  if (selection.length) params.set("selected", selectionKeys.join(","));
  const back = "/platform/admin/requests" + (params.size ? "?" + params : "");
  useEffect(() => {
    if (!present) return;
    const id = window.location.hash.slice(1);
    if (id && /^[A-Za-z0-9_-]+$/.test(id)) {
      const target =
        document.getElementById(id) ??
        document.querySelector<HTMLElement>('a[id^="request-"]') ??
        document.querySelector<HTMLElement>("[data-admin-request-list-title]");
      target?.focus();
    }
  }, [data, present]);
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
        value={String(filters[name])}
        onChange={(event) =>
          setFilters((old) => ({ ...old, [name]: event.target.value }))
        }
      >
        {!Object.hasOwn(values, String(filters[name])) && (
          <option value={String(filters[name])} disabled>
            Previous selection is no longer available
          </option>
        )}
        {choices(values)}
      </select>
    </label>
  );
  return (
    <div className="space-y-6">
      {present && (
        <form
          action="/platform/admin/requests"
          className="space-y-4"
          aria-label="Filter requests"
          onSubmit={(event) => {
            if (work || unavailableFilter) event.preventDefault();
          }}
        >
          <fieldset className="min-w-0 space-y-4" disabled={work}>
            <label className="block font-semibold">
              Search authorized titles or references
              <input
                className={adminInputClass}
                name="q"
                maxLength={100}
                value={filters.q}
                onChange={(event) =>
                  setFilters((old) => ({ ...old, q: event.target.value }))
                }
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
              open={moreOpen}
              onToggle={(event) => setMoreOpen(event.currentTarget.open)}
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
                    value={filters.tag}
                    onChange={(event) =>
                      setFilters((old) => ({ ...old, tag: event.target.value }))
                    }
                  />
                </label>
                <label className="flex min-h-11 items-center gap-3">
                  <input
                    type="checkbox"
                    className="h-5 w-5"
                    name="due"
                    value="1"
                    checked={filters.due}
                    onChange={(event) =>
                      setFilters((old) => ({
                        ...old,
                        due: event.target.checked
                      }))
                    }
                  />
                  Reminder due
                </label>
              </div>
            </details>
            <div className="flex flex-wrap gap-3">
              <button className="gc-button" disabled={unavailableFilter}>
                Apply filters
              </button>
              <Link
                className="gc-button gc-button-quiet"
                href="/platform/admin/requests"
              >
                Clear filters
              </Link>
            </div>
          </fieldset>
          {work && (
            <p>
              Save, retry or discard unfinished request actions before changing
              filters.
            </p>
          )}
          {unavailableFilter && (
            <p>
              Choose a current church or topic before applying these filters.
            </p>
          )}
        </form>
      )}
      <details
        className={
          present ? "rounded-xl border border-gc-divider p-4" : undefined
        }
        open={viewsOpen}
        onToggle={(event) => setViewsOpen(event.currentTarget.open)}
      >
        {present && (
          <summary className="min-h-11 cursor-pointer font-semibold">
            My saved views
          </summary>
        )}
        <div className={present ? "space-y-4" : undefined}>
          {viewIds.map((id) => (
            <SavedViewRemoval
              key={id}
              id={id}
              view={data.savedViews.find((view) => view.id === id)}
              owner={data.navigation.viewer.id}
              visible={visible}
              currentAccess={canQueue}
              onRefresh={onRefresh}
              onDraftChange={removalChanged}
            />
          ))}
          <AdminForm
            owner={data.navigation.viewer.id}
            operation="save-view"
            privacy={{ visible, currentAccess: canQueue }}
            onDraftChange={setSaveDirty}
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
      {present && (
        <>
          <p className="text-sm text-gc-muted">
            Newest received first. Each source keeps its own state. Counts and
            rows use your current access; no response time is promised.
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
                        checked={selectionKeys.includes(key)}
                        aria-label={`Select ${row.title}`}
                        disabled={
                          bulkDirty ||
                          (!selectionKeys.includes(key) &&
                            selection.length >= 10)
                        }
                        onChange={(e) =>
                          setSelection((old) =>
                            e.target.checked
                              ? [
                                  ...old,
                                  {
                                    sourceType: row.sourceType,
                                    sourceId: row.sourceId,
                                    version: row.version
                                  }
                                ]
                              : old.filter((v) => requestKey(v) !== key)
                          )
                        }
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap gap-2 text-xs text-gc-muted">
                          <span>{adminSourceTypes[row.sourceType]}</span>
                          <span>
                            {row.nativeStatus
                              .replaceAll("_", " ")
                              .toLowerCase()}
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
                          · Received{" "}
                          {<RegionalTime value={row.createdAt} dateOnly />} ·{" "}
                          {Math.max(
                            0,
                            Math.floor(
                              (Date.parse(data.asOf) -
                                Date.parse(row.createdAt)) /
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
        </>
      )}
      <section
        className={
          present && (selection.length > 0 || bulkDirty)
            ? "space-y-4 rounded-xl border border-gc-action p-4"
            : undefined
        }
        aria-labelledby={
          present && (selection.length > 0 || bulkDirty)
            ? "admin-bulk"
            : undefined
        }
      >
        {present && (selection.length > 0 || bulkDirty) && (
          <>
            <h2 id="admin-bulk" className="text-xl font-semibold">
              Update {selection.length} selected requests
            </h2>
            <p className="text-sm text-gc-muted">
              Each row can succeed or fail independently. Review its result
              before changing the selection.
            </p>
            {missingSelection && (
              <p>
                Some selected requests are no longer in this queue. Confirm or
                discard the original action, then clear the selection before
                choosing a new batch.
              </p>
            )}
            <button
              type="button"
              className="gc-button gc-button-quiet"
              disabled={bulkDirty}
              onClick={() => setSelection([])}
            >
              Clear selected requests
            </button>
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
          </>
        )}
        <AdminForm
          key={bulk}
          onDraftChange={setBulkDirty}
          owner={data.navigation.viewer.id}
          operation="bulk"
          privacy={{
            visible: visible && (selection.length > 0 || bulkDirty),
            currentAccess: canQueue
          }}
          available={selection.length > 0 && !missingSelection && canQueue}
          fixed={{
            action: bulk,
            rows: selection.map((r) => ({
              sourceType: r.sourceType,
              sourceId: r.sourceId,
              expectedVersion:
                data.rows.find(
                  (current) => requestKey(current) === requestKey(r)
                )?.version ?? r.version
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
