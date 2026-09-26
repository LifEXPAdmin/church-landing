"use client";
import Link from "next/link";
import { useLayoutEffect, useRef, useState } from "react";
import type { AdminNavigation } from "@/lib/platform/admin-types";
import type {
  AdminLookupResult,
  AdminAuditSnapshot
} from "@/lib/platform/admin-operations";
import { AdminForm } from "./admin-form";
import { SupportTime } from "./regional-support-presentation";
import { useReadVisibility } from "./read-visibility";
export function AdminPeople({ navigation }: { navigation: AdminNavigation }) {
  const [person, setPerson] = useState<AdminLookupResult["person"]>(null),
    [checked, setChecked] = useState("");
  const visible = useReadVisibility();
  const canLookup = navigation.capabilities.includes("LOOKUP_ACCOUNTS");
  const canPresent = visible && canLookup;
  const generation = useRef(0);
  const resultGeneration = generation.current;
  useLayoutEffect(() => {
    if (!canPresent) {
      generation.current++;
      setPerson(null);
      setChecked("");
    }
  }, [canPresent]);
  return (
    <div className="space-y-5">
      <h1 className="text-3xl font-semibold">People</h1>
      {canLookup ? (
        <p>
          Look up one complete username for a current operational reason.
          Private conversations, contacts and profile history are not included.
        </p>
      ) : (
        <p>Account lookup is not available with your current permissions.</p>
      )}
      <AdminForm
        owner={navigation.viewer.id}
        operation="lookup"
        fields={[
          { name: "username", label: "Complete username", min: 3, max: 40 },
          {
            name: "purpose",
            label: "Operational reason",
            type: "select",
            options: [
              { value: "SUPPORT", label: "An actual support request" },
              {
                value: "VERIFICATION",
                label: "An actual verification request"
              },
              { value: "SAFETY", label: "An actual safety case" }
            ]
          }
        ]}
        button="Look up account"
        available={canLookup}
        privacy={{ visible, currentAccess: canPresent }}
        onSaved={() => {}}
        onResult={(result) => {
          // A navigation read rechecks authority, not the target account.
          // A command may settle after concealment without restoring its
          // old private result when the account returns to this document.
          if (!canPresent || resultGeneration !== generation.current) return;
          setPerson(result.person as AdminLookupResult["person"]);
          setChecked(new Date().toISOString());
        }}
      />
      {canPresent && person && (
        <section className="space-y-3 rounded-xl border border-gc-divider p-5">
          <h2 className="text-xl font-semibold">
            {person.name} (@{person.username})
          </h2>
          <p>
            Lookup checked <SupportTime value={checked} />
          </p>
          <dl className="space-y-2">
            <div>
              <dt>Access</dt>
              <dd>{person.state}</dd>
            </div>
            <div>
              <dt>Email verification</dt>
              <dd>{person.verified ? "Verified" : "Not verified"}</dd>
            </div>
            <div>
              <dt>Adult acknowledgment</dt>
              <dd>{person.adult ? "Current" : "Not current"}</dd>
            </div>
            <div>
              <dt>Configured sign-in methods</dt>
              <dd>
                {[
                  person.passwordSignIn ? "Password" : "",
                  person.googleSignIn ? "Google" : ""
                ]
                  .filter(Boolean)
                  .join(", ") || "Unavailable"}
              </dd>
            </div>
          </dl>
        </section>
      )}
      {navigation.capabilities.includes("MANAGE_ACCOUNTS") && (
        <Link
          className="gc-button gc-button-quiet"
          href="/platform/operator/churches"
        >
          Open the existing account-access review
        </Link>
      )}
    </div>
  );
}
export function AdminChurches({ navigation }: { navigation: AdminNavigation }) {
  return (
    <div className="space-y-5">
      <h1 className="text-3xl font-semibold">Churches</h1>
      <p>
        Use the existing scoped church workflows. Each verifies its current
        permissions and source state.
      </p>
      <div className="flex flex-wrap gap-3">
        {navigation.canReviewClaims && (
          <Link
            className="gc-button"
            href="/platform/admin/requests?type=CLAIM"
          >
            Church verification requests
          </Link>
        )}
        {navigation.capabilities.includes("REVIEW_CHURCH_LISTINGS") && (
          <Link
            className="gc-button gc-button-quiet"
            href="/platform/operator/listings"
          >
            Review public church listings
          </Link>
        )}
        {navigation.capabilities.includes("ESTABLISH_CHURCH") && (
          <Link
            className="gc-button gc-button-quiet"
            href="/platform/operator/churches"
          >
            Existing church administration
          </Link>
        )}
      </div>
    </div>
  );
}
export function AdminAudit({ data }: { data: AdminAuditSnapshot }) {
  const visible = useReadVisibility();
  if (!visible) return null;
  return (
    <div className="space-y-5">
      <h1 className="text-3xl font-semibold">Access and lookup audit</h1>
      <p>
        Grant changes, authenticator setup and operational lookups.
        Case-specific action history remains on each currently permitted case;
        this view grants no case or proof access.
      </p>
      {data.rows.length === 0 ? (
        <p>No audit records on this page.</p>
      ) : (
        <ol className="space-y-3">
          {data.rows.map((row) => (
            <li
              className="rounded-xl border border-gc-divider p-4"
              key={row.id}
            >
              <p>
                {row.action.replaceAll("-", " ")} · {row.actor.name} (@
                {row.actor.username})
              </p>
              <p className="text-sm text-gc-muted">
                <SupportTime value={row.createdAt} /> · Version {row.version}
              </p>
              {row.reason && (
                <p className="mt-2 whitespace-pre-wrap break-words">
                  {row.reason}
                </p>
              )}
            </li>
          ))}
        </ol>
      )}
      {data.next && (
        <a
          className="gc-button gc-button-quiet"
          href={"/platform/admin/audit?after=" + encodeURIComponent(data.next)}
        >
          Older audit records
        </a>
      )}
    </div>
  );
}
