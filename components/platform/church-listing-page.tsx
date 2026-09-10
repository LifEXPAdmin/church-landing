import { randomUUID } from "node:crypto";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PortalError, publicChurches } from "@/lib/platform/portal";
import { readChurchListingPage } from "@/lib/platform/church-listing-session";
import {
  listingFields,
  listingStatusLabels
} from "@/lib/platform/church-listing-data";
import { churchSearchQuery } from "@/lib/platform/church-search";
import { PlatformShell } from "./platform-shell";
import { GuestAccountPrompt } from "./guest-account-prompt";
import { PortalActionForm, type PortalField } from "./portal-action-form";
import { ChurchPublicDetails } from "./church-public-details";
import { ChurchSearchForm } from "./church-search-form";
import { PortalEligibility } from "./portal-member-views";
import {
  PortalCard,
  PortalEmpty,
  PortalHeading,
  portalLinkClass
} from "./portal-ui";

const listingPath = (id: string) =>
  `/platform/church-listings/${encodeURIComponent(id)}`;
export async function ChurchListingPage({
  id,
  create = false,
  review = false,
  churchId,
  preview = false,
  query = "",
  cursor
}: {
  id?: string;
  create?: boolean;
  review?: boolean;
  churchId?: string;
  preview?: boolean;
  query?: string;
  cursor?: string;
}) {
  const path = review
    ? `/platform/operator/listings${id ? `/${id}` : ""}`
    : create
      ? `/platform/church-listings/new${churchId ? `?churchId=${encodeURIComponent(churchId)}` : ""}`
      : id
        ? listingPath(id)
        : "/platform/church-listings";
  if (process.env.NODE_ENV !== "production")
    return (
      <PlatformShell user={null}>
        <section className="container-shell py-8">
          <PortalHeading
            title="Open the private listing preview"
            description="Private church drafts use the isolated production preview so development diagnostics cannot include them."
          />
        </section>
      </PlatformShell>
    );
  let snapshot;
  try {
    snapshot = await readChurchListingPage(id, review, cursor);
  } catch (error) {
    if (error instanceof PortalError && error.status === 401)
      return (
        <PlatformShell user={null}>
          <GuestAccountPrompt next={path} reason="listing" />
        </PlatformShell>
      );
    return (
      <PlatformShell user={null}>
        <section className="container-shell py-8">
          <PortalHeading
            title="Listing workspace unavailable"
            description="This page may not be available to your account, or the service could not load it."
          />
          <Link href="/platform/church-listings" className={portalLinkClass}>
            My listing drafts
          </Link>
        </section>
      </PlatformShell>
    );
  }
  const eligible = snapshot.viewer.verified && snapshot.viewer.adult;
  const row = snapshot.submissions[0];
  const church = churchId
    ? (await publicChurches(prisma, churchId))[0]
    : undefined;
  const queryValue = churchSearchQuery(query);
  const matches =
    create && queryValue
      ? (await publicChurches(prisma, undefined, undefined, queryValue)).slice(
          0,
          20
        )
      : snapshot.matches;
  const title = create
    ? churchId
      ? "Suggest a church correction"
      : "Add a church"
    : id
      ? preview
        ? "Preview the public listing"
        : review
          ? "Review a church submission"
          : "Your private church draft"
      : review
        ? "Church listing review"
        : "Your church listing drafts";
  const links = snapshot.canReview
    ? [{ href: "/platform/operator/listings", label: "Review church listings" }]
    : [];
  return (
    <PlatformShell user={snapshot.viewer}>
      <section className="container-shell space-y-6 py-8 sm:py-10">
        <PortalHeading
          title={title}
          description={
            review
              ? "Review only public listing facts. This workflow never verifies a representative or grants church access."
              : "Help people find a church. Your draft stays private until you confirm its public preview. Creating a listing does not give you management access."
          }
        />
        <nav aria-label="Listing workspace" className="flex flex-wrap gap-5">
          <Link href="/platform/churches" className={portalLinkClass}>
            Find a church
          </Link>
          <Link href="/platform/church-listings" className={portalLinkClass}>
            My listing drafts
          </Link>
          {links.map((link) => (
            <Link key={link.href} href={link.href} className={portalLinkClass}>
              {link.label}
            </Link>
          ))}
        </nav>
        <PortalEligibility snapshot={snapshot} />
        {create ? (
          <>
            {churchId ? (
              church ? (
                <PortalCard title={church.name}>
                  <ChurchPublicDetails church={church} detail preview />
                  <PortalActionForm
                    key={church.id}
                    listingAction="create"
                    payload={{
                      expectedVersion: 0,
                      requestKey: randomUUID(),
                      kind: "CORRECTION",
                      churchId: church.id
                    }}
                    label="Start a private correction draft"
                    disabled={!eligible}
                  />
                </PortalCard>
              ) : (
                <PortalEmpty>
                  This church is unavailable. Return to the church list.
                </PortalEmpty>
              )
            ) : (
              <>
                <PortalCard title="1. Check for an existing church">
                  <ChurchSearchForm
                    query={queryValue}
                    action="/platform/church-listings/new"
                  />
                  <p className="text-sm text-gc-muted">
                    Search by name, area or public website. Open a matching
                    church to suggest a correction instead of making another
                    page.
                  </p>
                  {matches.map((match) => (
                    <div key={match.id}>
                      <Link
                        href={`/platform/churches/${match.id}`}
                        className={portalLinkClass}
                      >
                        {match.name}
                      </Link>
                      <p className="text-sm text-gc-muted">
                        {[
                          match.city,
                          match.region,
                          match.country,
                          match.serviceArea
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                  ))}
                  {queryValue && !matches.length && (
                    <p className="text-gc-muted">
                      No matches for this search. Check other known names or the
                      church’s website before continuing.
                    </p>
                  )}
                </PortalCard>
                {queryValue && (
                  <PortalCard title="2. Add a community listing">
                    <p className="text-gc-muted">
                      Help people find this church. This page will be marked
                      unofficial until a representative is verified.
                    </p>
                    <PortalActionForm
                      key="community"
                      listingAction="create"
                      payload={{
                        expectedVersion: 0,
                        requestKey: randomUUID(),
                        kind: "COMMUNITY"
                      }}
                      label="Start a private community draft"
                      disabled={!eligible}
                    />
                  </PortalCard>
                )}
              </>
            )}
          </>
        ) : id && row ? (
          <>
            <p className="font-semibold text-gc-accent">
              {listingStatusLabels[row.status]}
            </p>
            {row.reviewReason && (
              <PortalCard title="Review response">
                <p className="whitespace-pre-wrap text-gc-muted">
                  {row.reviewReason}
                </p>
                <Link href="/platform/help" className={portalLinkClass}>
                  Get help or ask about this decision
                </Link>
              </PortalCard>
            )}
            {preview ||
            review ||
            !["DRAFT", "NEEDS_INFORMATION", "REJECTED"].includes(row.status) ? (
              <>
                <PortalCard title={row.data.name || "Church listing preview"}>
                  <ChurchPublicDetails
                    church={{
                      ...row.data,
                      id: row.churchId ?? "preview",
                      slug: "preview",
                      communityListed:
                        snapshot.canonical?.communityListed ?? true
                    }}
                    detail
                    preview
                  />
                  <p className="text-sm text-gc-muted">
                    Only the details above are included in the public listing.
                    Your account email, draft history and review responses are
                    private. Public contacts are community information, not
                    verified evidence of authority.
                  </p>
                </PortalCard>
                {snapshot.canonical && (
                  <details className="rounded-xl border border-gc-divider p-5">
                    <summary className="min-h-11 cursor-pointer font-semibold">
                      Compare the current public page
                    </summary>
                    <ChurchPublicDetails
                      church={snapshot.canonical}
                      detail
                      preview
                    />
                  </details>
                )}
                {matches.length > 0 && (
                  <PortalCard title="Possible existing churches">
                    <p className="text-gc-muted">
                      Open these matches before submitting. A possible duplicate
                      is sent for review; it is never merged automatically.
                    </p>
                    {matches.map((match) => (
                      <Link
                        key={match.id}
                        href={`/platform/churches/${match.id}`}
                        className={`${portalLinkClass} block`}
                      >
                        {match.name}{" "}
                        {[match.city, match.region, match.country]
                          .filter(Boolean)
                          .join(", ")}
                      </Link>
                    ))}
                  </PortalCard>
                )}
                {!review &&
                  ["DRAFT", "NEEDS_INFORMATION", "REJECTED"].includes(
                    row.status
                  ) && (
                    <PortalCard
                      title={
                        row.kind === "CORRECTION"
                          ? "Send this correction for review"
                          : "Publish or submit for review"
                      }
                    >
                      <PortalActionForm
                        listingAction="publish"
                        payload={{ expectedVersion: row.version, id: row.id }}
                        fields={[
                          {
                            name: "searchedConfirmed",
                            label:
                              "I checked for an existing church or confirmed the correct church for this correction.",
                            type: "checkbox",
                            required: true
                          },
                          {
                            name: "publicConfirmed",
                            label:
                              "The preview is intended to be public. Contacts are public church contacts, and no private roster or personal address is included.",
                            type: "checkbox",
                            required: true
                          }
                        ]}
                        label={
                          row.kind === "CORRECTION"
                            ? "Submit correction"
                            : "Confirm public listing"
                        }
                        disabled={!eligible}
                      />
                      <Link
                        href={listingPath(row.id)}
                        className={portalLinkClass}
                      >
                        Edit this draft
                      </Link>
                    </PortalCard>
                  )}
              </>
            ) : (
              <PortalCard title="2. Enter known public details">
                <p className="text-sm text-gc-muted">
                  Add a name and either a ministry service area or a city/region
                  with its country. Everything else can stay blank. Never
                  include a private member roster or a leader’s personal
                  address. Save even an incomplete draft and return later.
                </p>
                {snapshot.canonical && (
                  <details>
                    <summary className="min-h-11 cursor-pointer">
                      Current public details — compare before saving
                    </summary>
                    <ChurchPublicDetails
                      church={snapshot.canonical}
                      detail
                      preview
                    />
                  </details>
                )}
                <PortalActionForm
                  listingAction="save"
                  payload={{
                    expectedVersion: row.version,
                    id: row.id,
                    ...(snapshot.canonical
                      ? { expectedChurchVersion: snapshot.canonical.version! }
                      : {})
                  }}
                  fields={Object.entries(listingFields).map(
                    ([name, field]): PortalField => ({
                      name,
                      label: field.label,
                      value: row.data[name as keyof typeof row.data],
                      maxLength: field.max,
                      type:
                        name === "locationModel"
                          ? "select"
                          : ["summary", "meetingInfo", "source"].includes(name)
                            ? "textarea"
                            : name === "publicEmail"
                              ? "email"
                              : name === "publicPhone"
                                ? "tel"
                                : "text",
                      ...(name === "locationModel"
                        ? {
                            options: [
                              { value: "PHYSICAL", label: "Physical location" },
                              {
                                value: "ROTATING",
                                label: "Rotating locations"
                              },
                              {
                                value: "NO_BUILDING",
                                label: "No permanent building"
                              }
                            ]
                          }
                        : {}),
                      ...(name === "website"
                        ? { hint: "Use the full https:// address if known." }
                        : {})
                    })
                  )}
                  label="Save private draft and preview"
                  disabled={!eligible}
                />
              </PortalCard>
            )}
            {review && row.status === "SUBMITTED" && (
              <PortalCard title="Record a decision">
                <p className="text-sm text-gc-muted">
                  Confirm facts independently. Approving a listing does not
                  verify a representative. Your response is visible to the
                  contributor; do not include confidential evidence or unrelated
                  personal information.
                </p>
                <PortalActionForm
                  listingAction="review"
                  payload={{ expectedVersion: row.version, id: row.id }}
                  fields={[
                    {
                      name: "action",
                      label: "Decision",
                      type: "select",
                      required: true,
                      options: [
                        { value: "", label: "Choose a decision" },
                        {
                          value: "NEEDS_INFORMATION",
                          label: "Request more information"
                        },
                        { value: "REJECT", label: "Not accepted" },
                        { value: "APPROVE", label: "Approve public details" }
                      ]
                    },
                    {
                      name: "reason",
                      label: "Reason or requested information",
                      type: "textarea",
                      required: true,
                      maxLength: 1000
                    },
                    {
                      name: "distinctConfirmed",
                      label:
                        "For a new listing: I confirmed this is a distinct church or campus, including the possible matches.",
                      type: "checkbox"
                    },
                    {
                      name: "publicConfirmed",
                      label:
                        "For approval: I checked these details and confirm they are suitable for the public page.",
                      type: "checkbox"
                    }
                  ]}
                  label="Save review decision"
                />
              </PortalCard>
            )}
            {row.churchId && (
              <Link
                href={`/platform/churches/${row.churchId}`}
                className={portalLinkClass}
              >
                View the public church page
              </Link>
            )}
            {!review &&
              ["DRAFT", "SUBMITTED", "NEEDS_INFORMATION", "REJECTED"].includes(
                row.status
              ) && (
                <PortalActionForm
                  listingAction="withdraw"
                  payload={{ expectedVersion: row.version, id: row.id }}
                  label="Withdraw this submission"
                  confirmation="This ends this submission. It does not remove or edit a public church page."
                />
              )}
            {snapshot.history.length > 0 && (
              <details className="rounded-xl border border-gc-divider p-5">
                <summary className="min-h-11 cursor-pointer">
                  Submission history
                </summary>
                <ol className="space-y-4">
                  {snapshot.history.map((event, index) => (
                    <li key={index}>
                      <p className="font-semibold">
                        {listingStatusLabels[event.action] ?? event.action} ·{" "}
                        {new Date(event.createdAt).toLocaleDateString("en-US", {
                          timeZone: "UTC"
                        })}
                      </p>
                      <p className="whitespace-pre-wrap text-gc-muted">
                        {event.reason}
                      </p>
                    </li>
                  ))}
                </ol>
              </details>
            )}
          </>
        ) : (
          <>
            {!review && (
              <Link href="/platform/church-listings/new" className="gc-button">
                Add a church
              </Link>
            )}
            {snapshot.submissions.length ? (
              <ul className="grid gap-5 md:grid-cols-2">
                {snapshot.submissions.map((item) => (
                  <li key={item.id}>
                    <PortalCard
                      title={item.data.name || "Untitled private draft"}
                    >
                      <p className="text-gc-muted">
                        {item.kind === "CORRECTION"
                          ? "Correction"
                          : "Community listing"}{" "}
                        · {listingStatusLabels[item.status]}
                      </p>
                      <Link
                        href={
                          review
                            ? `/platform/operator/listings/${item.id}`
                            : listingPath(item.id)
                        }
                        className={portalLinkClass}
                      >
                        Open submission
                      </Link>
                    </PortalCard>
                  </li>
                ))}
              </ul>
            ) : (
              <PortalEmpty>
                {review
                  ? "No listing submissions are waiting for review."
                  : "You have no listing drafts yet. Search for a church before adding one."}
              </PortalEmpty>
            )}
            {snapshot.more && (
              <a
                href={`${review ? "/platform/operator/listings" : "/platform/church-listings"}?cursor=${snapshot.submissions.at(-1)!.id}`}
                className={portalLinkClass}
              >
                Older submissions
              </a>
            )}
          </>
        )}
      </section>
    </PlatformShell>
  );
}
