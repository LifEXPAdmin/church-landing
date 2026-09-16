"use client";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type {
  exchangeEditorContext,
  readExchangeListing
} from "@/lib/platform/exchange-listings";
import {
  emptyExchangeFields,
  EXCHANGE_EDITOR_SCHEMA,
  EXCHANGE_ITEM_POLICY,
  exchangeStateLabels,
  exchangeIntentLabels,
  exchangeCategoryLabels,
  exchangeConditionLabels,
  exchangeServicePricingLabels,
  exchangeServiceUnitLabels,
  type ExchangeEditorFields as Fields,
  type ExchangeState
} from "@/lib/platform/exchange-options";
import {
  currentSocialOwner,
  socialRequest,
  SocialClientError
} from "@/lib/platform/social-client";
import { ExchangeEditorFields } from "./exchange-editor-fields";
import { ExchangePhotos } from "./exchange-photos";
import { ReadVisibility } from "./read-visibility";
import { useUnsavedSocialWork } from "./use-unsaved-social-work";
import { settlePhotoNavigation } from "./use-photo-back-guard";
import { portalInputClass } from "./portal-action-form";

type Context = Awaited<ReturnType<typeof exchangeEditorContext>>;
type Snapshot = Awaited<ReturnType<typeof readExchangeListing>>;
type Pending = { body: string; path: string; method: "POST" | "DELETE" };
const fieldChoiceLabels: Partial<Record<keyof Fields, Record<string, string>>> =
  {
    intent: exchangeIntentLabels,
    category: exchangeCategoryLabels,
    condition: exchangeConditionLabels,
    servicePricing: exchangeServicePricingLabels,
    serviceUnit: exchangeServiceUnitLabels,
    audience: { PUBLIC: "Public", CHURCH: "Approved church" }
  };
const sameFields = (a: Fields, b: Fields) =>
  (Object.keys(a) as (keyof Fields)[]).every((key) => a[key] === b[key]);
const nextStates: Record<ExchangeState, readonly ExchangeState[]> = {
  DRAFT: ["ACTIVE", "ARCHIVED"],
  ACTIVE: ["RESERVED", "CLOSED", "ARCHIVED"],
  RESERVED: ["ACTIVE", "CLOSED", "ARCHIVED"],
  CLOSED: ["ACTIVE", "ARCHIVED"],
  ARCHIVED: ["DRAFT"]
};
const actionLabel = (state: ExchangeState) =>
  state === "ACTIVE"
    ? "Publish as active"
    : state === "DRAFT"
      ? "Reopen as private draft"
      : state === "ARCHIVED"
        ? "Archive listing"
        : `Mark ${exchangeStateLabels[state].toLowerCase()}`;

export function ExchangeEditor({
  access,
  initial = null
}: {
  access: Context;
  initial?: Snapshot | null;
}) {
  const fieldId = useId();
  const router = useRouter(),
    owner = access.ownerId;
  const [context, setContext] = useState(access),
    [record, setRecord] = useState(initial);
  const [fields, setFields] = useState(
    initial?.fields ?? emptyExchangeFields()
  );
  const [ownerChurchId, setOwnerChurchId] = useState("");
  const [visible, setVisible] = useState(false),
    [changedAccount, setChangedAccount] = useState(false);
  const [busy, setBusy] = useState(false),
    [pending, setPending] = useState<Pending | null>(null);
  const [newer, setNewer] = useState<Snapshot | null>(null),
    [conflict, setConflict] = useState(false);
  const [notice, setNotice] = useState(""),
    [confirmed, setConfirmed] = useState(false);
  const [accessNotice, setAccessNotice] = useState(
    "Checking your current listing access…"
  );
  const [photoWork, setPhotoWork] = useState(false);
  const flight = useRef(false),
    generation = useRef(0),
    recordRef = useRef(record),
    changedRef = useRef(false);
  recordRef.current = record;
  const dirty =
    !sameFields(fields, record?.fields ?? emptyExchangeFields()) ||
    (!record && !!ownerChurchId);
  useUnsavedSocialWork(
    { dirty, saving: busy || !!pending, conflict },
    () =>
      setNotice(
        "Save, retry or discard your local listing entries before leaving."
      ),
    true
  );

  const clearAccount = useCallback(() => {
    changedRef.current = true;
    generation.current++;
    setChangedAccount(true);
    setVisible(false);
    setFields(emptyExchangeFields());
    setRecord(null);
    setNewer(null);
    setPending(null);
    setOwnerChurchId("");
    setConflict(false);
    setConfirmed(false);
    setAccessNotice(
      "Your sign-in changed. Private entries were cleared. Reload for your current account."
    );
  }, []);
  const check = useCallback(async () => {
    if (
      flight.current ||
      changedRef.current ||
      document.visibilityState === "hidden"
    )
      return;
    const seq = ++generation.current;
    try {
      const current = recordRef.current;
      const [ctx, saved] = await Promise.all([
        socialRequest<Context>(
          "/api/platform/exchange?view=context",
          undefined,
          owner
        ),
        current
          ? socialRequest<Snapshot>(
              `/api/platform/exchange?view=editor&id=${encodeURIComponent(current.listing.id)}`,
              undefined,
              owner
            )
          : Promise.resolve(null)
      ]);
      if (seq !== generation.current) return;
      setContext(ctx.data);
      setVisible(true);
      setAccessNotice("");
      if (!current) setConflict(false);
      if (saved && saved.data.listing.version !== current?.listing.version) {
        setNewer(saved.data);
        setConflict(true);
        setNotice(
          "The saved listing changed. Your local entries are retained. Review the current saved version below before another change."
        );
      }
    } catch (error) {
      if (seq !== generation.current) return;
      setVisible(false);
      setAccessNotice(
        error instanceof Error
          ? error.message
          : "Reconnect to check your listing access. Your entries remain here."
      );
      if (error instanceof SocialClientError && error.status === 401) {
        const actual = await currentSocialOwner().catch(() => undefined);
        if (
          seq === generation.current &&
          actual !== undefined &&
          actual !== owner
        )
          clearAccount();
      }
    }
  }, [owner, clearAccount]);
  useEffect(() => {
    const hide = () => {
      generation.current++;
      setVisible(false);
    };
    const resume = () => {
      void check();
    };
    const visibility = () =>
      document.visibilityState === "hidden" ? hide() : resume();
    resume();
    const timer = setInterval(resume, 30000);
    window.addEventListener("blur", hide);
    window.addEventListener("offline", hide);
    for (const event of [
      "focus",
      "online",
      "pageshow",
      "social-relationships-changed"
    ])
      window.addEventListener(event, resume);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      hide();
      clearInterval(timer);
      window.removeEventListener("blur", hide);
      window.removeEventListener("offline", hide);
      for (const event of [
        "focus",
        "online",
        "pageshow",
        "social-relationships-changed"
      ])
        window.removeEventListener(event, resume);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [check]);

  async function send(request: Pending) {
    if (flight.current || changedRef.current) return false;
    generation.current++;
    flight.current = true;
    setBusy(true);
    setPending(request);
    setNotice("");
    let receiptConfirmed = false;
    try {
      const result = await socialRequest<{
        id?: string;
        version?: number;
        message?: string;
        removed?: boolean;
      }>(request.path, request.body, owner, request.method);
      const removal = request.method === "DELETE";
      if (
        removal
          ? result.data.removed !== true
          : typeof result.data.id !== "string" ||
            !Number.isInteger(result.data.version) ||
            typeof result.data.message !== "string"
      )
        throw new SocialClientError(
          503,
          "The response could not be confirmed. Retry the same listing request."
        );
      receiptConfirmed = true;
      const id = removal ? recordRef.current!.listing.id : result.data.id!;
      const { data } = await socialRequest<Snapshot>(
        `/api/platform/exchange?view=editor&id=${encodeURIComponent(id)}`,
        undefined,
        owner
      );
      if (!data.fields)
        throw new SocialClientError(
          503,
          "The saved listing could not be checked. Retry the same request."
        );
      if (changedRef.current) return false;
      const navigate = id !== recordRef.current?.listing.id;
      flushSync(() => {
        setRecord(data);
        recordRef.current = data;
        setFields(data.fields!);
        setOwnerChurchId("");
        setNewer(null);
        setConflict(false);
        setPending(null);
        setBusy(false);
        setConfirmed(false);
        setVisible(true);
        setNotice(result.data.message ?? "Photo removed from the listing.");
      });
      if (navigate) {
        await settlePhotoNavigation();
        router.replace(`/platform/exchange/${encodeURIComponent(id)}/edit`);
      }
      return true;
    } catch (error) {
      if (
        !receiptConfirmed &&
        error instanceof SocialClientError &&
        !error.needsAuthenticator &&
        [400, 403, 404, 409, 429].includes(error.status)
      ) {
        setPending(null);
        if ([403, 404, 409].includes(error.status)) setConflict(true);
      }
      if (error instanceof SocialClientError && error.status === 401) {
        const actual = await currentSocialOwner().catch(() => undefined);
        if (actual !== undefined && actual !== owner) clearAccount();
        else setVisible(false);
      }
      setNotice(
        error instanceof Error
          ? error.message
          : "The response was lost. Keep your entries and retry the same request."
      );
      return false;
    } finally {
      flight.current = false;
      setBusy(false);
    }
  }
  async function command(input: Record<string, unknown>) {
    if (busy || pending || conflict || !visible) return false;
    return send({
      path: "/api/platform/exchange",
      method: "POST",
      body: JSON.stringify({
        ...input,
        expectedVersion: record?.listing.version ?? 0,
        mutationId: crypto.randomUUID(),
        ...(record ? { listingId: record.listing.id } : {})
      })
    });
  }
  async function photoSaved() {
    try {
      const current = recordRef.current!;
      const { data } = await socialRequest<Snapshot>(
        `/api/platform/exchange?view=editor&id=${encodeURIComponent(current.listing.id)}`,
        undefined,
        owner
      );
      if (changedRef.current) return;
      if (
        !data.fields ||
        !current.fields ||
        !sameFields(current.fields, data.fields) ||
        data.listing.state !== current.listing.state
      ) {
        setNewer(data);
        setConflict(true);
        setNotice(
          "The listing changed while saving a photo. Review its current saved entries."
        );
      } else {
        setRecord(data);
        recordRef.current = data;
      }
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Check the current listing after the upload."
      );
      setConflict(true);
    }
  }
  const disabled = busy || !!pending || conflict;
  const church = record?.listing.ownerChurch;
  const audienceChurches =
    church || ownerChurchId
      ? context.churches.filter((c) => c.id === (church?.id ?? ownerChurchId))
      : context.churches;
  const state = record?.listing.state;
  const canPublish = !church || context.managingChurchIds.includes(church.id);
  const policy = { itemPolicy: EXCHANGE_ITEM_POLICY, itemConfirmed: confirmed };
  return (
    <ReadVisibility.Provider value={visible}>
      <div className="space-y-5">
        <p role="status" aria-live="polite">
          {busy
            ? "Confirming this listing change…"
            : visible
              ? notice
              : accessNotice}
        </p>
        {!visible && (
          <div className="space-y-3 rounded-xl border border-gc-divider p-4">
            <p>
              {changedAccount
                ? "Reload before using another account."
                : "Your editor is concealed until current access is confirmed. Unsaved entries stay in this tab."}
            </p>
            {!changedAccount && (
              <button
                className="gc-button gc-button-quiet"
                onClick={() => void check()}
              >
                Check current listing access
              </button>
            )}
            {changedAccount && (
              <button
                className="gc-button gc-button-quiet"
                onClick={() => window.location.reload()}
              >
                Reload for current account
              </button>
            )}
          </div>
        )}
        {!!pending && !changedAccount && (
          <div className="space-y-3 rounded-xl border border-gc-divider p-4">
            <p>
              A request still needs confirmation. It may already be saved. Retry
              exactly the same request before making another change.
            </p>
            <button
              className="gc-button"
              disabled={busy}
              onClick={() => void send(pending)}
            >
              Retry the same listing request
            </button>
          </div>
        )}
        <div hidden={!visible} inert={!visible} className="space-y-6">
          {record && (
            <div className="space-y-2">
              <p>
                <strong>{exchangeStateLabels[record.listing.state]}</strong> ·
                Saved version {record.listing.version}
              </p>
              <p>
                Owned by {church?.name ?? "your account"}. Ownership cannot be
                transferred in this editor.
              </p>
              {record.recoveryRequired && (
                <p>
                  This listing needs a fresh publication review after recovery.
                  It stays private until you deliberately publish it again.
                </p>
              )}
              {record.moderationState !== "VISIBLE" && (
                <p>
                  A review restriction remains on this listing. Editing or
                  changing status does not remove it.{" "}
                  <Link
                    href="/platform/reports/decisions"
                    className="underline"
                  >
                    Read your decision notices
                  </Link>
                  .
                </p>
              )}
              {state !== "DRAFT" && state !== "ARCHIVED" && (
                <Link
                  prefetch={false}
                  className="underline"
                  href={`/platform/exchange/${record.listing.id}`}
                >
                  Read the published listing
                </Link>
              )}
            </div>
          )}
          {!record && (
            <label className="block space-y-2" htmlFor={`${fieldId}-owner`}>
              <span id={`${fieldId}-owner-label`}>Listing owner</span>
              <select
                id={`${fieldId}-owner`}
                aria-labelledby={`${fieldId}-owner-label`}
                className={portalInputClass}
                disabled={disabled || photoWork}
                value={ownerChurchId}
                onChange={(e) => setOwnerChurchId(e.target.value)}
              >
                <option value="">My personal account</option>
                {context.churches
                  .filter((c) => context.publishingChurchIds.includes(c.id))
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                {ownerChurchId &&
                  !context.publishingChurchIds.includes(ownerChurchId) && (
                    <option value={ownerChurchId}>
                      Previous church duty is no longer available
                    </option>
                  )}
              </select>
            </label>
          )}
          {conflict && (
            <section
              aria-label="Review saved listing changes"
              className="space-y-3 rounded-xl border border-gc-divider p-4"
            >
              <h2 className="text-xl">Review the current saved listing</h2>
              <p>
                Your unsaved entries remain below. Refresh the saved version
                before deciding which entries to keep.
              </p>
              <button
                className="gc-button gc-button-quiet"
                disabled={busy || !!pending}
                onClick={() => void check()}
              >
                Load current saved version
              </button>
              {newer?.fields && (
                <>
                  <dl className="space-y-2 break-words">
                    {Object.entries(newer.fields).map(([key, value]) => (
                      <div key={key}>
                        <dt className="font-semibold">
                          {
                            (
                              {
                                intent: "Type",
                                title: "Title",
                                description: "Description",
                                category: "Category",
                                condition: "Condition",
                                currency: "Currency",
                                price: "Price",
                                country: "Country",
                                placeId: "Selected town",
                                audience: "Audience",
                                audienceChurchId: "Church audience",
                                requestedItems: "Requested items",
                                neededBy: "Needed by",
                                serviceArea: "Service area",
                                availability: "Availability",
                                qualifications: "Self-stated qualifications",
                                servicePricing: "Service pricing",
                                serviceUnit: "Price unit"
                              } as Record<string, string>
                            )[key]
                          }
                        </dt>
                        <dd className="whitespace-pre-wrap">
                          {key === "placeId"
                            ? (newer.listing.placeLabel ?? "Not selected")
                            : key === "audienceChurchId"
                              ? (context.churches.find((c) => c.id === value)
                                  ?.name ??
                                (value
                                  ? "Previous church choice unavailable"
                                  : "Not selected"))
                              : fieldChoiceLabels[key as keyof Fields]?.[
                                  String(value)
                                ] ||
                                String(value ?? "Not selected") ||
                                "Not entered"}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <div className="flex flex-wrap gap-3">
                    <button
                      className="gc-button gc-button-quiet"
                      disabled={busy || !!pending || photoWork}
                      onClick={() => {
                        setRecord(newer);
                        recordRef.current = newer;
                        setNewer(null);
                        setConflict(false);
                        setConfirmed(false);
                        setNotice(
                          "Current saved version reviewed. Your local entries are retained; save them deliberately when ready."
                        );
                      }}
                    >
                      Keep my entries with this reviewed version
                    </button>
                    <button
                      className="gc-button gc-button-quiet"
                      disabled={busy || !!pending || photoWork}
                      onClick={() => {
                        setRecord(newer);
                        recordRef.current = newer;
                        setFields(newer.fields!);
                        setNewer(null);
                        setConflict(false);
                        setConfirmed(false);
                        setNotice("Current saved entries loaded.");
                      }}
                    >
                      Use current saved entries
                    </button>
                  </div>
                </>
              )}
            </section>
          )}
          <form
            aria-label="Listing editor"
            className="space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              if (!photoWork)
                void command({
                  operation: record ? "save" : "create",
                  schema: EXCHANGE_EDITOR_SCHEMA,
                  fields,
                  ...(record
                    ? policy
                    : { ownerChurchId: ownerChurchId || null })
                });
            }}
          >
            <ExchangeEditorFields
              value={fields}
              onChange={(next) => {
                setFields(next);
                setConfirmed(false);
              }}
              churches={audienceChurches}
              churchOwned={!!(record?.listing.ownerChurch?.id || ownerChurchId)}
              disabled={disabled || photoWork || state === "ARCHIVED"}
            />
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                className="mt-1 h-5 w-5 shrink-0"
                checked={confirmed}
                disabled={disabled || photoWork}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              <span>
                I may publish this listing, have described it honestly, and have
                checked the listing and privacy guidance. Required for
                publication and changes to a published listing.
              </span>
            </label>
            <div className="sticky bottom-24 z-10 w-fit max-w-full rounded-xl border border-gc-divider bg-gc-surface p-2 sm:bottom-4">
              <button
                type="submit"
                className="gc-button"
                disabled={
                  disabled ||
                  photoWork ||
                  state === "ARCHIVED" ||
                  (!!record && !dirty) ||
                  (!!state && state !== "DRAFT" && !confirmed)
                }
              >
                {record
                  ? state === "DRAFT"
                    ? "Save private draft"
                    : "Save listing changes"
                  : "Save a private draft"}
              </button>
            </div>
            <p className="text-sm">
              Drafts may be incomplete. Saving a new draft does not publish it.
              Unsaved entries stay in this tab only.
            </p>
          </form>
          {record && (
            <section className="space-y-3" aria-label="Listing status controls">
              <h2 className="text-2xl">Listing status</h2>
              <p>
                Finish saving text and photos before changing status. Reserved
                and Closed remain readable at the listing address. Archive
                removes the listing and its photos from ordinary reading; your
                saved record remains in My listings.
              </p>
              <div className="flex flex-wrap gap-3">
                {nextStates[record.listing.state].map((next) => (
                  <button
                    key={next}
                    type="button"
                    className="gc-button gc-button-quiet"
                    disabled={
                      disabled ||
                      dirty ||
                      photoWork ||
                      (next === "ACTIVE" && (!confirmed || !canPublish))
                    }
                    onClick={() => {
                      if (
                        next !== "ARCHIVED" ||
                        confirm(
                          "Archive this listing and hide its photos from ordinary reading? Your saved listing will remain in My listings."
                        )
                      )
                        void command({
                          operation: "status",
                          state: next,
                          ...policy
                        });
                    }}
                  >
                    {actionLabel(next)}
                  </button>
                ))}
                <button
                  type="button"
                  className="gc-button gc-button-quiet"
                  disabled={
                    disabled ||
                    dirty ||
                    photoWork ||
                    record.moderationState !== "VISIBLE"
                  }
                  onClick={() => void command({ operation: "duplicate" })}
                >
                  Duplicate into a private draft
                </button>
              </div>
              {!canPublish && (
                <p>
                  A current church Exchange manager must publish this
                  church-owned draft.
                </p>
              )}
              <p className="text-sm">
                A duplicate keeps the saved audience and listing entries.
                Photos, history and review records are not copied.
              </p>
            </section>
          )}
          {record ? (
            <ExchangePhotos
              listingId={record.listing.id}
              accountId={owner}
              version={record.listing.version}
              management
              disabled={disabled || dirty}
              onPending={setPhotoWork}
              onSaved={photoSaved}
              onCommand={command}
              onRemove={(id, version) =>
                send({
                  path: "/api/platform/images",
                  method: "DELETE",
                  body: JSON.stringify({ id, expectedVersion: version })
                })
              }
            />
          ) : (
            <p>Save a private draft first to add up to eight listing photos.</p>
          )}
        </div>
        {(dirty || conflict || pending) &&
          !busy &&
          !photoWork &&
          !changedAccount && (
            <button
              type="button"
              className="gc-button gc-button-quiet"
              onClick={async () => {
                if (
                  !confirm(
                    "Discard these unsaved local entries and reload? Saved work remains. An unconfirmed request may already be saved; check My listings after reloading."
                  )
                )
                  return;
                flushSync(() => {
                  setFields(record?.fields ?? emptyExchangeFields());
                  setOwnerChurchId("");
                  setPending(null);
                  setConflict(false);
                });
                await settlePhotoNavigation();
                window.location.reload();
              }}
            >
              Discard local entries and reload
            </button>
          )}
      </div>
    </ReadVisibility.Provider>
  );
}
