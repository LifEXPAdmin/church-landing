import Link from "next/link";
import type { SupportSnapshot } from "@/lib/platform/support-types";
import { PortalEmpty, portalLinkClass } from "./portal-ui";
import { SupportRows } from "./regional-support-presentation";

export function SupportNavigation({
  staff
}: {
  staff: SupportSnapshot["staff"];
}) {
  return (
    <nav aria-label="Support" className="flex flex-wrap gap-x-6 gap-y-2">
      <Link className={portalLinkClass} href="/platform/help">
        Help and contacts
      </Link>
      <Link className={portalLinkClass} href="/platform/help/new">
        Get help
      </Link>
      <Link className={portalLinkClass} href="/platform/help/requests">
        My requests
      </Link>
      {staff.respond && (
        <Link className={portalLinkClass} href="/platform/help/inbox">
          Assigned inbox
        </Link>
      )}
      {staff.assign && (
        <Link className={portalLinkClass} href="/platform/help/routing">
          Assign requests
        </Link>
      )}
    </nav>
  );
}
export function SupportEligibility({ adult }: { adult: boolean }) {
  return (
    !adult && (
      <PortalEmpty>
        Private requests are for adults.{" "}
        <Link className={portalLinkClass} href="/platform/my-church">
          Review your eligibility
        </Link>{" "}
        or use direct contact without submitting a request.
      </PortalEmpty>
    )
  );
}
export function SupportListRows({
  snapshot,
  view
}: {
  snapshot: SupportSnapshot;
  view: "requests" | "inbox";
}) {
  return (
    <>
      <SupportRows rows={snapshot.rows} prefetch={false} />
      <SupportPagination
        page={snapshot.page}
        more={snapshot.more}
        base={`/platform/help/${view}`}
      />
    </>
  );
}
export function SupportPagination({
  page,
  more,
  base
}: {
  page: number;
  more: boolean;
  base: string;
}) {
  return (
    (page > 0 || more) && (
      <nav aria-label="Request pages" className="flex gap-6">
        {page > 0 && (
          <Link
            className={portalLinkClass}
            href={`${base}${base.includes("?") ? "&" : "?"}page=${page - 1}`}
          >
            Previous page
          </Link>
        )}
        {more && page < 99 && (
          <Link
            className={portalLinkClass}
            href={`${base}${base.includes("?") ? "&" : "?"}page=${page + 1}`}
          >
            Next page
          </Link>
        )}
      </nav>
    )
  );
}
