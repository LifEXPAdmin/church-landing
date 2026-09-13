import { PlatformShell } from "./platform-shell";
import { GuestAccountPrompt } from "./guest-account-prompt";
import { MessageWorkspace } from "./message-workspace";
import { getCurrentPlatformUser } from "@/lib/platform/session";
import { readerId } from "@/lib/platform/reader-navigation";
export type MessageParams = {
  archived?: string;
  after?: string;
  message?: string;
};
export async function MessagePage({
  conversationId,
  query
}: {
  conversationId?: string;
  query: MessageParams;
}) {
  const user = await getCurrentPlatformUser(),
    after = readerId(query.after),
    selected = readerId(query.message),
    archived = query.archived === "true";
  const position = new URLSearchParams({
    ...(archived ? { archived: "true" } : {}),
    ...(after ? { after } : {}),
    ...(conversationId && selected ? { message: selected } : {})
  });
  const next =
    `/platform/messages${conversationId ? "/" + conversationId : ""}` +
    (position.size ? `?${position}` : "");
  return (
    <PlatformShell user={user}>
      {user ? (
        <div className="container-shell py-6">
          <MessageWorkspace
            key={`${user.id}-${conversationId ?? "inbox"}-${archived}-${after ?? "first"}-${selected ?? "latest"}`}
            owner={user.id}
            conversationId={conversationId}
            archived={archived}
            after={after}
            selected={selected}
          />
        </div>
      ) : (
        <GuestAccountPrompt next={next} reason="account" />
      )}
    </PlatformShell>
  );
}
