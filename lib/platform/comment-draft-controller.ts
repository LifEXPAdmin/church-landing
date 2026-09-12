import { SocialClientError } from "./social-client";
export type CommentFields = {
  content: string;
  mentionIds: string[];
  authorChurchId: string | null;
};
export type SavedCommentDraft = CommentFields & {
  id: string;
  version: number;
  postId: string;
  replyToId: string | null;
};
type Receipt = { id: string; version: number; message: string };
export type CommentTransport = <T>(path: string, body?: string) => Promise<T>;
const empty = (): CommentFields => ({
  content: "",
  mentionIds: [],
  authorChurchId: null
});
export class CommentDraftController {
  private transport: CommentTransport;
  private postId: string;
  private replyToId: string | null;
  private uuid: () => string;
  private resumeId: string | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private listeners = new Set<() => void>();
  private pending: {
    body: string;
    kind: "draft-save" | "create";
    fields: CommentFields;
  } | null = null;
  private acknowledged = JSON.stringify(empty());
  private active = true;
  private sequence = 0;
  private inFlight = false;
  private state = {
    id: "",
    version: 0,
    fields: empty(),
    ready: false,
    hidden: false,
    dirty: false,
    busy: false,
    sending: false,
    retry: false,
    conflict: false,
    failed: false,
    message: "Loading your comment draft…",
    createdId: null as string | null,
    latest: null as SavedCommentDraft | null
  };
  constructor(
    transport: CommentTransport,
    postId: string,
    replyToId: string | null = null,
    uuid = () => crypto.randomUUID(),
    resumeId?: string
  ) {
    this.transport = transport;
    this.postId = postId;
    this.replyToId = replyToId;
    this.uuid = uuid;
    this.resumeId = resumeId;
  }
  getSnapshot = () => this.state;
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  private set(patch: Partial<typeof this.state>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((fn) => fn());
  }
  private stop() {
    clearTimeout(this.timer);
    this.timer = undefined;
  }
  private schedule() {
    this.stop();
    if (
      this.active &&
      this.state.ready &&
      !this.state.hidden &&
      this.state.dirty &&
      !this.state.busy &&
      !this.state.failed &&
      !this.state.conflict &&
      !this.pending
    )
      this.timer = setTimeout(() => void this.save(), 5000);
  }
  dispose = () => {
    this.active = false;
    this.sequence++;
    this.stop();
  };
  visibility = (hidden: boolean) => {
    this.set({ hidden });
    this.schedule();
  };
  private path() {
    return `/api/platform/comments?${new URLSearchParams({ view: "drafts", postId: this.postId, ...(this.replyToId ? { replyToId: this.replyToId } : {}) })}`;
  }
  start = async () => {
    this.active = true;
    const seq = ++this.sequence;
    try {
      const data = await this.transport<{ items: SavedCommentDraft[] }>(
        this.path()
      );
      if (seq !== this.sequence) return;
      const row = data.items[0];
      if (this.resumeId && row?.id !== this.resumeId)
        throw new SocialClientError(
          404,
          "This saved draft was sent or discarded. It cannot be restored."
        );
      const fields = row
        ? {
            content: row.content,
            mentionIds: row.mentionIds,
            authorChurchId: row.authorChurchId
          }
        : empty();
      this.acknowledged = JSON.stringify(fields);
      this.set({
        id: row?.id ?? this.uuid(),
        version: row?.version ?? 0,
        fields,
        ready: true,
        failed: false,
        message: row ? "Saved comment draft recovered." : ""
      });
    } catch (e) {
      if (seq === this.sequence)
        this.set({
          failed: true,
          message:
            e instanceof Error
              ? e.message
              : "Your draft could not be checked. Retry before writing."
        });
    }
  };
  change = (fields: CommentFields) => {
    if (
      !this.state.ready ||
      this.state.hidden ||
      this.state.sending ||
      this.state.createdId
    )
      return;
    const dirty = JSON.stringify(fields) !== this.acknowledged;
    this.set({
      fields,
      dirty,
      ...(!this.state.failed && !this.state.conflict
        ? {
            message: dirty
              ? "Not saved yet."
              : this.state.version
                ? "Saved privately."
                : ""
          }
        : {})
    });
    this.schedule();
  };
  private async request(kind: "draft-save" | "create") {
    if (
      this.inFlight ||
      !this.state.ready ||
      this.state.hidden ||
      this.state.conflict ||
      this.state.createdId
    )
      return false;
    this.inFlight = true;
    this.stop();
    const seq = this.sequence;
    this.set({
      busy: true,
      sending: kind === "create",
      failed: false,
      message: kind === "create" ? "Sending comment…" : "Saving comment draft…"
    });
    try {
      if (!this.pending) {
        const fields = {
          ...this.state.fields,
          mentionIds: [...this.state.fields.mentionIds]
        };
        this.pending = {
          kind,
          fields,
          body: JSON.stringify({
            operation: kind,
            mutationId: this.uuid(),
            postId: this.postId,
            replyToId: this.replyToId,
            ...fields,
            draftId: this.state.id,
            ...(kind === "create"
              ? { draftVersion: this.state.version }
              : { expectedVersion: this.state.version })
          })
        };
      }
      const p = this.pending;
      const r = await this.transport<Receipt>("/api/platform/comments", p.body);
      if (seq !== this.sequence) return false;
      if (
        typeof r.id !== "string" ||
        !Number.isSafeInteger(r.version) ||
        r.version < 1
      )
        throw new SocialClientError(
          503,
          "The response could not be confirmed. Retry the same request."
        );
      this.pending = null;
      if (p.kind === "draft-save") {
        this.acknowledged = JSON.stringify(p.fields);
        const dirty = JSON.stringify(this.state.fields) !== this.acknowledged;
        this.set({
          version: r.version,
          dirty,
          retry: false,
          message: dirty ? "New changes are not saved yet." : "Saved privately."
        });
      } else
        this.set({
          createdId: r.id,
          dirty: false,
          retry: false,
          message: "Comment sent."
        });
      return true;
    } catch (e) {
      if (seq !== this.sequence) return false;
      const status = e instanceof SocialClientError ? e.status : 503;
      if ([400, 401, 403, 404, 409, 429].includes(status)) this.pending = null;
      this.set({
        failed: true,
        retry: !!this.pending,
        conflict: status === 409 || status === 404,
        message:
          e instanceof Error
            ? e.message
            : "The response was lost. Retry the same request; your text is still here."
      });
      return false;
    } finally {
      this.inFlight = false;
      if (seq === this.sequence) {
        this.set({ busy: false, sending: this.pending?.kind === "create" });
        this.schedule();
      }
    }
  }
  save = async () => {
    if (this.pending?.kind === "create") return false;
    if (!this.state.dirty && !this.pending) return true;
    return this.request("draft-save");
  };
  retry = () => this.request(this.pending?.kind ?? "draft-save");
  send = async () => {
    if (this.inFlight || this.pending || this.state.conflict) return false;
    const length = this.state.fields.content
      .replace(/\r\n?/g, "\n")
      .trim().length;
    if (length < 2 || length > 1500) {
      this.set({
        message:
          "Use 2–1,500 characters before sending. Your full draft is kept."
      });
      return false;
    }
    if (!(await this.save()) || this.state.dirty || !this.state.version)
      return false;
    return this.request("create");
  };
  review = async () => {
    if (this.state.hidden || this.inFlight) return;
    const seq = this.sequence;
    try {
      const data = await this.transport<{ items: SavedCommentDraft[] }>(
        this.path()
      );
      if (seq !== this.sequence) return;
      this.set({
        latest: data.items[0] ?? null,
        message: data.items[0]
          ? "Saved copy is shown separately. Your unsent text is unchanged."
          : "No active saved copy remains. Copy your text before opening a fresh draft."
      });
    } catch (e) {
      this.set({
        message:
          e instanceof Error ? e.message : "Saved copy could not be loaded."
      });
    }
  };
  useLatest = () => {
    const row = this.state.latest;
    if (!row || this.inFlight || this.state.hidden) return;
    this.stop();
    this.pending = null;
    const fields = {
      content: row.content,
      mentionIds: row.mentionIds,
      authorChurchId: row.authorChurchId
    };
    this.acknowledged = JSON.stringify(fields);
    this.set({
      id: row.id,
      version: row.version,
      fields,
      dirty: false,
      failed: false,
      conflict: false,
      retry: false,
      latest: null,
      message: "Saved copy loaded."
    });
  };
}
