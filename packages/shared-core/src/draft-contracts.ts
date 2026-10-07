import type { PostDraft, PrivateDraftPayload } from "./post-contracts";

export type ComposerFields = PrivateDraftPayload &
  Pick<PostDraft, "linkReceipt" | "linkPreview" | "keepLinkPreview">;
export type DraftSnapshot = {
  id: string;
  version: number;
  payload: PrivateDraftPayload;
};
export type DraftState = {
  ownerId: string | null;
  hidden: boolean;
  id: string | null;
  version: number;
  fields: ComposerFields;
  dirty: boolean;
  saving: boolean;
  publishing: boolean;
  conflict: boolean;
  latest: DraftSnapshot | null;
  latestLoaded: boolean;
  message: string;
  failed: boolean;
  retry: boolean;
  postId: string | null;
  scheduled: boolean;
  resumeId: string | null;
  loadNumber: number;
  externalWork: { dirty: boolean; saving: boolean; conflict: boolean };
};
type Reply = { status: number; data: Record<string, unknown> };
export type DraftTransport = (path: string, body?: string) => Promise<Reply>;
