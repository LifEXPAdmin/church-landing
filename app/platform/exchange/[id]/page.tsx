import type { Metadata } from "next";
import Link from "next/link";
import { exchangeReturnHref } from "@/lib/platform/exchange-navigation";
import { PlatformShell } from "@/components/platform/platform-shell";
import { TopicReadBoundary } from "@/components/platform/topic-read-boundary";
import { PrivateSnapshotGuard } from "@/components/platform/private-snapshot-guard";
import { RelationshipControls } from "@/components/platform/relationship-controls";
import { ExchangePhotos } from "@/components/platform/exchange-photos";
import { RegionalWallTime } from "@/components/platform/regional-presentation";
import {
  ExchangeNavigation,
  ExchangePrice,
  ExchangeUnavailable,
  exchangeChecksum
} from "@/components/platform/exchange-page-ui";
import { getCurrentPlatformUser } from "@/lib/platform/session";
import { exchangeListingPage } from "@/lib/platform/exchange-session";
import {
  EXCHANGE_CONTACT_NOTICE,
  EXCHANGE_SERVICE_NOTICE,
  exchangeIntentLabels,
  exchangeCategoryLabels,
  exchangeConditionLabels,
  exchangeStateLabels,
  type ExchangeCategory,
  type ExchangeCondition
} from "@/lib/platform/exchange-options";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Exchange listing",
  robots: { index: false, follow: false }
};
export default async function Page({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ returnTo?: string | string[] }>;
}) {
  const user = await getCurrentPlatformUser(),
    { id } = await params,
    path = `/platform/exchange/${encodeURIComponent(id)}`;
  const returnHref = exchangeReturnHref((await searchParams).returnTo);
  let content;
  try {
    const result = await exchangeListingPage(id),
      listing = result.listing,
      owner = listing.ownerChurch ?? listing.owner;
    const ownerHref = listing.ownerChurch
      ? `/platform/churches/${listing.ownerChurch.slug}`
      : listing.owner?.username
        ? `/platform/profile/${listing.owner.username}`
        : null;
    const article = (
      <article className="space-y-5 break-words">
        <header className="space-y-3">
          <p className="gc-eyebrow">
            {exchangeIntentLabels[listing.intent]} ·{" "}
            {exchangeStateLabels[listing.state]} ·{" "}
            {listing.audience === "CHURCH"
              ? "Church audience"
              : "Public listing"}
          </p>
          <h1 className="text-4xl">{listing.title}</h1>
          <p className="text-2xl font-semibold">
            <ExchangePrice listing={listing} />
          </p>
        </header>
        {listing.state === "CLOSED" && (
          <p>
            This listing is closed. It is no longer shown among available
            listings.
          </p>
        )}
        {listing.state === "RESERVED" && (
          <p>
            The owner has marked this listing reserved. This status does not
            create a payment or a reservation agreement.
          </p>
        )}
        <p className="whitespace-pre-wrap">{listing.description}</p>
        <dl className="grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="font-semibold">Category</dt>
            <dd>
              {exchangeCategoryLabels[listing.category as ExchangeCategory]}
            </dd>
          </div>
          {listing.condition && (
            <div>
              <dt className="font-semibold">Condition</dt>
              <dd>
                {
                  exchangeConditionLabels[
                    listing.condition as ExchangeCondition
                  ]
                }
              </dd>
            </div>
          )}
          <div>
            <dt className="font-semibold">Coarse area</dt>
            <dd>{listing.placeLabel}</dd>
          </div>
          <div>
            <dt className="font-semibold">Owner</dt>
            <dd>{owner?.name}</dd>
          </div>
        </dl>
        {(listing.intent === "WANTED" || listing.intent === "CHURCH_NEED") && (
          <section className="space-y-3" aria-label="Item request">
            <h2 className="text-2xl">Requested items</h2>
            <p className="whitespace-pre-wrap">{listing.requestedItems}</p>
            {listing.neededBy && (
              <p>
                Needed by{" "}
                <time dateTime={listing.neededBy}>
                  <RegionalWallTime value={listing.neededBy} />
                </time>
                . This date does not automatically close the listing or create a
                booking.
              </p>
            )}
          </section>
        )}
        {listing.intent === "SERVICE" && (
          <section className="space-y-3" aria-label="Service details">
            <dl className="space-y-3">
              {(
                [
                  ["Service area", listing.serviceArea],
                  ["Availability", listing.availability],
                  ["Self-stated qualifications", listing.qualifications]
                ] as const
              ).map(([label, value]) => (
                <div key={label}>
                  <dt className="font-semibold">{label}</dt>
                  <dd className="whitespace-pre-wrap">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="rounded-xl border border-gc-divider p-4 text-sm">
              {EXCHANGE_SERVICE_NOTICE}
            </p>
          </section>
        )}
        <ExchangePhotos
          listingId={listing.id}
          accountId={user?.id ?? null}
          version={listing.version}
        />
        <section
          className="space-y-3 rounded-xl border border-gc-divider p-4"
          aria-label="Owner and listing safety"
        >
          <h2 className="text-2xl">Owner and contact choices</h2>
          <p>{EXCHANGE_CONTACT_NOTICE}</p>
          {ownerHref && (
            <Link
              prefetch={false}
              className="gc-button gc-button-quiet"
              href={ownerHref}
            >
              View {owner?.name} and contact choices
            </Link>
          )}
          <p className="text-sm">
            Opening the owner’s page does not send a message, reveal contact
            details, request a connection or reserve the listing. Existing
            contact preferences and consent still apply.
          </p>
          {owner && (
            <RelationshipControls
              kind={listing.ownerChurch ? "church" : "person"}
              targetId={owner.id}
              name={owner.name}
              menuLabel="Listing safety and owner choices"
              reportTarget={{
                type: "EXCHANGE_LISTING",
                id: listing.id,
                label: "Report this listing"
              }}
            />
          )}
        </section>
        {result.canManage && (
          <Link
            prefetch={false}
            className="gc-button"
            href={`${path}/edit?${new URLSearchParams({ returnTo: returnHref })}`}
          >
            Manage this listing
          </Link>
        )}
      </article>
    );
    const readUrl = `/api/platform/exchange?view=listing&id=${encodeURIComponent(id)}`;
    content =
      listing.audience === "CHURCH" && user ? (
        <PrivateSnapshotGuard
          owner={user.id}
          url={readUrl}
          checksum={exchangeChecksum(result)}
          label="listing"
        >
          {article}
        </PrivateSnapshotGuard>
      ) : (
        <TopicReadBoundary
          owner={user?.id ?? null}
          url={readUrl}
          checksum={exchangeChecksum(result)}
          label="listing"
        >
          {article}
        </TopicReadBoundary>
      );
  } catch (error) {
    content = <ExchangeUnavailable error={error} href={path} />;
  }
  return (
    <PlatformShell user={user}>
      <section className="container-shell py-8 sm:py-10">
        <div className="mx-auto max-w-3xl space-y-6">
          <ExchangeNavigation />
          <Link
            prefetch={false}
            className="inline-flex min-h-11 items-center underline"
            href={returnHref}
          >
            Return to listing results
          </Link>
          {content}
        </div>
      </section>
    </PlatformShell>
  );
}
