"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { reconcileBrowserPush } from "@/lib/platform/push-browser";
import { useDraftWorkspace } from "./draft-workspace-provider";
export function PushSessionBoundary({ owner }: { owner: string | null }) {
  const router = useRouter(),
    { controller } = useDraftWorkspace();
  const [pending, setPending] = useState<string | null>(null);
  useEffect(() => {
    const reconcile = () => {
      void reconcileBrowserPush(owner).catch(() => {
        /* Retry cleanup on the next visit; server session revocation is authoritative. */
      });
    };
    reconcile();
    window.addEventListener("focus", reconcile);
    if (!("serviceWorker" in navigator))
      return () => window.removeEventListener("focus", reconcile);
    const receive = (event: MessageEvent) => {
      const id =
        event.data?.type === "open-gc-notification" ? event.data.id : null;
      if (typeof id !== "string" || !/^[\w-]{1,80}$/.test(id)) return;
      const href = `/platform/notifications/${id}`,
        s = controller.getSnapshot();
      if (
        s.dirty ||
        s.retry ||
        s.resumeId ||
        s.saving ||
        s.publishing ||
        s.conflict ||
        s.externalWork.dirty ||
        s.externalWork.saving ||
        s.externalWork.conflict
      )
        setPending(href);
      else router.push(href);
    };
    navigator.serviceWorker.addEventListener("message", receive);
    return () => {
      window.removeEventListener("focus", reconcile);
      navigator.serviceWorker.removeEventListener("message", receive);
    };
  }, [owner, router, controller]);
  return pending ? (
    <aside
      role="status"
      className="m-4 rounded-xl border border-gc-divider bg-gc-surface p-4"
    >
      <p>Finish or save your open work before opening this notification.</p>
      <Link
        href={pending}
        className="underline"
        onClick={(event) => {
          const s = controller.getSnapshot();
          if (
            s.dirty ||
            s.retry ||
            s.resumeId ||
            s.saving ||
            s.publishing ||
            s.conflict ||
            s.externalWork.dirty ||
            s.externalWork.saving ||
            s.externalWork.conflict
          )
            event.preventDefault();
          else setPending(null);
        }}
      >
        Open notification
      </Link>
      <button
        className="gc-button gc-button-quiet ml-3"
        type="button"
        onClick={() => setPending(null)}
      >
        Dismiss
      </button>
    </aside>
  ) : null;
}
