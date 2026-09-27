"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { socialRequest, SocialClientError } from "@/lib/platform/social-client";
import {
  helpCategories,
  helpOutcomes
} from "@/lib/platform/interchurch-help-options";
import { useUnsavedSocialWork } from "./use-unsaved-social-work";
import {
  HelpRequestEditor,
  HelpTermsSummary,
  type HelpPageData,
  HelpSelect,
  HelpField
} from "./interchurch-help-editor";
import {
  HelpOfferCard,
  HelpOfferForm,
  HelpRequestActions
} from "./interchurch-help-actions";

export function InterchurchHelpPage({
  owner,
  view,
  id,
  query = {}
}: {
  owner: string | null;
  view: "list" | "request" | "offers" | "new";
  id?: string;
  query?: Record<string, string>;
}) {
  const endpoint = "/api/platform/exchange";
  const url =
    endpoint +
    "?" +
    new URLSearchParams({
      ...query,
      view:
        "help-" +
        (view === "new" ? "context" : view === "offers" && id ? "offer" : view),
      ...(id ? { id } : {})
    });
  const [page, setPage] = useState<HelpPageData | null>(null),
    [context, setContext] = useState<Extract<
      HelpPageData,
      { view: "context" }
    > | null>(null),
    [visible, setVisible] = useState(false),
    [notice, setNotice] = useState("Checking current ministry help access…"),
    [dirtySections, setDirtySections] = useState<Record<string, boolean>>({}),
    [busy, setBusy] = useState(false),
    [pending, setPending] = useState<string | null>(null),
    [conflict, setConflict] = useState(false),
    [refresh, setRefresh] = useState<Record<string, number>>({});
  const dirty = Object.values(dirtySections).some(Boolean);
  const markDirty = (section: string) => (value: boolean) =>
    setDirtySections((old) => ({ ...old, [section]: value }));
  const pendingSection = useRef("new");
  const [receiptHref, setReceiptHref] = useState<string | null>(null);
  const [category, setCategory] = useState(query.category ?? ""),
    [area, setArea] = useState(query.area ?? ""),
    [date, setDate] = useState(query.date ?? "");
  const accessChecked = useRef(false);
  const active = useRef(false),
    generation = useRef(0),
    reading = useRef(false),
    queued = useRef(false),
    flight = useRef(false),
    snapshot = useRef<string | null>(null),
    confirmed = useRef<{
      id: string;
      message: string;
      href?: string;
      section: string;
    } | null>(null);
  const latest = useRef({ dirty, pending, dirtySections });
  latest.current = { dirty, pending, dirtySections };
  const hide = useCallback(() => {
    active.current = false;
    accessChecked.current = false;
    generation.current++;
    setVisible(false);
    setNotice(
      "Your private information is concealed. Local entries and any original request are retained."
    );
  }, []);
  const load = useCallback(async () => {
    if (
      !active.current ||
      document.visibilityState === "hidden" ||
      navigator.onLine === false
    )
      return;
    if (reading.current) {
      queued.current = true;
      return;
    }
    reading.current = true;
    accessChecked.current = false;
    const seq = ++generation.current;
    setVisible(false);
    try {
      const result = await socialRequest<HelpPageData>(url, undefined, owner);
      let choices: Extract<HelpPageData, { view: "context" }> | null = null;
      if (owner && ["new", "request"].includes(view)) {
        const r = await socialRequest<HelpPageData>(
          endpoint + "?view=help-context",
          undefined,
          owner
        );
        if (r.data.view === "context") choices = r.data;
      }
      if (seq !== generation.current || !active.current) return;
      accessChecked.current = true;
      const digest = JSON.stringify(result.data);
      if (
        snapshot.current !== null &&
        snapshot.current !== digest &&
        !confirmed.current &&
        (latest.current.dirty || latest.current.pending)
      ) {
        setConflict(true);
        setVisible(false);
        setNotice(
          "This record changed. Your original entries are retained. Resolve any original request, then reload to review current terms."
        );
        return;
      }
      if (snapshot.current !== null && snapshot.current !== digest) {
        // Pristine controls must adopt both the new fields and their version.
        // Dirty controls stay mounted and use the explicit conflict path.
        const sections =
          result.data.view === "offers"
            ? result.data.offers.map((row) => row.id)
            : ["new", "editor", "controls", "offer"];
        setRefresh((old) => {
          const next = { ...old };
          for (const section of sections) {
            if (
              !latest.current.dirtySections[section] &&
              section !== confirmed.current?.section
            )
              next[section] = (next[section] ?? 0) + 1;
          }
          return next;
        });
      }
      snapshot.current = digest;
      setPage(result.data);
      setContext(choices);
      setVisible(true);
      setConflict(false);
      if (confirmed.current) {
        setNotice(confirmed.current.message);
        setReceiptHref(confirmed.current.href ?? null);
        const section = confirmed.current.section;
        const otherDraft = Object.entries(latest.current.dirtySections).some(
          ([key, value]) => value && key !== section
        );
        setDirtySections((old) => ({ ...old, [section]: false }));
        setPending(null);
        setRefresh((old) => ({ ...old, [section]: (old[section] ?? 0) + 1 }));
        if (otherDraft) {
          setConflict(true);
          setNotice(
            "The action was recorded. Another local draft is retained. Reload deliberately before applying that draft to changed information."
          );
        }
        confirmed.current = null;
      } else setNotice("");
    } catch (error) {
      if (seq === generation.current && active.current)
        setNotice(
          error instanceof Error
            ? error.message
            : "Current access could not be checked."
        );
    } finally {
      reading.current = false;
      if (queued.current && active.current) {
        queued.current = false;
        void load();
      }
    }
  }, [url, owner, view]);
  const recheck = useCallback(() => {
    if (document.visibilityState !== "hidden" && navigator.onLine !== false) {
      active.current = true;
      void load();
    }
  }, [load]);
  useEffect(() => {
    const visibility = () =>
      document.visibilityState === "hidden" ? hide() : recheck();
    recheck();
    window.addEventListener("blur", hide);
    window.addEventListener("offline", hide);
    window.addEventListener("pagehide", hide);
    window.addEventListener("focus", recheck);
    window.addEventListener("online", recheck);
    window.addEventListener("pageshow", recheck);
    window.addEventListener("social-relationships-changed", recheck);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      hide();
      window.removeEventListener("blur", hide);
      window.removeEventListener("offline", hide);
      window.removeEventListener("pagehide", hide);
      window.removeEventListener("focus", recheck);
      window.removeEventListener("online", recheck);
      window.removeEventListener("pageshow", recheck);
      window.removeEventListener("social-relationships-changed", recheck);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [hide, recheck]);
  const send = async (body: string) => {
    if (flight.current || !active.current || !accessChecked.current)
      return false;
    flight.current = true;
    setBusy(true);
    setPending(body);
    try {
      const { data } = await socialRequest<{
        id: string;
        version: number;
        message: string;
      }>(endpoint, body, owner);
      if (typeof data.id !== "string" || !Number.isInteger(data.version))
        throw Error(
          "The receipt could not be confirmed. Retry the original request."
        );
      const operation = JSON.parse(body).operation;
      confirmed.current = {
        ...data,
        section: pendingSection.current,
        href:
          operation === "help-create"
            ? `/platform/exchange/help/${data.id}`
            : operation === "help-offer"
              ? `/platform/exchange/help/offers?id=${data.id}`
              : undefined
      };
      setNotice(
        "Received. Checking current access before showing the receipt…"
      );
      if (active.current) void load();
      return true;
    } catch (error) {
      if (
        error instanceof SocialClientError &&
        [400, 409].includes(error.status)
      ) {
        setPending(null);
        setConflict(error.status === 409);
      }
      if (
        error instanceof SocialClientError &&
        [401, 403, 404].includes(error.status)
      )
        hide();
      setNotice(
        error instanceof Error
          ? error.message
          : "The reply was lost. Confirm the same request before changing it."
      );
      return false;
    } finally {
      flight.current = false;
      setBusy(false);
    }
  };
  const command = async (v: Record<string, unknown>, section = "controls") => {
    if (pending || busy || conflict || !visible) return false;
    pendingSection.current = section;
    return send(JSON.stringify({ ...v, mutationId: crypto.randomUUID() }));
  };
  useUnsavedSocialWork(
    { dirty, saving: busy || !!pending, conflict },
    () =>
      setNotice(
        "Save or discard your local entries before leaving. An unconfirmed request may already have been received."
      ),
    true
  );
  const blocked = busy || !!pending || conflict || !visible;
  return (
    <div className="space-y-6">
      <nav className="flex flex-wrap gap-4" aria-label="Ministry help">
        <Link prefetch={false} href="/platform/exchange/help">
          Find ministry help
        </Link>
        <Link prefetch={false} href="/platform/exchange/help/new">
          Create request
        </Link>
        <Link prefetch={false} href="/platform/exchange/help/offers">
          My private offers
        </Link>
        <Link prefetch={false} href="/platform/exchange">
          Exchange
        </Link>
      </nav>
      <h1 className="text-4xl">Ministry help</h1>
      <p>
        Church requests and private offers of adult ministry help. A proposed
        date does not reserve an event, volunteer place or equipment. This
        coordinates help without checkout, payment collection or screening
        guarantees.
      </p>
      <div aria-live="polite">
        {notice && (
          <p role="status">
            {visible
              ? notice
              : "Current access must be checked before showing private information. Your local entries and original request are retained."}
          </p>
        )}
        {!visible && (
          <button type="button" className="gc-button" onClick={recheck}>
            Recheck current access
          </button>
        )}
        {pending && (
          <button
            type="button"
            disabled={busy || !accessChecked.current}
            className="gc-button"
            onClick={() => void send(pending)}
          >
            Confirm original request
          </button>
        )}
        {(dirty || pending || conflict) && (
          <button
            className="gc-button gc-button-quiet"
            type="button"
            disabled={busy}
            onClick={() => {
              if (
                confirm(
                  "Discard local entries and reload current information? An unconfirmed request may already have been received."
                )
              ) {
                setDirtySections({});
                setPending(null);
                setConflict(false);
                window.location.reload();
              }
            }}
          >
            Discard local entries and reload
          </button>
        )}
        {visible && receiptHref && (
          <Link className="gc-button" prefetch={false} href={receiptHref}>
            Open saved record
          </Link>
        )}
      </div>
      {!owner && view !== "list" && (
        <Link href="/platform/login">
          Sign in for your private offers and church duties
        </Link>
      )}
      {view === "list" && (
        <form
          className="grid gap-3 sm:grid-cols-3"
          action="/platform/exchange/help"
        >
          <HelpSelect
            label="Help category"
            value={category}
            onChange={setCategory}
            choices={helpCategories}
          />
          <input type="hidden" name="category" value={category} />
          <HelpField
            label="Approximate town or area"
            value={area}
            onChange={setArea}
          />
          <input type="hidden" name="area" value={area} />
          <HelpField
            label="On or after date (UTC)"
            value={date}
            type="date"
            onChange={setDate}
          />
          <input type="hidden" name="date" value={date} />
          <button className="gc-button">Find requests</button>
        </form>
      )}
      {visible && page?.view === "list" && (
        <>
          {!page.requests.length && (
            <p>
              No current requests match these choices. Clear a filter or create
              a request for a church you may represent.
            </p>
          )}
          {page.requests.map((r) => (
            <article className="space-y-3 rounded-xl border p-4" key={r.id}>
              <h2 className="text-2xl">
                <Link
                  prefetch={false}
                  className="underline"
                  href={`/platform/exchange/help/${r.id}`}
                >
                  {r.listing?.title}
                </Link>
              </h2>
              <p>
                {helpCategories[r.category as keyof typeof helpCategories]} ·{" "}
                {r.listing?.ownerChurch?.name} · {r.listing?.placeLabel}
              </p>
              <p>Coordinator: {r.coordinatorDisplay}</p>
              <HelpTermsSummary terms={r.terms} />
            </article>
          ))}
          {page.next && (
            <Link
              href={
                "/platform/exchange/help?" +
                new URLSearchParams({ ...query, after: page.next })
              }
            >
              More requests
            </Link>
          )}
        </>
      )}
      {visible &&
        page?.view === "context" &&
        view === "new" &&
        page.drafts.length > 0 && (
          <section>
            <h2 className="text-2xl">Your church drafts</h2>
            {page.drafts.map((d) => (
              <p key={d.id}>
                <Link
                  className="underline"
                  href={`/platform/exchange/help/${d.id}`}
                >
                  {d.listing?.title}
                </Link>
              </p>
            ))}
            {page.moreDrafts && (
              <Link className="underline" href="/platform/exchange/mine">
                See all my Exchange listings and drafts
              </Link>
            )}
          </section>
        )}
      {page?.view === "context" && view === "new" && (
        <HelpRequestEditor
          key={refresh.new ?? 0}
          visible={visible}
          blocked={blocked}
          command={(v) => command(v, "new")}
          churches={page.churches}
          onDirty={markDirty("new")}
        />
      )}
      {page?.view === "request" && (
        <>
          {visible && (
            <section className="space-y-3">
              <h2 className="text-3xl">{page.listing.title}</h2>
              <p>
                {page.listing.church.name} · {page.listing.placeLabel} ·{" "}
                {page.listing.audience === "PUBLIC"
                  ? "Public request"
                  : "Only the requesting church"}
              </p>
              <p>
                Coordinator: {page.request.coordinatorDisplay}.{" "}
                {page.coordinatorCurrent
                  ? "Current responsibility confirmed."
                  : "New offers are unavailable until a coordinator accepts current responsibility."}
              </p>
              <p>
                Outcome:{" "}
                {
                  helpOutcomes[
                    page.request.outcome as keyof typeof helpOutcomes
                  ]
                }
                . {page.request.outcomeReason}
              </p>
              <HelpTermsSummary terms={page.request.terms} />
              <Link
                prefetch={false}
                href={`/platform/exchange/help/offers?requestId=${page.request.id}`}
              >
                My private offers for this request
              </Link>
            </section>
          )}
          {page.manage && context && (
            <HelpRequestEditor
              key={"editor" + (refresh.editor ?? 0)}
              initial={page}
              churches={context.churches}
              visible={visible}
              blocked={blocked}
              command={(v) => command(v, "editor")}
              onDirty={markDirty("editor")}
            />
          )}
          <HelpRequestActions
            key={"controls" + (refresh.controls ?? 0)}
            page={page}
            visible={visible}
            blocked={blocked}
            command={(v) => command(v, "controls")}
            onDirty={markDirty("controls")}
          />
          {page.canOffer && context && (
            <HelpOfferForm
              key={"offer" + (refresh.offer ?? 0)}
              request={page}
              churches={context.churches}
              visible={visible}
              blocked={blocked}
              command={(v) => command(v, "offer")}
              onDirty={markDirty("offer")}
            />
          )}
        </>
      )}
      {page?.view === "offers" && (
        <>
          {visible &&
            page.responsibilities.map((r) => (
              <section key={r.id} className="rounded-xl border p-4">
                <p>Your coordinator responsibility</p>
                <Link
                  className="underline"
                  href={`/platform/exchange/help/${r.id}`}
                >
                  Review the current request
                </Link>
                <p className="text-sm">
                  Responsibility reference: {r.id.slice(0, 8)}
                </p>
                <button
                  className="gc-button"
                  disabled={blocked}
                  onClick={() =>
                    void command({
                      operation: "help-withdraw-coordinator",
                      requestId: r.id,
                      expectedVersion: r.version
                    })
                  }
                >
                  Withdraw my coordinator responsibility
                </button>
              </section>
            ))}
          {visible && !page.offers.length && (
            <p>
              No private offers on this page. Open a current request to offer
              your own help.
            </p>
          )}
          {page.offers.map((row) => (
            <HelpOfferCard
              key={row.id + ":" + (refresh[row.id] ?? 0)}
              row={row}
              visible={visible}
              blocked={blocked}
              command={(v) => command(v, row.id)}
              onDirty={markDirty(row.id)}
            />
          ))}
          {visible && page.next && (
            <Link
              href={
                "/platform/exchange/help/offers?" +
                new URLSearchParams({ ...query, after: page.next })
              }
            >
              More private offers
            </Link>
          )}
        </>
      )}
    </div>
  );
}
