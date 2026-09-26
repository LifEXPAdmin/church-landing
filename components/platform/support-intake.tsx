"use client";
import { useSupportPrivateSnapshot } from "./use-support-private-snapshot";
import { SupportIntakePresentation } from "./support-intake-presentation";

// The original snapshot and form controller stay in memory until deliberate
// navigation/discard. Private presentation is removed during current-access
// checks. Never replace the context under dirty fields or an uncertain command.
export function SupportIntake({
  owner,
  url,
  churchId
}: {
  owner: string;
  url: string;
  churchId?: string;
}) {
  const { snapshot, visible, currentAccess, notice, hide, recheck } =
    useSupportPrivateSnapshot(owner, url, "help form");
  return (
    <div className="space-y-6">
      {!visible && (
        <div className="space-y-3 rounded-xl border p-4">
          <p role="status">{notice}</p>
          <button
            type="button"
            className="gc-button gc-button-quiet"
            onClick={recheck}
          >
            Recheck current access
          </button>
          <button
            type="button"
            className="gc-button gc-button-quiet"
            onClick={() => {
              if (
                confirm(
                  "Reload current details and discard local entries? A previous unconfirmed request may already be saved."
                )
              )
                window.location.reload();
            }}
          >
            Reload current information
          </button>
        </div>
      )}
      {snapshot && (
        <SupportIntakePresentation
          snapshot={snapshot}
          churchId={churchId}
          privacy={{ visible, currentAccess, onAccessDenied: hide }}
        />
      )}
    </div>
  );
}
