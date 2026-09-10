import Link from "next/link";
import type { ChurchSummary } from "@/lib/platform/portal-types";
import { portalLinkClass, PortalContactDetails } from "./portal-ui";

export function ChurchPublicDetails({
  church,
  detail = false,
  preview = false
}: {
  church: ChurchSummary;
  detail?: boolean;
  preview?: boolean;
}) {
  return (
    <div className="space-y-4 break-words">
      <div>
        <p className="inline-flex rounded-full border border-gc-divider px-3 py-1 text-sm text-gc-accent">
          {church.communityListed
            ? "Community listing · Unofficial"
            : "Church listing · Unverified"}
        </p>
        {detail && (
          <p className="mt-2 text-sm text-gc-muted">
            {church.communityListed
              ? "Added by a community member. Not yet managed by a verified church representative."
              : "Representative verification has not been completed for this listing."}{" "}
            This describes page management, not the church’s beliefs or
            legitimacy.
          </p>
        )}
      </div>
      {[church.city, church.region, church.country].filter(Boolean).length >
        0 && (
        <p className="text-gc-muted">
          {[church.city, church.region, church.country]
            .filter(Boolean)
            .join(", ")}
        </p>
      )}
      {church.serviceArea && (
        <p className="text-gc-muted">Service area: {church.serviceArea}</p>
      )}
      <p className="whitespace-pre-wrap leading-relaxed text-gc-muted">
        {church.summary || "Church information is pending."}
      </p>
      {detail && (
        <>
          <p className="text-sm text-gc-muted">
            {church.locationModel === "PHYSICAL"
              ? "Meets at a physical location"
              : church.locationModel === "ROTATING"
                ? "Meets at rotating locations"
                : "No permanent building listed"}
          </p>
          {church.website && (
            <a
              className={`${portalLinkClass} break-all`}
              href={church.website}
              rel="noreferrer noopener"
            >
              Visit the church website
            </a>
          )}
          {(church.publicEmail || church.publicPhone) && (
            <div>
              <p className="text-sm font-semibold text-gc-text">
                Public church contact
              </p>
              <PortalContactDetails
                email={church.publicEmail}
                phone={church.publicPhone}
              />
            </div>
          )}
          {church.meetingInfo && (
            <div>
              <h3 className="font-semibold text-gc-text">
                Meeting information
              </h3>
              <p className="whitespace-pre-wrap text-gc-muted">
                {church.meetingInfo}
              </p>
            </div>
          )}
          {church.denomination && (
            <p className="text-gc-muted">Tradition: {church.denomination}</p>
          )}
          {church.source && (
            <p className="whitespace-pre-wrap text-sm text-gc-muted">
              Community information source: {church.source}
            </p>
          )}
          {!preview && (
            <Link
              href={`/platform/church-listings/new?churchId=${encodeURIComponent(church.id)}`}
              className={portalLinkClass}
            >
              Suggest a correction
            </Link>
          )}
        </>
      )}
    </div>
  );
}
