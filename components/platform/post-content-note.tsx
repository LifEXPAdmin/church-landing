export function PostContentNote({ note }: { note?: string | null }) {
  return note ? (
    <p className="whitespace-pre-wrap break-words border-l-2 border-gc-accent pl-3 text-sm">
      <strong>Content note:</strong> {note}
    </p>
  ) : null;
}
