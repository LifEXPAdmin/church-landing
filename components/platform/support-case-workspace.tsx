"use client";
import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { ReadVisibility } from "./read-visibility";
import { PortalHeading, PortalHelpContact, portalLinkClass } from "./portal-ui";
import { SupportViews } from "./support-views";
import { useSupportPrivateSnapshot } from "./use-support-private-snapshot";

export function SupportCaseWorkspace({
  owner,
  url,
  view,
  received
}: {
  owner: string;
  url: string;
  view: "detail" | "routing";
  received?: boolean;
}) {
  const { snapshot, visible, currentAccess, notice, denied, hide, recheck } =
    useSupportPrivateSnapshot(owner, url, "help case");
  const work = useRef(new Set<string>());
  const [savedNotice, setSavedNotice] = useState("");
  const onWorkChange = useCallback((id: string, pending: boolean) => {
    if (pending) work.current.add(id);
    else work.current.delete(id);
  }, []);
  const onNavigate = useCallback(
    (id: string, destination: string) => {
      if ([...work.current].some((other) => other !== id)) {
        setSavedNotice(
          "This change is saved. Other local entries or unconfirmed requests remain on this page. Review them before reloading."
        );
        recheck();
      } else window.location.assign(destination);
    },
    [recheck]
  );
  return (
    <div className="space-y-6" data-support-case={view}>
      <PortalHeading
        title={
          denied
            ? "Request not available"
            : view === "routing"
              ? "Assign requests"
              : visible
                ? (snapshot?.detail?.subject ?? "Request")
                : "Request"
        }
        description="Ordinary help, clear ownership and updates you can return to. Private to each request’s authorized participants."
      />
      {savedNotice && <p role="status">{savedNotice}</p>}
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
        <ReadVisibility.Provider value={visible}>
          <SupportViews
            snapshot={snapshot}
            view={view}
            received={received}
            privacy={{
              visible,
              currentAccess,
              onAccessDenied: hide,
              onWorkChange,
              onNavigate
            }}
          />
        </ReadVisibility.Provider>
      )}
      {denied && (
        <>
          <Link href="/platform/help/requests" className={portalLinkClass}>
            Back to My requests
          </Link>
          <PortalHelpContact />
        </>
      )}
    </div>
  );
}
