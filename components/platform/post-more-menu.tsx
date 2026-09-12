"use client";
import Link from "next/link";
import { useState } from "react";
import { Ellipsis, Pencil, Trash2 } from "lucide-react";
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
      />
    );
  if (!canEdit && !canWithdraw) return null;
  return (
    <ActionPopover
      label="More post options"
      trigger={<Ellipsis aria-hidden="true" />}
      className="gc-icon-button"
      open={open}
      onOpenChange={setOpen}
    >
      {management}
    </ActionPopover>
  );
}
