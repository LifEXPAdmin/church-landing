import type { Metadata } from "next";
import Link from "next/link";
import { PlatformShell } from "@/components/platform/platform-shell";
import { TopicReadBoundary } from "@/components/platform/topic-read-boundary";
import { PrivateSnapshotGuard } from "@/components/platform/private-snapshot-guard";
import { RelationshipControls } from "@/components/platform/relationship-controls";
import { ExchangePhotos } from "@/components/platform/exchange-photos";
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
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentPlatformUser(),
    { id } = await params,
    path = `/platform/exchange/${encodeURIComponent(id)}`;
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
            This listing is closed. It is no longer shown among available items.
          </p>
        )}
        {listing.state === "RESERVED" && (
          <p>
            The owner has marked this item reserved. This status does not create
            a payment or a reservation agreement.
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
          <div>
            <dt className="font-semibold">Condition</dt>
            <dd>
              {exchangeConditionLabels[listing.condition as ExchangeCondition]}
            </dd>
          </div>
          <div>
            <dt className="font-semibold">Coarse pickup area</dt>
            <dd>{listing.placeLabel}</dd>
          </div>
          <div>
            <dt className="font-semibold">Owner</dt>
            <dd>{owner?.name}</dd>
          </div>
        </dl>
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
            details, request a connection or reserve the item. Existing contact
            preferences and consent still apply.
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
          <Link prefetch={false} className="gc-button" href={`${path}/edit`}>
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
          {content}
        </div>
      </section>
    </PlatformShell>
  );
}
