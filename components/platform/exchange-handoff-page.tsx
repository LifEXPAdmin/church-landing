import { PlatformShell } from "./platform-shell";
import {
  ExchangeNavigation,
  ExchangeAccountLinks,
  ExchangeUnavailable,
  type ExchangeQuery
} from "./exchange-page-ui";
import { ExchangeHandoffDetail } from "./exchange-handoff-detail";
import { ExchangeInquiryComposer } from "./exchange-inquiry-composer";
import { ExchangeDefaultsEntry } from "./exchange-defaults-entry";
import { ExchangeInquiryList } from "./exchange-inquiry-list";
import { getCurrentPlatformUser } from "@/lib/platform/session";
import {
  exchangeHandoffPage,
  exchangeDefaultsPage
} from "@/lib/platform/exchange-session";
import { PortalError } from "@/lib/platform/portal-policy";

export async function ExchangeInquiryEntry({
  owner,
  listingId
}: {
  owner: string;
  listingId: string;
}) {
  try {
    await exchangeHandoffPage({ view: "target", listingId });
    return (
      <ExchangeInquiryComposer
        key={`${owner}:${listingId}`}
        owner={owner}
        listingId={listingId}
      />
    );
  } catch (error) {
    return (
      <ExchangeUnavailable
        error={error}
        href={`/platform/exchange/${listingId}`}
      />
    );
  }
}

export async function ExchangeHandoffsPage({
  id,
  query = {}
}: {
  id?: string;
  query?: ExchangeQuery;
}) {
  const user = await getCurrentPlatformUser(),
    path = id
      ? `/platform/exchange/handoffs/${id}`
      : "/platform/exchange/handoffs";
  let content;
  if (!user) content = <ExchangeAccountLinks next={path} />;
  else
    try {
      if (
        Object.keys(query).some(
          (key) => !["view", "after", "listingId"].includes(key)
        ) ||
        Object.values(query).some((value) => Array.isArray(value))
      )
        throw new PortalError(400, "Choose a supported inquiry view.");
      const view = id
        ? "detail"
        : query.view === "outgoing"
          ? "outgoing"
          : "incoming";
      if (
        !id &&
        query.view &&
        !["incoming", "outgoing"].includes(String(query.view))
      )
        throw new PortalError(400, "Choose incoming or outgoing inquiries.");
      const input = {
        view,
        ...(id
          ? { id }
          : {
              ...(query.after ? { after: query.after as string } : {}),
              ...(query.listingId
                ? { listingId: query.listingId as string }
                : {})
            })
      };
      await exchangeHandoffPage(input);
      const params = new URLSearchParams(Object.entries(input));
      params.set("view", `handoff-${view}`);
      content = id ? (
        <ExchangeHandoffDetail
          key={`${user.id}:${id}`}
          owner={user.id}
          inquiryId={id}
        />
      ) : (
        <ExchangeInquiryList
          key={`${user.id}:/api/platform/exchange?${params}`}
          owner={user.id}
          url={`/api/platform/exchange?${params}`}
          view={view === "outgoing" ? "outgoing" : "incoming"}
          listingId={query.listingId as string | undefined}
        />
      );
    } catch (error) {
      content = <ExchangeUnavailable error={error} href={path} />;
    }
  return (
    <PlatformShell user={user}>
      <section className="container-shell py-8 sm:py-10">
        <div className="mx-auto max-w-3xl space-y-6">
          <h1 className="text-4xl">
            {id ? "Private Exchange handoff" : "My Exchange inquiries"}
          </h1>
          <ExchangeNavigation />
          {content}
        </div>
      </section>
    </PlatformShell>
  );
}

export async function ExchangeDefaultsPage() {
  const user = await getCurrentPlatformUser(),
    path = "/platform/exchange/defaults";
  let content;
  if (!user) content = <ExchangeAccountLinks next={path} />;
  else
    try {
      // Keep initial authorization and its recovery affordances without
      // serializing private fields or church choices into HTML/RSC.
      await exchangeDefaultsPage();
      content = <ExchangeDefaultsEntry key={user.id} owner={user.id} />;
    } catch (error) {
      content = <ExchangeUnavailable error={error} href={path} />;
    }
  return (
    <PlatformShell user={user}>
      <section className="container-shell py-8 sm:py-10">
        <div className="mx-auto max-w-3xl space-y-6">
          <h1 className="text-4xl">Personal listing defaults</h1>
          <ExchangeNavigation />
          {content}
        </div>
      </section>
    </PlatformShell>
  );
}
