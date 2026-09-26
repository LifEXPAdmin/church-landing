import Link from "next/link";
import {
  SUPPORT_INTAKE_NOTE,
  supportCategories,
  type SupportSnapshot
} from "@/lib/platform/support-types";
import { SupportForm, type SupportFormPrivacy } from "./support-form";
import {
  PortalCard,
  PortalEmpty,
  PortalHelpContact,
  portalLinkClass
} from "./portal-ui";
import {
  SupportNavigation,
  SupportEligibility
} from "./support-list-presentation";

export function SupportIntakePresentation({
  snapshot: s,
  churchId,
  privacy
}: {
  snapshot: SupportSnapshot;
  churchId?: string;
  privacy: SupportFormPrivacy;
}) {
  return (
    <div className="space-y-6">
      {privacy.visible && (
        <>
          <SupportNavigation staff={s.staff} />
          <SupportEligibility adult={s.viewer.adult} />
        </>
      )}
      <PortalCard title="A little help, with a clear audience">
        {privacy.visible && (
          <>
            <p className="text-gc-muted">{SUPPORT_INTAKE_NOTE}</p>
            <p className="text-sm text-gc-muted">
              This is not an emergency, pastoral care or independent complaints
              service. If a concern involves your church representative, use the
              direct God’s Churches contact rather than sharing it with that
              representative. Our published contact is Andrew; it is not an
              independent route for a complaint about Andrew.
            </p>
            {s.churches.length > 0 && (
              <div>
                <p className="text-sm text-gc-muted">
                  Choose the context before writing. Changing it opens a fresh
                  form.
                </p>
                <div className="flex flex-wrap gap-4">
                  <Link className={portalLinkClass} href="/platform/help/new">
                    General account or website
                  </Link>
                  {s.churches.map((ch) => (
                    <Link
                      className={portalLinkClass}
                      key={ch.id}
                      href={`/platform/help/new?churchId=${encodeURIComponent(ch.id)}`}
                    >
                      {ch.name} (
                      {ch.state === "PENDING"
                        ? "pending connection"
                        : "your church"}
                      )
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
        {s.intake.available && s.intake.recipient ? (
          <>
            {privacy.visible && (
              <>
                <p className="rounded-xl border border-gc-action p-4 text-gc-text">
                  Recipient: {s.intake.recipient.name}, your God’s Churches
                  support owner. Only you and this assigned owner can read the
                  request at first. A church representative is not automatically
                  included.
                </p>
                {!s.viewer.verified && (
                  <p className="text-sm text-gc-muted">
                    Until your email is verified, you can request Account or
                    website help. This does not give access to private church
                    pages.
                  </p>
                )}
              </>
            )}
            <SupportForm
              privacy={privacy}
              owner={s.viewer.id}
              key={churchId ?? "general"}
              operation="create"
              fixed={{
                churchId: churchId ?? null,
                recipientId: s.intake.recipient.id,
                recipientVersion: s.intake.recipient.version,
                notice: s.intake.notice
              }}
              fields={[
                {
                  name: "category",
                  label: "What do you need help with?",
                  type: "select",
                  options: Object.entries(supportCategories)
                    .filter(
                      ([key]) => s.viewer.verified || key === "ACCOUNT_WEBSITE"
                    )
                    .map(([value, label]) => ({ value, label }))
                },
                {
                  name: "subject",
                  label: "Short summary",
                  min: 3,
                  max: 120
                },
                {
                  name: "description",
                  label: "What happened, and what would help?",
                  type: "textarea",
                  min: 10,
                  max: 3000
                },
                {
                  name: "consent",
                  label:
                    "I have read the notice and agree to share this request with the named God’s Churches support owner.",
                  type: "checkbox"
                }
              ]}
              button="Send request"
              caution="Up to five new requests each day. This saves an in-app request, not an email. Check My requests for replies; no response time is guaranteed."
            />
          </>
        ) : privacy.visible ? (
          <PortalEmpty>
            Private request intake is not available yet. We are completing the
            support recipient and privacy setup. Nothing can be submitted here
            for now. Use direct contact below.
          </PortalEmpty>
        ) : null}
      </PortalCard>
      <PortalHelpContact />
    </div>
  );
}
