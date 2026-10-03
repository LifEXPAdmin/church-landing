import Link from "next/link";
import { PlatformShell } from "./platform-shell";
import { PrivateSnapshotGuard } from "./private-snapshot-guard";
import {
  ExchangeNavigation,
  ExchangeAccountLinks,
  ExchangeUnavailable,
  exchangeChecksum,
  type ExchangeQuery
} from "./exchange-page-ui";
import {
  ExchangeHandoffActions,
  ExchangeInquiryForm
} from "./exchange-handoff-controls";
import { ExchangeDefaultsEntry } from "./exchange-defaults-entry";
import { ExchangeInquiryList } from "./exchange-inquiry-list";
import { RegionalTime } from "./regional-presentation";
import { getCurrentPlatformUser } from "@/lib/platform/session";
import {
  exchangeHandoffPage,
  exchangeDefaultsPage
} from "@/lib/platform/exchange-session";
import {
  exchangeInquiryStateLabels,
  exchangeHandoffActionLabels,
  exchangeCancellationReasons,
  type ExchangeInquiryState,
  type ExchangeCancellationReason
} from "@/lib/platform/exchange-handoff-options";
import { reportEntryHref } from "@/lib/platform/community-report-types";
import { PortalError } from "@/lib/platform/portal-policy";

export async function ExchangeInquiryEntry({
  owner,
  listingId
}: {
  owner: string;
  listingId: string;
}) {
  try {
    const result = await exchangeHandoffPage({ view: "target", listingId });
    return (
      <PrivateSnapshotGuard
        owner={owner}
        url={`/api/platform/exchange?${new URLSearchParams({ view: "handoff-target", listingId })}`}
        checksum={exchangeChecksum(result)}
        label="inquiry access"
      >
        <section className="space-y-3" aria-label="Listing inquiry">
          <h2 className="text-2xl">Ask about this listing</h2>
          {result.target ? (
            <ExchangeInquiryForm
              key={`${listingId}:${result.target.contactVersion}`}
              owner={owner}
              target={result.target}
            />
          ) : (
            <p>
              A private inquiry is not currently available to this account. The
              receiving adult’s listing and contact choices determine access.
            </p>
          )}
        </section>
      </PrivateSnapshotGuard>
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
      const result = await exchangeHandoffPage(input),
        inquiry = result.inquiry;
      const params = new URLSearchParams(Object.entries(input));
      params.set("view", `handoff-${view}`);
      content = id ? (
        <PrivateSnapshotGuard
          owner={user.id}
          url={`/api/platform/exchange?${params}`}
          checksum={exchangeChecksum(result)}
          label="private handoff"
        >
          {inquiry ? (
            <article className="space-y-5 break-words">
              <h2 className="text-2xl">
                {inquiry.listing?.title ?? "Unavailable listing"}
              </h2>
              <p className="font-semibold">
                {
                  exchangeInquiryStateLabels[
                    inquiry.state as ExchangeInquiryState
                  ]
                }
              </p>
              {inquiry.person && (
                <p>
                  {inquiry.side === "incoming"
                    ? "Inquiry from"
                    : "Receiving adult"}
                  : {inquiry.person.name}
                </p>
              )}
              {inquiry.purpose && (
                <section className="space-y-2">
                  <h3 className="font-semibold">Inquiry purpose</h3>
                  <p className="whitespace-pre-wrap">{inquiry.purpose}</p>
                </section>
              )}
              {!inquiry.available && (
                <p>
                  Current access to this source is unavailable. Private details
                  are concealed. The original inquiry cannot be revived by
                  restoring an account, connection or duty.
                </p>
              )}
              {inquiry.windowStart && inquiry.windowEnd && inquiry.timeZone && (
                <section className="space-y-2" aria-label="Pickup window">
                  <h3 className="font-semibold">Pickup window</h3>
                  <p>
                    <RegionalTime
                      value={inquiry.windowStart}
                      options={{
                        timeZone: inquiry.timeZone,
                        dateStyle: "medium",
                        timeStyle: "short"
                      }}
                    />{" "}
                    to{" "}
                    <RegionalTime
                      value={inquiry.windowEnd}
                      options={{
                        timeZone: inquiry.timeZone,
                        dateStyle: "medium",
                        timeStyle: "short"
                      }}
                    />{" "}
                    ({inquiry.timeZone})
                  </p>
                </section>
              )}
              {inquiry.pickupDetails && (
                <section
                  className="space-y-2 rounded-xl border border-gc-divider p-4"
                  aria-label="Private pickup instructions"
                >
                  <h3 className="font-semibold">Private pickup instructions</h3>
                  <p className="whitespace-pre-wrap">{inquiry.pickupDetails}</p>
                </section>
              )}
              {inquiry.available &&
                ["INQUIRED", "SELECTED", "RESERVED"].includes(
                  inquiry.state
                ) && (
                  <p>
                    Deadline:{" "}
                    <RegionalTime
                      value={inquiry.expiresAt}
                      options={{
                        timeZone: inquiry.timeZone ?? "UTC",
                        dateStyle: "medium",
                        timeStyle: "short"
                      }}
                    />{" "}
                    ({inquiry.timeZone ?? "UTC"}). An expired hold leaves the
                    listing closed for owner review.
                  </p>
                )}
              {inquiry.cancelReason && (
                <p>
                  Private cancellation reason:{" "}
                  {
                    exchangeCancellationReasons[
                      inquiry.cancelReason as ExchangeCancellationReason
                    ]
                  }
                </p>
              )}
              {inquiry.cancelNote && (
                <p className="whitespace-pre-wrap">{inquiry.cancelNote}</p>
              )}
              {inquiry.state === "COMPLETED" && (
                <p>
                  Completion was recorded by {inquiry.completionRecordedBy}.
                  This records that participant’s statement about the handoff.
                </p>
              )}
              {!!inquiry.history.length && (
                <section
                  className="space-y-3"
                  aria-label="Handoff status history"
                >
                  <h3 className="font-semibold">Recent status changes</h3>
                  <ol className="space-y-2 border-l border-gc-divider pl-4">
                    {inquiry.history.map((item) => (
                      <li key={item.version}>
                        <p>
                          {exchangeHandoffActionLabels[item.action] ??
                            "Handoff updated"}
                        </p>
                        <p className="text-sm text-gc-muted">
                          <RegionalTime value={item.at} />
                        </p>
                      </li>
                    ))}
                  </ol>
                  {inquiry.history.length === 20 && (
                    <p className="text-sm text-gc-muted">
                      Showing the latest 20 status changes.
                    </p>
                  )}
                </section>
              )}
              {inquiry.listing && (
                <Link
                  prefetch={false}
                  className="inline-flex min-h-11 items-center underline"
                  href={`/platform/exchange/${inquiry.listing.id}`}
                >
                  Open current listing
                </Link>
              )}
              <ExchangeHandoffActions
                key={`${inquiry.id}:${inquiry.version}`}
                owner={user.id}
                inquiry={inquiry}
              />
              <div className="flex flex-wrap gap-4">
                {inquiry.reportable && (
                  <Link
                    prefetch={false}
                    className="inline-flex min-h-11 items-center underline"
                    href={reportEntryHref("EXCHANGE_INQUIRY", inquiry.id)}
                  >
                    Report this inquiry
                  </Link>
                )}
                {inquiry.pickupReportable && (
                  <Link
                    prefetch={false}
                    className="inline-flex min-h-11 items-center underline"
                    href={reportEntryHref("EXCHANGE_HANDOFF", inquiry.id)}
                  >
                    Report this agreed pickup plan
                  </Link>
                )}
              </div>
            </article>
          ) : null}
        </PrivateSnapshotGuard>
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
