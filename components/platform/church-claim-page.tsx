import { randomUUID } from "node:crypto";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PortalError, publicChurches } from "@/lib/platform/portal";
import { readChurchClaimPage } from "@/lib/platform/church-claim-session";
import {
  authorityFields,
  projectClaimAuthority,
  claimScopes,
  claimStatusLabels
} from "@/lib/platform/church-claim-data";
import { listingFields } from "@/lib/platform/church-listing-data";
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

const pathFor = (id: string, review = false) =>
  `/platform/church-claims/${review ? "review/" : ""}${encodeURIComponent(id)}`;
const reasonField: PortalField = {
  name: "reason",
  label: "Reason shared with the representative",
  type: "textarea",
  required: true,
  maxLength: 1000,
  hint: "Keep private reviewer contact details and evidence references in the staff-only fields."
};
const confirm = (
  name: string,
  label: string,
  required = true
): PortalField => ({ name, label, required, type: "checkbox" });

export async function ChurchClaimPage({
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
  const path = create
    ? `/platform/church-claims/new${churchId ? `?churchId=${encodeURIComponent(churchId)}` : ""}`
    : id
      ? pathFor(id, review)
      : `/platform/church-claims${review ? "/review" : ""}`;
  // Private authority material must never enter Next development diagnostics.
  if (process.env.NODE_ENV !== "production")
    return (
      <PlatformShell user={null}>
        <section className="container-shell py-8">
          <PortalHeading
            title="Open the private church setup preview"
            description="Private representative setup uses the isolated production preview so development diagnostics cannot include it."
          />
        </section>
      </PlatformShell>
    );
  let snapshot;
  try {
    snapshot = await readChurchClaimPage(id, review, cursor, churchId);
  } catch (error) {
    if (error instanceof PortalError && error.status === 401)
      return (
        <PlatformShell user={null}>
          <GuestAccountPrompt next={path} reason="claim" />
        </PlatformShell>
      );
    return (
      <PlatformShell user={null}>
        <section className="container-shell space-y-4 py-8">
          <PortalHeading
            title="Church setup unavailable"
            description="This request may not be available to your account, or the service could not load it."
          />
          <Link href="/platform/church-claims" className={portalLinkClass}>
            My church setup
          </Link>
        </section>
      </PlatformShell>
    );
  }
  const eligible = snapshot.viewer.verified && snapshot.viewer.adult;
  const row = id ? snapshot.claims[0] : undefined;
  const church =
    create && churchId
      ? (await publicChurches(prisma, churchId))[0]
      : undefined;
  const search = churchSearchQuery(query);
  const matches =
    create && search
      ? (await publicChurches(prisma, undefined, undefined, search)).slice(
          0,
          20
        )
      : snapshot.matches;
  const editable =
    row && ["DRAFT", "NEEDS_INFORMATION", "REJECTED"].includes(row.status);
  const active = row?.status === "APPROVED" && !!row.activatedAt;
  const profileFields: PortalField[] = row
    ? Object.entries(listingFields).map(([name, rule]) => ({
        name: `profile_${name}`,
        label: rule.label,
        value: row.profile[name as keyof typeof row.profile],
        maxLength: rule.max,
        type:
          name === "locationModel"
            ? "select"
            : name === "publicEmail"
              ? "email"
              : name === "publicPhone"
                ? "tel"
                : ["summary", "meetingInfo", "source"].includes(name)
                  ? "textarea"
                  : "text",
        ...(name === "locationModel"
          ? {
              options: [
                { value: "NO_BUILDING", label: "No permanent building" },
                { value: "PHYSICAL", label: "Physical location" },
                { value: "ROTATING", label: "Rotating locations" }
              ]
            }
          : {}),
        ...(name === "publicEmail" || name === "publicPhone"
          ? {
              hint: "Optional. Publish only a church contact that is intended for everyone to see."
            }
          : {})
      }))
    : [];
  const base = { id: row?.id ?? "", expectedVersion: row?.version ?? 0 };
  return (
    <PlatformShell user={snapshot.viewer}>
      <section className="container-shell space-y-6 py-8 sm:py-10">
        <PortalHeading
          title={
            create
              ? "Set up your church"
              : review
                ? "Church representative review"
                : preview
                  ? "Preview your public church profile"
                  : "Your church setup"
          }
          description={
            review
              ? "Verify the exact person's authority and requested permissions. A title, church category or self-supplied contact alone does not establish authority."
              : "Prepare privately, verify your authority and activate only approved permissions. Existing churches keep the same page and history."
          }
        />
        <nav aria-label="Church setup" className="flex flex-wrap gap-5">
          <Link href="/platform/churches" className={portalLinkClass}>
            Find a church
          </Link>
          <Link href="/platform/church-claims" className={portalLinkClass}>
            My church setup
          </Link>
          {(snapshot.operator || snapshot.managed.length > 0) && (
            <Link
              href="/platform/church-claims/review"
              className={portalLinkClass}
            >
              Review access requests
            </Link>
          )}
        </nav>
        <PortalEligibility snapshot={snapshot} />
        {!snapshot.reviewEnabled && (
          <PortalCard title="Save your setup for later">
            <p className="text-gc-muted">
              Representative review is not accepting submissions yet. You can
              save and return to a private draft. Nothing becomes verified and
              no church permissions are granted while review is unavailable.
            </p>
          </PortalCard>
        )}
        {create ? (
          <>
            <PortalCard title="1. Find your church first">
              <ChurchSearchForm
                query={search}
                action="/platform/church-claims/new"
              />
              <p className="text-sm text-gc-muted">
                Search by name, area or website. Use an existing church page
                when it is your congregation, including a community listing.
              </p>
              {matches.map((match) => (
                <p key={match.id}>
                  <Link
                    href={`/platform/church-claims/new?churchId=${encodeURIComponent(match.id)}`}
                    className={portalLinkClass}
                  >
                    {match.name} ·{" "}
                    {[match.city, match.region, match.serviceArea]
                      .filter(Boolean)
                      .join(", ")}
                  </Link>
                </p>
              ))}
            </PortalCard>
            {churchId && !church ? (
              <PortalEmpty>
                This church is unavailable. Search for the current page.
              </PortalEmpty>
            ) : (
              <PortalCard
                title={church ? church.name : "Start a new church setup draft"}
              >
                {church && (
                  <ChurchPublicDetails church={church} detail preview />
                )}
                <p className="text-gc-muted">
                  {church?.representativeVerified
                    ? "Request additional access from the church's authorized management team. Existing permissions remain in place."
                    : "Your authority and setup details stay private while you prepare for independent review."}{" "}
                  A new church is published only after approval and your
                  explicit activation.
                </p>
                <PortalActionForm
                  key={church?.id ?? "new"}
                  claimAction="create"
                  payload={{
                    expectedVersion: 0,
                    requestKey: randomUUID(),
                    ...(church ? { churchId: church.id } : {})
                  }}
                  label="Start private church setup"
                  disabled={!eligible}
                />
              </PortalCard>
            )}
          </>
        ) : !row ? (
          <>
            {review && (
              <nav
                aria-label="Review church selection"
                className="flex flex-wrap gap-4"
              >
                {snapshot.operator && (
                  <Link
                    className={portalLinkClass}
                    href="/platform/church-claims/review"
                  >
                    All review requests
                  </Link>
                )}
                {snapshot.managed.map((item) => (
                  <Link
                    className={portalLinkClass}
                    key={item.id}
                    href={`/platform/church-claims/review?churchId=${encodeURIComponent(item.id)}`}
                  >
                    {item.name}
                  </Link>
                ))}
              </nav>
            )}
            {!review && (
              <Link
                className={portalLinkClass}
                href="/platform/church-claims/new"
              >
                Start church setup or request access
              </Link>
            )}
            {snapshot.claims.length ? (
              snapshot.claims.map((item) => (
                <PortalCard
                  key={item.id}
                  title={item.profile.name || "Untitled church setup"}
                >
                  <p className="text-gc-muted">
                    {claimStatusLabels[item.status]}
                    {item.activatedAt ? " · Activated" : ""}
                  </p>
                  <Link
                    className={portalLinkClass}
                    href={pathFor(item.id, review)}
                  >
                    Open {review ? "request" : "private setup"}
                  </Link>
                </PortalCard>
              ))
            ) : (
              <PortalEmpty>
                {review
                  ? "No requests are available in this view. Select a church when needed."
                  : "You have no saved church setup requests yet."}
              </PortalEmpty>
            )}
            {snapshot.moreCursor && (
              <Link
                className={portalLinkClass}
                href={`${path}?${new URLSearchParams({ cursor: snapshot.moreCursor, ...(churchId ? { churchId } : {}) })}`}
              >
                Older requests
              </Link>
            )}
          </>
        ) : (
          <>
            <PortalCard title={claimStatusLabels[row.status]}>
              <p className="text-gc-muted">
                {row.status === "REVOKED"
                  ? "Permissions issued by this request have ended. The public church page and unrelated permissions remain."
                  : row.activatedAt
                    ? "This request has been activated. Current permissions are checked whenever you use a church tool."
                    : "Your draft, contact details and review evidence are private. Saving or approval alone does not publish a church or activate permissions."}
              </p>
              {row.reviewReason && (
                <p className="whitespace-pre-wrap text-gc-text">
                  {row.reviewReason}
                </p>
              )}
              <p className="text-sm text-gc-muted">
                Updated{" "}
                {new Date(row.updatedAt).toLocaleString("en-US", {
                  timeZone: "UTC"
                })}{" "}
                UTC
              </p>
              {row.churchId && (
                <Link
                  className={`${portalLinkClass} mr-5`}
                  href={`/platform/churches/${encodeURIComponent(row.churchId)}`}
                >
                  View the existing church page
                </Link>
              )}
              {!preview && !review && (
                <Link
                  className={portalLinkClass}
                  href={pathFor(row.id) + "?preview=1"}
                >
                  Preview saved public profile
                </Link>
              )}
              {row.scopes.length > 0 && (
                <h3 className="font-semibold text-gc-text">
                  Requested permissions
                </h3>
              )}
              <ul className="list-disc space-y-2 pl-5 text-gc-muted">
                {row.scopes.map((scope) => (
                  <li key={scope}>{claimScopes[scope]}</li>
                ))}
              </ul>
            </PortalCard>
            {(preview || review || row.status === "APPROVED") && (
              <PortalCard title="Public profile preview">
                <h3 className="break-words text-xl font-semibold text-gc-text">
                  {row.profile.name || "Untitled church"}
                </h3>
                <ChurchPublicDetails
                  church={{
                    id: row.churchId ?? row.id,
                    slug: "",
                    representativeVerified:
                      active &&
                      (snapshot.currentScopes.includes(
                        "MANAGE_CHURCH_PROFILE"
                      ) ||
                        snapshot.currentScopes.includes(
                          "MANAGE_CHURCH_ACCESS"
                        )),
                    ...row.profile
                  }}
                  detail
                  preview
                />
                <p className="text-sm text-gc-muted">
                  Only these public profile fields will appear on the church
                  page when you explicitly publish them. Your representative
                  contact and preparation notes are excluded.
                </p>
                {preview && (
                  <Link className={portalLinkClass} href={pathFor(row.id)}>
                    Return to private setup
                  </Link>
                )}
              </PortalCard>
            )}
            {review ? (
              <>
                {snapshot.canonical && (
                  <PortalCard title="Current public church information">
                    <h3 className="break-words text-xl font-semibold text-gc-text">
                      {snapshot.canonical.name}
                    </h3>
                    <ChurchPublicDetails
                      church={snapshot.canonical}
                      detail
                      preview
                    />
                  </PortalCard>
                )}
                <PortalCard title="Private representative information">
                  <p className="text-gc-text">
                    {snapshot.claimant?.name} (@{snapshot.claimant?.username})
                  </p>
                  <p className="break-all text-gc-muted">
                    Private account email: {snapshot.claimant?.email}
                  </p>
                  <dl className="space-y-4">
                    {Object.entries(authorityFields).map(([name, rule]) => (
                      <div key={name}>
                        <dt className="font-semibold text-gc-text">
                          {rule.label}
                        </dt>
                        <dd className="whitespace-pre-wrap break-words text-gc-muted">
                          {row.authority[name as keyof typeof row.authority] ||
                            "Not provided"}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <p className="text-sm text-gc-muted">
                    Do not rely only on the claimant’s callback number, website
                    entry or title. Find an independent trusted church channel
                    and verify the account, role and exact requested
                    permissions. Keep evidence minimal; do not request identity
                    documents or call recordings here.
                  </p>
                </PortalCard>
                {row.status === "SUBMITTED" && (
                  <PortalCard title="Record the independent decision">
                    <PortalActionForm
                      claimAction="review"
                      payload={base}
                      disabled={!snapshot.reviewEnabled}
                      label="Save review decision"
                      fields={[
                        {
                          name: "action",
                          label: "Decision",
                          type: "select",
                          options: [
                            {
                              value: "NEEDS_INFORMATION",
                              label: "Needs more information"
                            },
                            { value: "REJECT", label: "Not approved" },
                            {
                              value: "APPROVE",
                              label: "Approve exact requested permissions"
                            }
                          ]
                        },
                        reasonField,
                        {
                          name: "trustedSource",
                          label:
                            "Independent trusted channel and how it was established (staff only)",
                          type: "textarea",
                          maxLength: 1000,
                          hint: "Required for approval. Use a minimal reference, not a copy of private documents."
                        },
                        {
                          name: "confirmingPerson",
                          label:
                            "Confirming person and church role (staff only)",
                          maxLength: 300
                        },
                        {
                          name: "checkedAt",
                          label: "Independent check date (YYYY-MM-DD)",
                          maxLength: 10
                        },
                        confirm(
                          "independentConfirmed",
                          "For approval: I independently established authority through a trusted church channel.",
                          false
                        ),
                        confirm(
                          "scopeConfirmed",
                          "For approval: I confirmed this exact account and each requested permission.",
                          false
                        ),
                        ...(!row.churchId
                          ? [
                              confirm(
                                "distinctConfirmed",
                                "For approval: I checked matching churches and confirmed this is a distinct congregation.",
                                false
                              )
                            ]
                          : [])
                      ]}
                    />
                  </PortalCard>
                )}
                {active && (
                  <PortalCard title="End permissions from this request">
                    <PortalActionForm
                      claimAction="revoke"
                      payload={base}
                      label="Revoke this request's permissions"
                      fields={[reasonField]}
                      confirmation="Current sessions will lose these permissions on their next request."
                    />
                  </PortalCard>
                )}
              </>
            ) : (
              <>
                {!preview && editable && (
                  <PortalCard title="2. Your authority and public profile draft">
                    <PortalActionForm
                      claimAction="save"
                      payload={{
                        ...base,
                        expectedChurchVersion: snapshot.canonical?.version ?? 0
                      }}
                      disabled={!eligible}
                      label="Save private details and preview"
                      description="All fields can be saved unfinished. Private authority details are used only for this review. A phone call is optional; email, video or another accessible method can be requested."
                      fields={[
                        ...Object.entries(authorityFields).map(
                          ([name, rule]): PortalField => ({
                            name: `authority_${name}`,
                            label: `${rule.label} (private)`,
                            maxLength: rule.max,
                            value:
                              row.authority[name as keyof typeof row.authority],
                            type:
                              name === "method"
                                ? "select"
                                : ["availability", "reference"].includes(name)
                                  ? "textarea"
                                  : "text",
                            ...(name === "method"
                              ? {
                                  options: [
                                    { value: "PHONE", label: "Phone call" },
                                    { value: "EMAIL", label: "Email" },
                                    { value: "VIDEO", label: "Video call" },
                                    {
                                      value: "OTHER",
                                      label: "Another accessible method"
                                    }
                                  ]
                                }
                              : {})
                          })
                        ),
                        ...Object.entries(claimScopes).map(([name, label]) => ({
                          name,
                          label,
                          type: "checkbox" as const,
                          value: row.scopes.includes(
                            name as keyof typeof claimScopes
                          )
                        })),
                        ...(row.churchId
                          ? [
                              confirm(
                                "dispute",
                                "This is an authority dispute or recovery request that requires Godschurches review.",
                                false
                              )
                            ]
                          : []),
                        ...profileFields
                      ]}
                    />
                  </PortalCard>
                )}
                {row.status === "DRAFT" && (
                  <PortalCard title="3. Submit for representative review">
                    {matches.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-gc-muted">
                          Check these possible matches before requesting a new
                          church:
                        </p>
                        {matches.map((item) => (
                          <p key={item.id}>
                            <Link
                              className={portalLinkClass}
                              href={`/platform/church-claims/new?churchId=${encodeURIComponent(item.id)}`}
                            >
                              {item.name}
                            </Link>
                          </p>
                        ))}
                      </div>
                    )}
                    <PortalActionForm
                      claimAction="submit"
                      payload={base}
                      disabled={!eligible || !snapshot.reviewEnabled}
                      label="Submit private review request"
                      fields={[
                        confirm(
                          "searchedConfirmed",
                          "I checked for the existing church and chose the correct congregation."
                        ),
                        confirm(
                          "contactConsent",
                          "I consent to private contact for this authority review. These details are not public church contact details."
                        )
                      ]}
                    />
                  </PortalCard>
                )}
                {!preview && !["WITHDRAWN", "REVOKED"].includes(row.status) && (
                  <PortalCard title="4. Optional preparation while you wait">
                    <PortalActionForm
                      claimAction="prepare"
                      payload={base}
                      label="Save private preparation"
                      description="Draft ministry names, vacant positions and reporting lines, calendar preferences, meeting information or a welcome post here. These are private notes. Saving them does not appoint people, invite anyone or publish an event or post."
                      fields={[
                        {
                          name: "preparation",
                          label: "Private preparation notes",
                          type: "textarea",
                          maxLength: 5000,
                          value: row.preparation
                        }
                      ]}
                    />
                  </PortalCard>
                )}
                {row.status === "APPROVED" && !active && (
                  <PortalCard title="5. Review and activate approved access">
                    <PortalActionForm
                      claimAction="activate"
                      payload={base}
                      disabled={!snapshot.reviewEnabled}
                      label="Activate approved church access"
                      description="Activation adds your approved connection and exact approved permissions. Another Home Church or pending connection must be left or withdrawn by you first. Directory sharing stays separate."
                      fields={[
                        confirm(
                          "accessConfirmed",
                          "I want to activate the approved church connection and permissions."
                        ),
                        confirm(
                          "publicConfirmed",
                          row.churchId
                            ? "Also replace the existing church profile with my public preview above (optional)."
                            : "I confirm the preview and want to publish this new church page.",
                          !row.churchId
                        )
                      ]}
                    />
                  </PortalCard>
                )}
                {active && (
                  <PortalCard title="Your current church tools">
                    <div className="flex flex-wrap gap-4">
                      <Link
                        className={portalLinkClass}
                        href="/platform/my-church"
                      >
                        My church
                      </Link>
                      {snapshot.currentScopes.includes(
                        "MANAGE_CHURCH_ACCESS"
                      ) && (
                        <Link
                          className={portalLinkClass}
                          href="/platform/church-claims/review"
                        >
                          Review management access
                        </Link>
                      )}
                      {(snapshot.currentScopes.includes(
                        "EDIT_CHURCH_CALENDAR"
                      ) ||
                        snapshot.currentScopes.includes(
                          "PUBLISH_CHURCH_EVENTS"
                        )) && (
                        <Link
                          className={portalLinkClass}
                          href={`/platform/churches/${encodeURIComponent(row.churchId!)}/calendar`}
                        >
                          Manage church calendar and events
                        </Link>
                      )}
                      {snapshot.currentScopes.includes("MANAGE_STRUCTURE") && (
                        <Link
                          className={portalLinkClass}
                          href={`/platform/churches/${encodeURIComponent(row.churchId!)}/structure`}
                        >
                          Manage structure
                        </Link>
                      )}
                      {snapshot.currentScopes.includes(
                        "MANAGE_CHURCH_ACCESS"
                      ) && (
                        <Link
                          className={portalLinkClass}
                          href={`/platform/churches/${encodeURIComponent(row.churchId!)}/access`}
                        >
                          Manage church permissions
                        </Link>
                      )}
                      {snapshot.currentScopes.includes(
                        "REVIEW_CONNECTIONS"
                      ) && (
                        <Link
                          className={portalLinkClass}
                          href={`/platform/churches/${encodeURIComponent(row.churchId!)}/review`}
                        >
                          Review connections
                        </Link>
                      )}
                      <Link className={portalLinkClass} href="/platform/help">
                        Church help and coordinators
                      </Link>
                    </div>
                  </PortalCard>
                )}
                {active && snapshot.canManageProfile && (
                  <PortalCard title="Manage the public church profile">
                    {!preview && (
                      <PortalActionForm
                        claimAction="profile-save"
                        payload={{
                          ...base,
                          expectedChurchVersion:
                            snapshot.canonical?.version ?? 0
                        }}
                        label="Save profile changes and preview"
                        fields={profileFields}
                      />
                    )}
                    {preview && (
                      <PortalActionForm
                        claimAction="profile-publish"
                        payload={base}
                        label="Publish profile preview"
                        fields={[
                          confirm(
                            "publicConfirmed",
                            "I confirm these details are intended to be public on the church page."
                          )
                        ]}
                      />
                    )}
                  </PortalCard>
                )}
                {!["WITHDRAWN", "REVOKED"].includes(row.status) && (
                  <PortalCard
                    title={
                      active
                        ? "End your approved access"
                        : "Withdraw this request"
                    }
                  >
                    <PortalActionForm
                      claimAction={active ? "revoke" : "withdraw"}
                      payload={base}
                      label={
                        active
                          ? "End permissions from this request"
                          : "Withdraw request"
                      }
                      fields={[
                        {
                          ...reasonField,
                          label: "Reason",
                          hint: "Explain why you are ending this request."
                        }
                      ]}
                      description={
                        active
                          ? "Ends only permissions issued by this request. Your church connection and public church page remain; use My church to leave separately."
                          : "Use this if details need to change while a request is pending. Start a fresh private request after withdrawal."
                      }
                    />
                  </PortalCard>
                )}
              </>
            )}
            <PortalCard title="Request history">
              {snapshot.history.length ? (
                <ol className="space-y-4">
                  {snapshot.history.map((item, index) => (
                    <li key={`${item.createdAt}-${index}`}>
                      <p className="font-semibold text-gc-text">
                        {item.action.replaceAll("_", " ")} ·{" "}
                        {new Date(item.createdAt).toLocaleString("en-US", {
                          timeZone: "UTC"
                        })}{" "}
                        UTC
                      </p>
                      <p className="whitespace-pre-wrap text-gc-muted">
                        {item.reason}
                      </p>
                      {review && "evidence" in item && (
                        <ReviewEvidence value={item.evidence} />
                      )}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-gc-muted">No review decisions yet.</p>
              )}
              <p className="text-sm text-gc-muted">
                Shows the latest 100 events.
              </p>
            </PortalCard>
          </>
        )}
      </section>
    </PlatformShell>
  );
}

function ReviewEvidence({ value }: { value: unknown }) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const evidence = value as Record<string, unknown>;
  const details = [
    ["Independent source", evidence.trustedSource],
    ["Confirming person and role", evidence.confirmingPerson],
    ["Checked on", evidence.checkedAt],
    ...(evidence.authority
      ? Object.entries(projectClaimAuthority(evidence.authority)).map(
          ([key, entry]) => [
            `Submitted ${authorityFields[key as keyof typeof authorityFields].label.toLowerCase()}`,
            entry
          ]
        )
      : [])
  ];
  return (
    <dl className="mt-3 space-y-2 text-sm">
      {details
        .filter(([, entry]) => typeof entry === "string" && entry)
        .map(([label, entry]) => (
          <div key={String(label)}>
            <dt className="font-semibold text-gc-text">{String(label)}</dt>
            <dd className="whitespace-pre-wrap break-words text-gc-muted">
              {String(entry)}
            </dd>
          </div>
        ))}
    </dl>
  );
}
