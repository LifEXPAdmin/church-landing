"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { portalButtonClass } from "@/components/platform/portal-action-form";

export function PortalRetry() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      className={portalButtonClass}
      onClick={() => startTransition(() => router.refresh())}
    >
      {pending ? "Loading latest information..." : "Try loading again"}
    </button>
  );
}
