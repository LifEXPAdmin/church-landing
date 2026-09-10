"use client";
import { useFormStatus } from "react-dom";
export function PostActionPending() {
  const { pending } = useFormStatus();
  return (
    <span data-reader-busy={pending} role="status" className="sr-only">
      {pending ? "Saving this post action…" : ""}
    </span>
  );
}
