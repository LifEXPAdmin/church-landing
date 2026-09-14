"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { HandHeart } from "lucide-react";
import { createContext, useContext, useState } from "react";
import { accountEntryHref } from "@/lib/platform/account-entry";

type Target = { postId: string; commentId?: string | null };
const PrayerPanel = dynamic(() => import("./prayer-panel"), { ssr: false });
const Workspace = createContext<
  ((target: Target, opener: HTMLElement) => void) | null
>(null);

// One lazy workspace survives the source row's permission rechecks. No per-card
// identity, count or subscription fetch is needed just to display a Pray button.
export function PrayerWorkspaceProvider({
  owner,
  children
}: {
  owner: string | null;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState<
    (Target & { owner: string; opener: HTMLElement }) | null
  >(null);
  function close() {
    setOpen(null);
    if (open?.opener.isConnected) open.opener.focus({ preventScroll: true });
  }
  return (
    <Workspace.Provider
      value={(target, opener) => {
        if (owner && !open) setOpen({ ...target, owner, opener });
      }}
    >
      {children}
      {open && owner === open.owner && (
        <PrayerPanel
          key={`${owner}:${open.postId}:${open.commentId ?? ""}`}
          owner={owner}
          postId={open.postId}
          commentId={open.commentId}
          onClose={close}
        />
      )}
    </Workspace.Provider>
  );
}

export function PrayerControl({
  postId,
  commentId,
  owner
}: Target & { owner: string | null }) {
  const open = useContext(Workspace);
  const href = `/platform/posts/${postId}${commentId ? `?comment=${commentId}` : ""}`;
  const content = (
    <>
      <HandHeart aria-hidden="true" />
      <span>Pray</span>
    </>
  );
  return owner ? (
    <button
      type="button"
      className={commentId ? "gc-button gc-button-quiet" : "gc-post-action"}
      aria-label={commentId ? "Pray for this comment" : "Pray for this post"}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        open?.({ postId, commentId }, event.currentTarget);
      }}
    >
      {content}
    </button>
  ) : (
    <Link
      href={accountEntryHref("join", href, "account")}
      className="gc-post-action"
      aria-label="Sign in to use prayer"
    >
      {content}
    </Link>
  );
}
