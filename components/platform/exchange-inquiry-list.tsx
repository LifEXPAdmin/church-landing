"use client";
import Link from "next/link";
import type { readExchangeHandoffs } from "@/lib/platform/exchange-handoffs";
import {
  exchangeInquiryStateLabels,
  type ExchangeInquiryState
} from "@/lib/platform/exchange-handoff-options";
import { PrivateReadSnapshot } from "./private-read-snapshot";
import { RegionalTime } from "./regional-presentation";

type Snapshot = Awaited<ReturnType<typeof readExchangeHandoffs>>;

// The server authorizes this route but serializes no participant summaries.
// Preserve the canonical read's ordering, redaction and cursor decisions.
export function ExchangeInquiryList({
  owner,
  url,
  view,
  listingId
}: {
  owner: string;
  url: string;
  view: "incoming" | "outgoing";
  listingId?: string;
}) {
  return (
    <PrivateReadSnapshot<Snapshot>
      owner={owner}
      url={url}
      label="private inquiry list"
      changedNotice="Your inquiry list changed. Reload to review current information."
    >
      {(data) => {
        const groups = new Map<string, NonNullable<Snapshot["inquiries"]>>();
        for (const row of data.inquiries ?? []) {
          const key = row.listing?.id ?? "unavailable";
          groups.set(key, [...(groups.get(key) ?? []), row]);
        }
        return (
          <div className="space-y-5">
            <nav
              className="flex flex-wrap gap-4"
              aria-label="Inquiry direction"
            >
              <Link
                prefetch={false}
                className="inline-flex min-h-11 items-center underline"
                href="/platform/exchange/handoffs?view=incoming"
                aria-current={view === "incoming" ? "page" : undefined}
              >
                Incoming
              </Link>
              <Link
                prefetch={false}
                className="inline-flex min-h-11 items-center underline"
                href="/platform/exchange/handoffs?view=outgoing"
                aria-current={view === "outgoing" ? "page" : undefined}
              >
                Outgoing
              </Link>
            </nav>
            <p>
              {view === "incoming"
                ? "Only inquiries addressed to you appear here. Other church managers’ private handoffs are excluded."
                : "Your private inquiries and agreed pickups appear here."}{" "}
              Showing up to 20 records per page.
            </p>
            {!data.inquiries?.length && (
              <p>No retained inquiries in this view.</p>
            )}
            {[...groups].map(([key, rows]) => (
              <section key={key} className="space-y-3">
                <h2 className="text-2xl">
                  {rows[0].listing?.title ?? "Unavailable sources"}
                </h2>
                <ul className="space-y-3">
                  {rows.map((row) => (
                    <li
                      key={row.id}
                      className="rounded-xl border border-gc-divider p-4"
                    >
                      <Link
                        prefetch={false}
                        className="inline-flex min-h-11 items-center font-semibold underline"
                        href={`/platform/exchange/handoffs/${row.id}`}
                      >
                        {
                          exchangeInquiryStateLabels[
                            row.state as ExchangeInquiryState
                          ]
                        }
                        {row.person ? `: ${row.person.name}` : ""}
                      </Link>
                      <p>
                        Sent <RegionalTime value={row.createdAt} />
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            {data.after && (
              <Link
                prefetch={false}
                className="gc-button gc-button-quiet"
                href={`/platform/exchange/handoffs?${new URLSearchParams({ view, after: data.after, ...(listingId ? { listingId: listingId } : {}) })}`}
              >
                Older inquiries
              </Link>
            )}
          </div>
        );
      }}
    </PrivateReadSnapshot>
  );
}
