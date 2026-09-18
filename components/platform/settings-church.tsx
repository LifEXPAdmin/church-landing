import Link from "next/link";
import type { SettingsContext } from "@/lib/platform/settings-context";

const states = {
  PENDING: [
    "Awaiting review",
    "Your request is pending. It does not provide an approved connection or management permissions."
  ],
  APPROVED: [
    "Approved connection",
    "Your church connection is approved. This is not certification of formal membership or a leadership appointment."
  ],
  DECLINED: [
    "Request declined",
    "Your request was declined. Review My church before making another request."
  ],
  WITHDRAWN: [
    "Request withdrawn",
    "You withdrew this request. It does not provide church access."
  ],
  LEFT: [
    "Connection ended",
    "You left this church connection. Old assignments and directory choices do not restore access if you rejoin."
  ],
  REMOVED: [
    "Connection removed",
    "This church connection was removed. Previous assignments and directory choices do not provide current access."
  ]
} as const;

export function SettingsChurch({ data }: { data: SettingsContext }) {
  const context = data.church;
  if (!context)
    return (
      <p role="status">Church choices could not be checked. Reload settings.</p>
    );
  const current = context.connections.filter(
    (c) => c.state === "APPROVED" || c.state === "PENDING"
  );
  const ended = context.connections.filter(
    (c) => c.state !== "APPROVED" && c.state !== "PENDING"
  );
  return (
    <section
      className="gc-settings mb-6 space-y-4"
      aria-label="Your church connections"
    >
      <h2 className="text-2xl">Your church connections</h2>
      {data.churchError ? (
        <p role="status">{data.churchError}</p>
      ) : !context.eligible ? (
        <p>
          Verify your email and review the adult participation requirements in
          My church before connecting. Your personal settings remain available.
        </p>
      ) : (
        <>
          {!current.length && (
            <p>
              You have no current church connection. You can keep using your
              personal settings while you find a church.
            </p>
          )}
          {[...current, ...ended].map((c) => (
            <section
              key={c.id}
              aria-label={c.name}
              className="space-y-2 rounded-xl border border-gc-divider p-4"
            >
              <h3 className="text-xl">{c.name}</h3>
              <p className="font-semibold">{states[c.state][0]}</p>
              <p>{states[c.state][1]}</p>
              {c.state === "APPROVED" && (
                <div className="flex flex-wrap gap-3">
                  <Link
                    className="gc-button gc-button-quiet"
                    href="/platform/my-church/sharing"
                  >
                    Directory and contact choices
                  </Link>
                  <Link
                    className="gc-button gc-button-quiet"
                    href={`/platform/churches/${encodeURIComponent(c.id)}/responsibilities`}
                  >
                    My roles and permissions
                  </Link>
                </div>
              )}
            </section>
          ))}
        </>
      )}
      <Link className="gc-button" href="/platform/my-church">
        Review or change my church connection
      </Link>
      <p>
        Request, withdraw and leave actions use My church. Review the effects
        there before confirming. Your personal choices never assign a role or
        change church policy.
      </p>
      <Link className="underline" href="/platform/settings/notifications">
        Personal notification preferences
      </Link>
    </section>
  );
}
