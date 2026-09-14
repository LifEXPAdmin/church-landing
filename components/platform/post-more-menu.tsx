"use client";
import Link from "next/link";
import { useState } from "react";
import { Ellipsis, Pencil, Pin, PinOff, Trash2 } from "lucide-react";
import { useProfilePin } from "./use-profile-pin";
import { ActionPopover } from "./action-popover";
import { RelationshipControls } from "./relationship-controls";
export function PostMoreMenu({
  postId,
  name,
  kind,
  targetId,
  own,
  canEdit,
  canWithdraw
}: {
  postId: string;
  name: string;
  kind: "person" | "church";
  targetId: string;
  own: boolean;
  canEdit: boolean;
  canWithdraw: boolean;
}) {
  const [open, setOpen] = useState(false);
  const canPin = own && kind === "person";
  const pin = useProfilePin(postId, targetId, canPin);
  const openMenu = (value: boolean) => {
    setOpen(value);
    if (value) void pin.load();
  };
  const reveal = (id: string) => {
    setOpen(false);
    if (location.pathname !== `/platform/posts/${postId}`) return;
    const node = document.getElementById(id);
    if (node instanceof HTMLDetailsElement) {
      node.open = true;
      node
        .querySelector<HTMLElement>("textarea, input, button")
        ?.focus({ preventScroll: true });
    }
  };
  const management = (
    <>
      {canEdit && (
        <Link
          href={`/platform/posts/${postId}#post-edit`}
          onClick={() => reveal("post-edit")}
        >
          <Pencil aria-hidden="true" />
          Edit
        </Link>
      )}
      {canWithdraw && (
        <Link
          href={`/platform/posts/${postId}#post-remove`}
          onClick={() => reveal("post-remove")}
        >
          <Trash2 aria-hidden="true" />
          Delete
        </Link>
      )}
    </>
  );
  if (!own)
    return (
      <RelationshipControls
        compact
        kind={kind}
        targetId={targetId}
        name={name}
        management={management}
        reportTarget={{ type: "POST", id: postId, label: "Report this post" }}
      />
    );
  if (!canEdit && !canWithdraw && !canPin) return null;
  return (
    <ActionPopover
      label="More post options"
      trigger={<Ellipsis aria-hidden="true" />}
      className="gc-icon-button"
      open={open}
      onOpenChange={openMenu}
    >
      {management}
      {canPin && (
        <div
          className="space-y-2"
          data-reader-busy={pin.busy}
          data-reader-dirty={!!pin.pending}
        >
          <button
            type="button"
            disabled={
              pin.busy ||
              !!pin.pending ||
              !pin.state ||
              (!pin.state.pinned && !pin.state.canPin)
            }
            onClick={() => void pin.send()}
          >
            {pin.state?.pinned ? (
              <PinOff aria-hidden="true" />
            ) : (
              <Pin aria-hidden="true" />
            )}
            {pin.state?.pinned ? "Unpin from profile" : "Pin to profile"}
          </button>
          {pin.state?.replaces && (
            <p className="text-sm">Replaces your current pinned post.</p>
          )}
          {(pin.busy || pin.message) && (
            <p role="status" className="text-sm">
              {pin.busy ? "Checking profile pin…" : pin.message}
            </p>
          )}
          {!pin.busy && pin.pending && (
            <button type="button" onClick={() => void pin.send(pin.pending!)}>
              Retry the same profile pin choice
            </button>
          )}
          {!pin.busy && !pin.pending && !pin.state && (
            <button type="button" onClick={() => void pin.load()}>
              Check profile pin status
            </button>
          )}
        </div>
      )}
    </ActionPopover>
  );
}
