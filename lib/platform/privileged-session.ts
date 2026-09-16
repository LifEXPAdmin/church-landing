import type { Prisma } from "@prisma/client";

export type PrivilegedSession = {
  id: string;
  userId: string;
  credentialVersion: number;
};
// Only the already validated account boundary can bind a database session. The
// transaction object is request-local; no raw token, global user or browser flag
// grants assurance. Background permission calculations remain separate.
const sessions = new WeakMap<object, PrivilegedSession>();
export function bindPrivilegedSession(
  tx: Prisma.TransactionClient,
  session: PrivilegedSession
) {
  sessions.set(tx, session);
}
export function privilegedSession(tx: Prisma.TransactionClient, userId: string) {
  const session = sessions.get(tx);
  return session?.userId === userId ? session : null;
}
export function clearPrivilegedSession(tx: Prisma.TransactionClient) {
  sessions.delete(tx);
}
