"use client";
import type { PantrySnapshot } from "@/lib/platform/pantry-reads";
import type { readExchangeDefaults } from "@/lib/platform/exchange-defaults";
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
import { ExchangeContactEntry } from "./exchange-contact-entry";
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
  owner,
  listingId,
  pantryCategory
}: {
  owner: string;
  listingId?: string;
  pantryCategory?: string;
}) {
  const fieldId = useId();
  const router = useRouter();
  const [context, setContext] = useState<Context>({
      ownerId: owner,
      churches: [],
      publishingChurchIds: [],
      managingChurchIds: []
    }),
    [record, setRecord] = useState<Snapshot | null>(null);
  const [fields, setFields] = useState(emptyExchangeFields);
  const [placeQuery, setPlaceQuery] = useState("");
  const [ownerChurchId, setOwnerChurchId] = useState("");
  const initialized = useRef(false);
  const replenishmentSeed =
    useRef<PantrySnapshot["replenishmentSeed"]>(undefined);
  const defaultSeed = useRef<Fields | null>(null);
  const [visible, setVisible] = useState(false),
    [changedAccount, setChangedAccount] = useState(false);
  const [busy, setBusy] = useState(false),
    [pending, setPending] = useState<Pending | null>(null);
  const [newer, setNewer] = useState<Snapshot | null>(null),
    [conflict, setConflict] = useState(false);
  const [notice, setNotice] = useState(""),
    [confirmed, setConfirmed] = useState(false);
  const resultRef = useRef<HTMLParagraphElement>(null),
    resultFocus = useRef<number | null>(null);
  const [focusRequest, setFocusRequest] = useState(0);
  const [accessNotice, setAccessNotice] = useState(
    "Checking your current listing access…"
  );
  const [photoWork, setPhotoWork] = useState(false);
  const flight = useRef(false),
    generation = useRef(0),
    identityGeneration = useRef(0),
    active = useRef(false),
    reading = useRef(false),
    readController = useRef<AbortController | null>(null),
    queued = useRef(false),
    latestCheck = useRef<() => Promise<void>>(async () => {}),
    pendingNavigation = useRef<string | null>(null),
    navigationRouter = useRef(router),
    recordRef = useRef(record),
    changedRef = useRef(false);
  recordRef.current = record;
  navigationRouter.current = router;
  useEffect(() => {
    const request = resultFocus.current;
    if (request === null || busy) return;
    resultFocus.current = null;
    if (
      request === generation.current &&
      !changedRef.current &&
      visible &&
      document.hasFocus() &&
      document.visibilityState === "visible" &&
      navigator.onLine
    )
      resultRef.current?.focus();
  }, [focusRequest, busy, visible]);
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
    identityGeneration.current++;
    pendingNavigation.current = null;
    queued.current = false;
    setChangedAccount(true);
    setVisible(false);
    setFields(emptyExchangeFields());
    setRecord(null);
    setNewer(null);
    setPending(null);
    setOwnerChurchId("");
    setPlaceQuery("");
    setConflict(false);
    setConfirmed(false);
    setAccessNotice(
      "Your sign-in changed. Private entries were cleared. Reload for your current account."
    );
  }, []);
  const finishNavigation = useCallback(async (seq: number) => {
    const destination = pendingNavigation.current;
    if (!destination) return;
    await settlePhotoNavigation();
    if (
      seq !== generation.current ||
      !active.current ||
      changedRef.current ||
      document.visibilityState === "hidden" ||
      !navigator.onLine
    )
      return;
    pendingNavigation.current = null;
    navigationRouter.current.replace(destination);
  }, []);
  const check = useCallback(async () => {
    if (
      !active.current ||
      changedRef.current ||
      document.visibilityState === "hidden" ||
      !navigator.onLine
    )
      return;
    const seq = ++generation.current;
    const identity = ++identityGeneration.current;
    setVisible(false);
    setAccessNotice("Checking your current listing access…");
    if (flight.current || reading.current) {
      queued.current = true;
      return;
    }
    reading.current = true;
    queued.current = false;
    const controller = new AbortController();
    readController.current = controller;
    const deadline = setTimeout(() => controller.abort(), 15000);
    // A concealment invalidates presentation, not a fresh owner confirmation.
    // SessionActivity may emit blur while this request detects a changed owner.
    try {
      const current = recordRef.current;
      const savedId = current?.listing.id ?? listingId;
      const [ctx, saved] = await Promise.all([
        socialRequest<Context>(
          "/api/platform/exchange?view=context",
          undefined,
          owner,
          "POST",
          undefined,
          controller.signal
        ),
        savedId
          ? socialRequest<Snapshot>(
              `/api/platform/exchange?view=editor&id=${encodeURIComponent(savedId)}`,
              undefined,
              owner,
              "POST",
              undefined,
              controller.signal
            )
          : Promise.resolve(null)
      ]);
      if (
        ctx.data.ownerId !== owner ||
        (savedId && (!saved?.data.fields || saved.data.listing.id !== savedId))
      )
        throw new Error(
          "Current listing access could not be confirmed. Try again."
        );
      let seed: PantrySnapshot["replenishmentSeed"];
      if (!savedId && pantryCategory) {
        const source = await socialRequest<PantrySnapshot>(
          `/api/platform/pantry?view=replenish&id=${encodeURIComponent(pantryCategory)}`,
          undefined,
          owner,
          "POST",
          undefined,
          controller.signal
        );
        seed = source.data.replenishmentSeed;
        if (
          !seed ||
          seed.categoryId !== pantryCategory ||
          (initialized.current &&
            JSON.stringify(seed) !== JSON.stringify(replenishmentSeed.current))
        )
          throw new Error(
            "This stock category or your duties changed. Reload to review a current replenishment draft."
          );
      }
      if (seq !== generation.current) return;
      if (!initialized.current) {
        const snapshot = saved?.data ?? null;
        setRecord(snapshot);
        recordRef.current = snapshot;
        setFields(
          snapshot?.fields ?? {
            ...emptyExchangeFields(),
            ...(seed
              ? {
                  intent: "CHURCH_NEED" as const,
                  title: seed.title,
                  requestedItems: seed.requestedItems,
                  audience: seed.audience,
                  audienceChurchId:
                    seed.audience === "CHURCH" ? seed.churchId : ""
                }
              : {})
          }
        );
        setOwnerChurchId(seed?.churchId ?? "");
        replenishmentSeed.current = seed;
        initialized.current = true;
      } else if (
        saved &&
        saved.data.listing.version !== current?.listing.version
      ) {
        setNewer(saved.data);
        setConflict(true);
        setNotice(
          "The saved listing changed. Your local entries are retained. Review the current saved version below before another change."
        );
      }
      setContext(ctx.data);
      setVisible(true);
      setAccessNotice("");
      if (!current) setConflict(false);
      await finishNavigation(seq);
    } catch (error) {
      if (seq === generation.current) {
        setVisible(false);
        setAccessNotice(
          controller.signal.aborted
            ? "Your listing access check timed out. Try again. Your entries are retained."
            : error instanceof Error
              ? error.message
              : "Reconnect to check your listing access. Your entries remain here."
        );
      }
      if (error instanceof SocialClientError && error.status === 401) {
        const actual = await currentSocialOwner(controller.signal).catch(
          () => undefined
        );
        if (
          identity === identityGeneration.current &&
          !changedRef.current &&
          actual !== undefined &&
          actual !== owner
        )
          clearAccount();
      }
    } finally {
      clearTimeout(deadline);
      controller.abort();
      if (readController.current === controller) readController.current = null;
      reading.current = false;
      if (
        queued.current &&
        active.current &&
        !flight.current &&
        !changedRef.current
      ) {
        queued.current = false;
        void latestCheck.current();
      }
    }
  }, [owner, listingId, pantryCategory, clearAccount, finishNavigation]);
  latestCheck.current = check;
  const resume = useCallback(() => {
    if (document.visibilityState === "hidden" || !navigator.onLine) return;
    active.current = true;
    void check();
  }, [check]);
  useEffect(() => {
    const identityClock = identityGeneration;
    const currentRead = readController;
    const hide = () => {
      active.current = false;
      queued.current = false;
      generation.current++;
      setVisible(false);
    };
    const refresh = () => {
      if (active.current) void check();
    };
    const visibility = () =>
      document.visibilityState === "hidden" ? hide() : resume();
    if (document.hasFocus()) resume();
    else hide();
    const timer = setInterval(refresh, 30000);
    for (const event of ["blur", "pagehide", "offline"])
      window.addEventListener(event, hide);
    for (const event of ["focus", "pageshow"])
      window.addEventListener(event, resume);
    for (const event of ["online", "social-relationships-changed"])
      window.addEventListener(event, refresh);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      hide();
      identityClock.current++;
      currentRead.current?.abort();
      clearInterval(timer);
      for (const event of ["blur", "pagehide", "offline"])
        window.removeEventListener(event, hide);
      for (const event of ["focus", "pageshow"])
        window.removeEventListener(event, resume);
      for (const event of ["online", "social-relationships-changed"])
        window.removeEventListener(event, refresh);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [check, resume]);

  async function send(request: Pending) {
    if (flight.current || changedRef.current || !active.current || !visible)
      return false;
    const seq = ++generation.current;
    const identity = ++identityGeneration.current;
    resultFocus.current = null;
    flight.current = true;
    setBusy(true);
    setPending(request);
    setNotice("");
    let receiptConfirmed = false;
    let navigating = false;
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
      if (navigate)
        pendingNavigation.current = `/platform/exchange/${encodeURIComponent(id)}/edit#listing-editor-heading`;
      const canPresent =
        seq === generation.current &&
        active.current &&
        document.visibilityState !== "hidden" &&
        navigator.onLine;
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
        setVisible(canPresent);
        setNotice(result.data.message ?? "Photo removed from the listing.");
      });
      if (navigate && canPresent) {
        navigating = true;
        await finishNavigation(seq);
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
        if (
          identity === identityGeneration.current &&
          actual !== undefined &&
          actual !== owner
        )
          clearAccount();
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
      // The retained read generation cancels action focus after concealment.
      // A new listing returns focus through its deferred navigation destination.
      if (
        !navigating &&
        !pendingNavigation.current &&
        seq === generation.current
      ) {
        resultFocus.current = seq;
        setFocusRequest((value) => value + 1);
      }
      if (queued.current && active.current && !changedRef.current) {
        queued.current = false;
        void latestCheck.current();
      }
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
  async function applyPersonalDefaults() {
    if (
      record ||
      ownerChurchId ||
      flight.current ||
      pending ||
      conflict ||
      !visible
    )
      return;
    if (
      dirty &&
      !confirm(
        "Apply your defaults to this draft's type, audience and general town? Other entered fields remain here."
      )
    )
      return;
    const seq = ++generation.current;
    flight.current = true;
    setBusy(true);
    try {
      const { data } = await socialRequest<
        Awaited<ReturnType<typeof readExchangeDefaults>>
      >("/api/platform/exchange?view=defaults", undefined, owner);
      if (seq !== generation.current || changedRef.current) return;
      if (!data.available || !data.draftFields) {
        setNotice(
          "Review your saved personal defaults before applying them. Their previous audience or recovery status is unavailable."
        );
        return;
      }
      const next = {
        ...fields,
        intent: data.draftFields.intent,
        audience: data.draftFields.audience,
        audienceChurchId: data.draftFields.audienceChurchId,
        country: data.draftFields.country,
        placeId: data.draftFields.placeId
      };
      defaultSeed.current = next;
      setFields(next);
      setNotice(
        "Personal defaults applied to this new draft. Review its type, audience and general town. Private pickup text and inquiry consent were not copied."
      );
    } catch (error) {
      if (seq === generation.current)
        setNotice(
          error instanceof Error
            ? error.message
            : "Your personal defaults could not be checked."
        );
    } finally {
      flight.current = false;
      setBusy(false);
      if (queued.current && active.current && !changedRef.current) {
        queued.current = false;
        void latestCheck.current();
      }
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
        <p
          ref={resultRef}
          role="status"
          aria-live="polite"
          tabIndex={-1}
          className="focus:outline-none focus:ring-2 focus:ring-gc-focus"
        >
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
              <button className="gc-button gc-button-quiet" onClick={resume}>
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
              disabled={busy || !visible}
              onClick={() => void send(pending)}
            >
              Retry the same listing request
            </button>
          </div>
        )}
        <div className="space-y-6">
          {visible && (
            <>
              {!record && !ownerChurchId && (
                <section
                  className="space-y-2"
                  aria-label="Apply personal listing defaults"
                >
                  <button
                    type="button"
                    className="gc-button gc-button-quiet"
                    disabled={disabled}
                    onClick={() => void applyPersonalDefaults()}
                  >
                    Apply my personal defaults
                  </button>
                  <p>
                    Only the listing type, audience and general town are copied.{" "}
                    <Link
                      prefetch={false}
                      className="underline"
                      href="/platform/exchange/defaults"
                    >
                      Review personal defaults
                    </Link>
                    .
                  </p>
                </section>
              )}

              {record && (
                <div className="space-y-2">
                  <p>
                    <strong>{exchangeStateLabels[record.listing.state]}</strong>{" "}
                    · Saved version {record.listing.version}
                  </p>
                  <p>
                    Owned by {church?.name ?? "your account"}. Ownership cannot
                    be transferred in this editor.
                  </p>
                  {record.listing.intent === "CHURCH_NEED" && (
                    <Link
                      prefetch={false}
                      className="gc-button"
                      href={`/platform/exchange/${record.listing.id}/needs`}
                    >
                      Configure need actions and commitments
                    </Link>
                  )}
                  {record.recoveryRequired && (
                    <p>
                      This listing needs a fresh publication review after
                      recovery. It stays private until you deliberately publish
                      it again.
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
                    onChange={(e) => {
                      const nextOwner = e.target.value;
                      if (nextOwner && defaultSeed.current) {
                        const seed = defaultSeed.current,
                          empty = emptyExchangeFields();
                        setFields((current) => ({
                          ...current,
                          intent:
                            current.intent === seed.intent
                              ? empty.intent
                              : current.intent,
                          audience:
                            current.audience === seed.audience
                              ? empty.audience
                              : current.audience,
                          audienceChurchId:
                            current.audienceChurchId === seed.audienceChurchId
                              ? empty.audienceChurchId
                              : current.audienceChurchId,
                          country:
                            current.country === seed.country
                              ? empty.country
                              : current.country,
                          placeId:
                            current.placeId === seed.placeId
                              ? empty.placeId
                              : current.placeId
                        }));
                        defaultSeed.current = null;
                        setNotice(
                          "Personal defaults were removed from this church draft. Review its audience and area deliberately."
                        );
                      }
                      setOwnerChurchId(nextOwner);
                    }}
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
                    onClick={resume}
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
                                    qualifications:
                                      "Self-stated qualifications",
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
                                  ? (context.churches.find(
                                      (c) => c.id === value
                                    )?.name ??
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
                  placeQuery={placeQuery}
                  onPlaceQueryChange={setPlaceQuery}
                  onChange={(next) => {
                    setFields(next);
                    setConfirmed(false);
                  }}
                  churches={audienceChurches}
                  churchOwned={
                    !!(record?.listing.ownerChurch?.id || ownerChurchId)
                  }
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
                    I may publish this listing, have described it honestly, and
                    have checked the listing and privacy guidance. Required for
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
                  Drafts may be incomplete. Saving a new draft does not publish
                  it. Unsaved entries stay in this tab only.
                </p>
              </form>
              {record && (
                <section
                  className="space-y-3"
                  aria-label="Listing status controls"
                >
                  <h2 className="text-2xl">Listing status</h2>
                  <p>
                    Finish saving text and photos before changing status.
                    Reserved and Closed remain readable at the listing address.
                    Archive removes the listing and its photos from ordinary
                    reading; your saved record remains in My listings.
                  </p>
                  <div className="flex flex-wrap gap-3">
                    {nextStates[record.listing.state]
                      .filter(
                        (next) =>
                          !record.structuredNeed ||
                          !["RESERVED", "CLOSED"].includes(next)
                      )
                      .map((next) => (
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
            </>
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
          ) : visible ? (
            <p>Save a private draft first to add up to eight listing photos.</p>
          ) : null}
          {record && !record.structuredNeed && (
            <ExchangeContactEntry
              owner={owner}
              listingId={record.listing.id}
              listingVersion={record.listing.version}
            />
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
