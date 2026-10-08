"use client";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { socialRequest, SocialClientError } from "@/lib/platform/social-client";
import { accountEntryHref } from "@/lib/platform/account-entry";
import { portalInputClass } from "./portal-action-form";
import { useUnsavedSocialWork } from "./use-unsaved-social-work";
import {
  dutyTemplateEndpoint,
  useDutyTemplateRead,
  type DutyTemplateFields,
  type DutyTemplateList
} from "./volunteer-duty-template-picker";

type Workspace = { ownerId: string; churches: { id: string; name: string }[] };
type Detail = {
  ownerId: string;
  churchId: string;
  template: DutyTemplateFields & {
    id: string;
    version: number;
    updatedAt: string;
  };
};
const empty: DutyTemplateFields = {
  title: "",
  duties: "",
  requirements: "",
  commitment: ""
};
const describe = (template: DutyTemplateFields): DutyTemplateFields => ({
  title: template.title,
  duties: template.duties,
  requirements: template.requirements,
  commitment: template.commitment
});

export function VolunteerDutyTemplates({ owner }: { owner: string | null }) {
  const originalOwner = useRef(owner),
    formId = useId();
  const [churchId, setChurchId] = useState(""),
    [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftId, setDraftId] = useState(""),
    [version, setVersion] = useState(0);
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [fields, setFields] = useState<DutyTemplateFields>(empty);
  const [baseline, setBaseline] = useState(JSON.stringify(empty));
  const [pending, setPending] = useState<string | null>(null),
    [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState(false),
    [message, setMessage] = useState("");
  const flight = useRef(false),
    resultRef = useRef<HTMLParagraphElement>(null);
  const focusEpoch = useRef<number | null>(null);
  const sameOwner = !!owner && owner === originalOwner.current;
  const workspace = useDutyTemplateRead<Workspace>(
    `${dutyTemplateEndpoint}?view=workspace`,
    originalOwner.current,
    sameOwner
  );
  const church = workspace.data?.churches.find((row) => row.id === churchId);
  const list = useDutyTemplateRead<DutyTemplateList>(
    church
      ? `${dutyTemplateEndpoint}?${new URLSearchParams({ view: "list", churchId, page: String(page) })}`
      : null,
    originalOwner.current,
    sameOwner && !!church
  );
  const detail = useDutyTemplateRead<Detail>(
    church && selectedId
      ? `${dutyTemplateEndpoint}?${new URLSearchParams({ view: "detail", churchId, id: selectedId })}`
      : null,
    originalOwner.current,
    sameOwner && !!church && !!selectedId
  );
  const currentList =
    list.data?.churchId === churchId && list.data.page === page
      ? list.data
      : null;
  const currentDetail =
    detail.data?.churchId === churchId && detail.data.template.id === selectedId
      ? detail.data.template
      : null;
  const visible =
    sameOwner &&
    !!workspace.data &&
    !!church &&
    !!currentList &&
    (!selectedId || (!!currentDetail && loadedId === selectedId));
  const dirty = JSON.stringify(fields) !== baseline;
  const changed =
    conflict ||
    !!(
      currentDetail &&
      loadedId === selectedId &&
      currentDetail.version !== version
    );
  const locked = busy || !!pending;
  const latest = useRef({ visible, sameOwner });
  latest.current = { visible, sameOwner };
  useUnsavedSocialWork(
    { dirty, saving: locked, conflict: changed },
    () =>
      setMessage(
        "Save or discard your unsent template changes before leaving."
      ),
    true
  );
  useEffect(() => {
    if (!churchId && workspace.data?.churches.length === 1)
      setChurchId(workspace.data.churches[0].id);
  }, [churchId, workspace.data]);
  const load = (template?: Detail["template"]) => {
    const next = template ? describe(template) : empty;
    setFields(next);
    setBaseline(JSON.stringify(next));
    setVersion(template?.version ?? 0);
    setLoadedId(template?.id ?? null);
    setDraftId(template?.id ?? "");
    setConflict(false);
  };
  useEffect(() => {
    if (currentDetail && loadedId !== currentDetail.id && !pending)
      load(currentDetail);
  }, [currentDetail, loadedId, pending]);
  useEffect(() => {
    if (focusEpoch.current === null) return;
    if (focusEpoch.current !== workspace.epoch.current || !sameOwner) {
      focusEpoch.current = null;
      return;
    }
    if (
      !visible ||
      busy ||
      !document.hasFocus() ||
      document.visibilityState === "hidden" ||
      !navigator.onLine
    )
      return;
    focusEpoch.current = null;
    resultRef.current?.focus();
  }, [message, visible, busy, sameOwner, workspace.epoch]);
  const canLeaveDraft = () =>
    !locked &&
    (!dirty ||
      window.confirm("Discard unsent template changes before switching?"));
  const newTemplate = () => {
    if (!canLeaveDraft()) return;
    setSelectedId(null);
    load();
    setMessage("");
  };
  const conceal = () => {
    workspace.conceal();
    list.conceal();
    detail.conceal();
  };
  const check = () => {
    workspace.reload();
    list.reload();
    detail.reload();
  };
  const send = async (body: string) => {
    if (
      flight.current ||
      !latest.current.sameOwner ||
      !workspace.access.current ||
      !list.access.current
    )
      return;
    flight.current = true;
    setBusy(true);
    setPending(body);
    setMessage("");
    focusEpoch.current = workspace.epoch.current;
    try {
      const { data } = await socialRequest<{
        id: string;
        version: number;
        message: string;
      }>(dutyTemplateEndpoint, body, originalOwner.current!);
      const request = JSON.parse(body) as { id: string; operation: string };
      if (
        data.id !== request.id ||
        !Number.isSafeInteger(data.version) ||
        typeof data.message !== "string"
      )
        throw new Error(
          "The response could not be confirmed. Confirm the original template request."
        );
      setPending(null);
      setConflict(false);
      setMessage(data.message);
      if (request.operation === "remove") {
        setSelectedId(null);
        load();
      } else {
        setVersion(data.version);
        setSelectedId(data.id);
        setLoadedId(null);
        setBaseline(JSON.stringify(fields));
      }
      list.reload();
      detail.reload();
    } catch (cause) {
      setMessage(
        cause instanceof Error
          ? cause.message
          : "The reply was lost. Confirm the original template request."
      );
      if (cause instanceof SocialClientError) {
        if ([400, 409, 413, 429].includes(cause.status)) setPending(null);
        if (cause.status === 409) {
          setConflict(true);
          detail.reload();
          list.reload();
        }
        if ([401, 403, 404].includes(cause.status)) conceal();
        if (
          [403, 404].includes(cause.status) &&
          !cause.needsAuthenticator &&
          latest.current.sameOwner
        )
          setPending(null);
      }
    } finally {
      flight.current = false;
      setBusy(false);
    }
  };
  const command = (operation: "save" | "remove") => {
    if (locked || !visible || changed) return;
    const id = selectedId ?? (draftId || crypto.randomUUID());
    setDraftId(id);
    const body = JSON.stringify({
      operation,
      id,
      churchId,
      expectedVersion: version,
      mutationId: crypto.randomUUID(),
      ...(operation === "save" ? fields : {})
    });
    if (new TextEncoder().encode(body).byteLength > 32768) {
      focusEpoch.current = workspace.epoch.current;
      setMessage(
        "These template entries are too large. Shorten them and save again. Your unsent changes are retained."
      );
      return;
    }
    void send(body);
  };
  return (
    <section className="space-y-5">
      <h1 className="text-3xl font-semibold">Ordinary duty templates</h1>
      <p>
        Save reusable descriptions for your church&apos;s ordinary volunteer
        duties. A template only prepares an opportunity draft. Leadership
        training, screening and appointments require their separate approved
        processes.
      </p>
      <Link
        prefetch={false}
        className="inline-flex min-h-11 items-center underline"
        href="/platform/serve"
      >
        Browse volunteer opportunities
      </Link>
      {!owner && (
        <p>
          <Link
            className="underline"
            href={accountEntryHref("login", "/platform/serve/templates")}
          >
            Sign in to manage duty templates
          </Link>
        </p>
      )}
      {!workspace.data || !sameOwner ? (
        <div className="space-y-3 rounded-xl border p-4">
          <p role="status">
            {!sameOwner && originalOwner.current
              ? "Return to the original account to continue. Your local template entries and any original request are retained."
              : workspace.error ||
                "Checking current template access. Your unsent entries are retained."}
          </p>
          <button
            type="button"
            className="gc-button gc-button-quiet"
            onClick={check}
          >
            Check template access
          </button>
        </div>
      ) : (
        <>
          {!workspace.data.churches.length ? (
            <p>
              No churches are currently available for you to coordinate
              volunteer templates.
            </p>
          ) : (
            <label className="block space-y-2" htmlFor={`${formId}-church`}>
              <span>Church</span>
              <select
                id={`${formId}-church`}
                className={portalInputClass}
                value={churchId}
                disabled={locked}
                onChange={(event) => {
                  if (!canLeaveDraft()) return;
                  setChurchId(event.target.value);
                  setPage(0);
                  setSelectedId(null);
                  load();
                  setMessage("");
                }}
              >
                <option value="">Choose a church</option>
                {workspace.data.churches.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {church && (
            <>
              {!currentList ? (
                <p role="status">
                  {list.error || "Checking this church's templates…"}
                </p>
              ) : (
                <section
                  aria-label="Saved duty templates"
                  className="space-y-3"
                >
                  <h2 className="text-xl font-semibold">
                    Saved duty templates
                  </h2>
                  <p>
                    {currentList.total} saved{" "}
                    {currentList.total === 1 ? "template" : "templates"}. Up to
                    200 active templates per church.
                  </p>
                  <button
                    type="button"
                    className="gc-button gc-button-quiet"
                    disabled={locked}
                    onClick={newTemplate}
                  >
                    New duty template
                  </button>
                  <ul className="space-y-2">
                    {currentList.templates.map((template) => (
                      <li key={template.id}>
                        <button
                          type="button"
                          className="gc-button gc-button-quiet max-w-full whitespace-normal break-words"
                          disabled={locked}
                          onClick={() => {
                            if (!canLeaveDraft()) return;
                            setSelectedId(template.id);
                            setLoadedId(null);
                            setMessage("");
                          }}
                        >{`Edit ${template.title}`}</button>
                      </li>
                    ))}
                  </ul>
                  <div className="flex flex-wrap gap-3">
                    {page > 0 && (
                      <button
                        type="button"
                        className="gc-button gc-button-quiet"
                        disabled={locked}
                        onClick={() => setPage(page - 1)}
                      >
                        Previous templates
                      </button>
                    )}
                    {(page + 1) * 20 < currentList.total && (
                      <button
                        type="button"
                        className="gc-button gc-button-quiet"
                        disabled={locked}
                        onClick={() => setPage(page + 1)}
                      >
                        Next templates
                      </button>
                    )}
                  </div>
                </section>
              )}
              {!visible ? (
                <div className="space-y-3 rounded-xl border p-4">
                  <p role="status">
                    {detail.error ||
                      list.error ||
                      "Checking current template details. Your local entries are retained."}
                  </p>
                  <button
                    type="button"
                    className="gc-button gc-button-quiet"
                    onClick={check}
                  >
                    Check template access
                  </button>
                </div>
              ) : (
                <form
                  aria-label="Duty template editor"
                  className="space-y-4 rounded-xl border p-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    command("save");
                  }}
                >
                  <h2 className="text-xl font-semibold">
                    {selectedId ? "Edit duty template" : "New duty template"}
                  </h2>
                  <p id={`${formId}-help`}>
                    Use descriptions of the duty only. Do not enter applicant or
                    assignment details, personal contact information, screening
                    records or authority grants.
                  </p>
                  {changed && (
                    <p role="status">
                      This template changed. Your unsent edits are retained.
                      Discard them to load the current saved version before
                      saving again.
                    </p>
                  )}
                  <fieldset disabled={locked} className="space-y-4">
                    <legend className="sr-only">Template descriptions</legend>
                    {(
                      [
                        ["title", "Template title", 100, 2],
                        ["duties", "Purpose and duties", 2000, 3],
                        ["requirements", "Requirements", 1000, 0],
                        ["commitment", "Commitment", 300, 0]
                      ] as const
                    ).map(([key, label, max, min]) => (
                      <label
                        key={key}
                        className="block space-y-2"
                        htmlFor={`${formId}-${key}`}
                      >
                        <span>{label}</span>
                        <textarea
                          id={`${formId}-${key}`}
                          className={portalInputClass}
                          rows={key === "duties" ? 4 : 2}
                          maxLength={max}
                          minLength={min || undefined}
                          required={min > 0}
                          aria-describedby={`${formId}-help`}
                          value={fields[key]}
                          onChange={(event) =>
                            setFields({ ...fields, [key]: event.target.value })
                          }
                        />
                      </label>
                    ))}
                    <div className="flex flex-wrap gap-3">
                      <button
                        type="submit"
                        className="gc-button"
                        disabled={changed}
                      >
                        Save duty template
                      </button>
                      <button
                        type="button"
                        className="gc-button gc-button-quiet"
                        onClick={() => {
                          load(currentDetail ?? undefined);
                          setMessage("Unsent template changes discarded.");
                        }}
                      >
                        Discard unsent template changes
                      </button>
                      {selectedId && (
                        <button
                          type="button"
                          className="gc-button gc-button-quiet"
                          disabled={changed}
                          onClick={() => {
                            if (
                              window.confirm(
                                "Remove this duty template and clear its stored descriptions? Existing opportunities and unsaved opportunity drafts are unchanged."
                              )
                            )
                              command("remove");
                          }}
                        >
                          Remove duty template
                        </button>
                      )}
                    </div>
                  </fieldset>
                  <p ref={resultRef} tabIndex={-1} role="status">
                    {message}
                  </p>
                </form>
              )}
              {pending && currentList && (
                <button
                  type="button"
                  className="gc-button"
                  disabled={busy}
                  onClick={() => void send(pending)}
                >
                  {busy
                    ? "Confirming template request…"
                    : "Confirm original template request"}
                </button>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
