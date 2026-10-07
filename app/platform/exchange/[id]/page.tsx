import { InterchurchHelpPage } from "@/components/platform/interchurch-help-page";
import { ExchangeInquiryEntry } from "@/components/platform/exchange-handoff-page";
import { accountEntryHref } from "@/lib/platform/account-entry";
import type { Metadata } from "next";
import { publicResourceMetadata } from "@/lib/platform/share-metadata";
import { publicPageIdentity, type PublicQuery } from "@/lib/indexing-policy";
import { PublicStructuredData } from "@/components/platform/public-structured-data";
import Link from "next/link";
import { exchangeReturnHref } from "@/lib/platform/exchange-navigation";
import { PlatformShell } from "@/components/platform/platform-shell";
import { TopicReadBoundary } from "@/components/platform/topic-read-boundary";
import { PrivateSnapshotGuard } from "@/components/platform/private-snapshot-guard";
import { RelationshipControls } from "@/components/platform/relationship-controls";
import { ExchangeFavoriteButton } from "@/components/platform/exchange-saved-controls";
import { PublicShareControls } from "@/components/platform/public-share-controls";
import { SavePostControl } from "@/components/platform/save-post-control";
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
export async function generateMetadata({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<PublicQuery>;
}): Promise<Metadata> {
  return publicResourceMetadata(
    "listing",
    (await params).id,
    await searchParams
  );
}
export default async function Page({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<PublicQuery>;
}) {
  const user = await getCurrentPlatformUser(),
    { id } = await params,
    path = `/platform/exchange/${encodeURIComponent(id)}`;
  const query = await searchParams;
  const returnHref = exchangeReturnHref(query.returnTo);
  let content;
  try {
    const result = await exchangeListingPage(id),
      listing = result.listing,
      owner = listing.ownerChurch ?? listing.owner;
    if (listing.helpPurpose)
      return (
        <PlatformShell user={user} signInReturnTo={path}>
          <InterchurchHelpPage
            owner={user?.id ?? null}
            view="request"
            id={id}
          />
        </PlatformShell>
      );
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
            This listing is reserved. An owner-set status alone is not a pickup
            agreement. Participants must open their private handoff to check its
            actual agreement.
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
                {result.structuredNeed
                  ? ". Open Need actions for the exact deadline and remaining quantities."
                  : ". This date does not automatically close the listing or create a booking."}
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
        {listing.intent === "CHURCH_NEED" && (
          <Link prefetch={false} className="gc-button" href={`${path}/needs`}>
            Open need actions and progress
          </Link>
        )}
        {!result.structuredNeed &&
          (user ? (
            <ExchangeInquiryEntry owner={user.id} listingId={id} />
          ) : (
            <section className="space-y-3" aria-label="Listing inquiry">
              <h2 className="text-2xl">Ask about this listing</h2>
              <p>
                Sign in to check whether a private inquiry is available to your
                account. The listing owner’s contact choices still apply.
              </p>
              <Link
                prefetch={false}
                className="gc-button"
                href={accountEntryHref("join", path, "account")}
              >
                Sign in to ask about this listing
              </Link>
              <p className="text-sm">
                Signing in does not send an inquiry or reserve this listing.
              </p>
            </section>
          ))}
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
        {listing.audience === "PUBLIC" &&
          (listing.state === "ACTIVE" || listing.state === "RESERVED") && (
            <PublicShareControls
              key={`${user?.id ?? "guest"}:listing:${listing.id}`}
              kind="listing"
              id={listing.id}
              accountId={user?.id ?? null}
            />
          )}
        <SavePostControl
          key={`${user?.id ?? "guest"}:${listing.id}`}
          postId={listing.id}
          resourceKind="exchangeListing"
          accountId={user?.id ?? null}
        />
        {user && result.canSave && (
          <ExchangeFavoriteButton
            owner={user.id}
            listingId={listing.id}
            favorite={result.favorite}
          />
        )}
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
    content = user ? (
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
        owner={null}
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
    <PlatformShell user={user} signInReturnTo={path}>
      {!publicPageIdentity(path, query).filtered && (
        <PublicStructuredData kind="listing" id={id} />
      )}
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
