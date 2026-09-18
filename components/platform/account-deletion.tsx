"use client";
import { RegionalTime } from "@/components/platform/regional-presentation";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { AccountDeletionProgress } from "@/lib/platform/account-deletion";
import { AccountConfirmation, useAccountConfirmation } from "./google-account";

const RECEIPT = "gc.account-deletion.v1";
type Receipt = { owner: string; proof: string; savedAt: number };
function savedReceipt(): Receipt | null {
  try {
    const r = JSON.parse(
      localStorage.getItem(RECEIPT) ?? "null"
    ) as Receipt | null;
    if (
      r &&
      typeof r.owner === "string" &&
      /^[A-Za-z0-9_-]{43}$/.test(r.proof) &&
      typeof r.savedAt === "number" &&
      Date.now() - r.savedAt < 365 * 86400000
    )
      return r;
  } catch {
    /* Storage is optional; a denied read cannot start a deletion. */
  }
  return null;
}
async function accountRequest(body: Record<string, unknown>) {
  const response = await fetch("/api/platform/account", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store"
  });
  const result = await response.json();
  if (!response.ok)
    throw Error(
      result.message ??
        "We could not confirm this request. Try checking progress again."
    );
  if (result.accepted !== true || typeof result.requestedAt !== "string")
    throw Error(
      "We could not confirm the response. Check progress before trying again."
    );
  return result as AccountDeletionProgress;
}
const date = (v: string) => <RegionalTime value={v} />;
const duties: Record<string, string> = {
  churchAssignments: "Church positions",
  topicOwnership: "Active topic community ownership",
  groupOwnership: "Active Gather group ownership",
  churchCapabilities: "Church permissions",
  operatorCapabilities: "Platform reviewer or operator permissions",
  contactAppointments: "Church contact appointments",
  supportCapabilities: "Support permissions",
  supportOwnership: "Open support cases",
  supportIntake: "Support intake ownership"
};

export function AccountDeletion({
  owner,
  available = false,
  verified = false
}: {
  owner?: string;
  available?: boolean;
  verified?: boolean;
}) {
  const confirmation = useAccountConfirmation("delete-account");
  const [result, setResult] = useState<AccountDeletionProgress | null>(null);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const busy = useRef(false);
  const feedback = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    const saved = savedReceipt();
    setReceipt(saved && (!owner || saved.owner === owner) ? saved : null);
  }, [owner]);
  const check = async () => {
    if (busy.current || !receipt) return;
    busy.current = true;
    setPending(true);
    setMessage("");
    try {
      setResult(
        await accountRequest({
          operation: "deletion-progress",
          proof: receipt.proof
        })
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Progress could not be loaded."
      );
    } finally {
      busy.current = false;
      setPending(false);
    }
  };
  return (
    <section className="gc-settings space-y-5" aria-busy={pending}>
      <h2>
        {owner && !result
          ? "Permanently delete account"
          : "Account deletion progress"}
      </h2>
      {result ? (
        <>
          <p role="status">
            Your permanent deletion request was accepted. All sign-ins are
            revoked. This request cannot be canceled or reactivated.
          </p>
          <dl className="space-y-3">
            <div>
              <dt>Request accepted</dt>
              <dd>{date(result.requestedAt)}</dd>
            </div>
            <div>
              <dt>Active-data deadline</dt>
              <dd>{date(result.activeDataDueAt)}</dd>
            </div>
            <div>
              <dt>Personal data cleanup</dt>
              <dd>
                {result.structuredPurgedAt
                  ? "Structured personal data removed; remaining provider cleanup and exceptions are checked separately."
                  : "Pending cleanup."}
              </dd>
            </div>
            <div>
              <dt>Completion</dt>
              <dd>
                {result.completedAt
                  ? <>Nonexempt active data deletion completed {date(result.completedAt)}.</>
                  : "Not yet complete."}
              </dd>
            </div>
          </dl>
          {!result.protectedJournalReady && (
            <p>
              Access is already closed. The protected restoration record is
              awaiting a retry; your original request date and deadline stay the
              same.
            </p>
          )}
          {Object.entries(result.handoffs as Record<string, number>).some(
            ([, count]) => count > 0
          ) && (
            <div className="space-y-3">
              <h3>Ownership handoff still required</h3>
              <ul className="list-disc pl-5">
                {Object.entries(result.handoffs as Record<string, number>)
                  .filter(([, n]) => n > 0)
                  .map(([key, n]) => (
                    <li key={key}>
                      {duties[key] ?? "Recorded duties"}: {n}
                    </li>
                  ))}
              </ul>
              <p>
                Ask a current authorized church administrator or the platform
                operator to transfer these duties and remove your assignments.
                They must use the existing authorization process. Unaffected
                personal data is still deleted, and this does not restart your
                deadline.
              </p>
            </div>
          )}
          <p>
            Other participants may keep shared messages, shown under Deleted
            member. Selected report evidence and necessary case records stay for
            180 days after final closure unless a specific preservation hold
            applies. Ordinary backups expire within 30 additional days after
            active deletion.
          </p>
        </>
      ) : owner ? (
        <>
          <p>
            This permanently closes your account. It immediately signs out every
            device, hides your profile and ends messaging and notification
            access. You cannot cancel the request or reactivate this account.
          </p>
          <p>
            Nonexempt account details, private drafts, saved collections,
            personal posts, photos, calendars and credentials are deleted from
            active systems within 30 days of the verified request. Ordinary
            backups may take up to 30 more days to expire.
          </p>
          <p>
            Other participants may keep shared messages, shown as Deleted member
            without a live profile link. Clear for me affects only your own
            view. Selected report evidence and necessary case records remain for
            180 days after final closure unless a specific preservation hold
            applies. We cannot erase copies or screenshots someone already
            saved.
          </p>
          <p>
            Church-owned content stays with the church. Transfer any church,
            reviewer, contact or support duties through a current authorized
            administrator. A remaining handoff blocks final completion, while
            unrelated personal data is still deleted on the original schedule.
          </p>
          <Link href="/platform/settings/data/export" className="underline">
            Download your data before continuing
          </Link>
          {!available ? (
            <p role="status">
              Permanent deletion is not available yet. No deletion request can
              be accepted here until cleanup and recovery operations are
              enabled.
            </p>
          ) : !verified ? (
            <p>
              <Link className="underline" href="/platform/account/verify">
                Verify your account email
              </Link>{" "}
              before requesting permanent deletion.
            </p>
          ) : (
            <form
              className="space-y-4"
              onSubmit={async (event) => {
                event.preventDefault();
                if (busy.current) return;
                const values = new FormData(event.currentTarget);
                busy.current = true;
                setPending(true);
                setMessage("");
                try {
                  const saved = receipt ?? {
                    owner,
                    savedAt: Date.now(),
                    proof: btoa(
                      String.fromCharCode(
                        ...crypto.getRandomValues(new Uint8Array(32))
                      )
                    )
                      .replace(/\+/g, "-")
                      .replace(/\//g, "_")
                      .replace(/=+$/, "")
                  };
                  // Store only a read-only progress capability, before the irreversible
                  // request. Never store the password or Google confirmation proof.
                  localStorage.setItem(RECEIPT, JSON.stringify(saved));
                  setReceipt(saved);
                  const confirmed = await accountRequest({
                    operation: "delete-account",
                    ownerId: owner,
                    proof: saved.proof,
                    confirmed: values.get("confirmed") === "on",
                    ...confirmation.credentials(values)
                  });
                  setResult(confirmed);
                  window.location.replace("/platform/account/deletion");
                } catch (error) {
                  setMessage(
                    error instanceof Error
                      ? error.message
                      : "We could not confirm the response. Check progress before trying again."
                  );
                } finally {
                  confirmation.finish();
                  busy.current = false;
                  setPending(false);
                  requestAnimationFrame(() => feedback.current?.focus());
                }
              }}
            >
              <AccountConfirmation
                value={confirmation}
                id="delete-password"
                label="Confirm your current sign-in for deletion"
              />
              <label className="flex min-h-11 items-start gap-3">
                <input
                  className="mt-1 h-5 w-5"
                  name="confirmed"
                  type="checkbox"
                  required
                />
                <span>
                  I understand the permanent deletion, shared-message and backup
                  consequences and want to delete my account.
                </span>
              </label>
              <button
                className="gc-button"
                disabled={pending || !confirmation.ready}
              >
                Confirm permanent deletion
              </button>
            </form>
          )}
        </>
      ) : (
        <p>
          Check the latest deletion request saved in this browser. This progress
          reference cannot sign in or recover an account.
        </p>
      )}
      {receipt ? (
        <button
          type="button"
          className="gc-button gc-button-quiet"
          disabled={pending}
          onClick={check}
        >
          {pending ? "Checking…" : "Check deletion progress"}
        </button>
      ) : !owner ? (
        <p>
          No progress reference is saved in this browser. Use the browser where
          you requested deletion, or ask the platform operator to verify the
          request through the normal account-help process.
        </p>
      ) : null}
      {receipt && (
        <p className="text-sm text-gc-muted">
          Progress is available here for up to 90 days after completed deletion.
          Clearing this website’s browser storage removes your local progress
          reference.
        </p>
      )}
      <p ref={feedback} tabIndex={-1} role="alert" className="text-gc-error">
        {message}
      </p>
      <Link href="/platform/help" className="underline">
        Account help
      </Link>
    </section>
  );
}
