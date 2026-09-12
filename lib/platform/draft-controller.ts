import type { PrivateDraftPayload } from "./post-workspace";
import type { PostDraft } from "../../components/platform/post-draft-fields";

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
  resumeId: string | null;
  loadNumber: number;
  externalWork: { dirty: boolean; saving: boolean; conflict: boolean };
};
type Reply = { status: number; data: Record<string, unknown> };
export type DraftTransport = (path: string, body?: string) => Promise<Reply>;
export const emptyComposer = (
  churchId: string | null = null
): ComposerFields => ({
  content: "",
  scripture: "",
  type: "UPDATE",
  topics: [],
  audience: churchId ? "CHURCH" : "PUBLIC",
  replyAudience: "VIEWERS",
  authorChurchId: null,
  audienceChurchId: churchId,
  eventOccurrenceId: null,
  linkUrl: ""
});
// Explicit whitelist: short-lived preview credentials never enter snapshots.
export function composerPayload(f: ComposerFields): PrivateDraftPayload {
  return {
    content: f.content,
    scripture: f.scripture,
    type: f.type,
    topics: [...f.topics],
    audience: f.audience,
    replyAudience: f.replyAudience,
    authorChurchId: f.authorChurchId,
    audienceChurchId: f.audienceChurchId,
    eventOccurrenceId: f.eventOccurrenceId,
    linkUrl: f.linkUrl,
    ...(f.quoteSourceId !== undefined
      ? { quoteSourceId: f.quoteSourceId }
      : {}),
    ...(f.photos !== undefined
      ? {
          photos: f.photos.map((photo) => ({
            id: photo.id,
            version: photo.version
          }))
        }
      : {})
  };
}
const initialState = (): DraftState => ({
  ownerId: null,
  hidden: true,
  id: null,
  version: 0,
  fields: emptyComposer(),
  dirty: false,
  saving: false,
  publishing: false,
  conflict: false,
  latest: null,
  latestLoaded: false,
  message: "",
  failed: false,
  retry: false,
  postId: null,
  resumeId: null,
  externalWork: { dirty: false, saving: false, conflict: false },
  loadNumber: 0
});

/** One in-memory controller per mounted platform layout, never browser storage. */
export class DraftController {
  private state = initialState();
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private generation = 0;
  private identitySequence = 0;
  private pending: {
    body: string;
    kind: "save" | "publish";
    payload?: PrivateDraftPayload;
  } | null = null;
  private acknowledged = JSON.stringify(composerPayload(this.state.fields));
  private busy = false;
  private transport: DraftTransport;
  private uuid: () => string;
  constructor(transport: DraftTransport, uuid = () => crypto.randomUUID()) {
    this.transport = transport;
    this.uuid = uuid;
  }

  private external = new Map<
    string,
    { dirty: boolean; saving: boolean; conflict: boolean }
  >();
  setExternalWork = (
    key: string,
    work: { dirty: boolean; saving: boolean; conflict: boolean } | null
  ) => {
    if (work) this.external.set(key, work);
    else this.external.delete(key);
    const values = [...this.external.values()];
    this.set({
      externalWork: {
        dirty: values.some((v) => v.dirty),
        saving: values.some((v) => v.saving),
        conflict: values.some((v) => v.conflict)
      }
    });
  };
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private set(patch: Partial<DraftState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((f) => f());
  }
  private stopTimer() {
    clearTimeout(this.timer);
    this.timer = undefined;
  }
  private schedule() {
    this.stopTimer();
    if (
      this.state.dirty &&
      !this.state.hidden &&
      !this.state.saving &&
      !this.state.conflict &&
      !this.state.resumeId &&
      !this.state.failed &&
      !this.pending
    )
      this.timer = setTimeout(() => {
        void this.save();
      }, 5000);
  }
  conceal = () => {
    this.stopTimer();
    this.set({ hidden: true });
  };
  dispose = () => {
    this.stopTimer();
    this.identitySequence++;
  };
  private clear(ownerId: string | null, preserveExternal = false) {
    this.stopTimer();
    this.generation++;
    this.pending = null;
    const externalWork = this.state.externalWork;
    if (!preserveExternal) this.external.clear();
    this.acknowledged = JSON.stringify(composerPayload(emptyComposer()));
    this.set({
      ...initialState(),
      ownerId,
      hidden: !ownerId,
      ...(preserveExternal ? { externalWork } : {})
    });
  }
  verify = async (): Promise<boolean> => {
    const sequence = ++this.identitySequence,
      priorOwner = this.state.ownerId;
    try {
      const r = await this.transport("/api/platform/profile");
      if (sequence !== this.identitySequence) return false;
      if (r.status === 401) {
        this.clear(null);
        return false;
      }
      if (r.status !== 200 || typeof r.data.id !== "string") throw Error();
      if (r.data.id !== priorOwner) {
        this.clear(r.data.id);
        return priorOwner === null;
      }
      this.set({ hidden: false });
      this.schedule();
      return true;
    } catch {
      if (sequence === this.identitySequence)
        this.set({
          hidden: true,
          failed: true,
          retry: !!this.pending,
          message: "Your sign-in could not be checked. Reconnect and try again."
        });
      return false;
    }
  };
  start = (churchId: string | null = null) => {
    if (!this.state.ownerId || this.state.id) return;
    const fields = emptyComposer(churchId);
    this.acknowledged = JSON.stringify(composerPayload(fields));
    this.set({ id: this.uuid(), fields });
  };
  change = (fields: ComposerFields) => {
    if (
      !this.state.ownerId ||
      this.state.hidden ||
      this.state.publishing ||
      this.state.postId
    )
      return;
    const dirty = JSON.stringify(composerPayload(fields)) !== this.acknowledged;
    this.set({
      fields,
      dirty,
      ...(!this.state.failed && !this.state.conflict
        ? {
            message: dirty
              ? "Not saved yet."
              : this.state.version
                ? "Saved privately."
                : "No unsaved changes."
          }
        : {})
    });
    this.schedule();
  };
  private async send(kind: "save" | "publish"): Promise<boolean> {
    if (
      this.busy ||
      !this.state.ownerId ||
      this.state.hidden ||
      this.state.conflict ||
      this.state.postId ||
      this.state.resumeId
    )
      return false;
    this.busy = true;
    this.stopTimer();
    const generation = this.generation;
    this.set({
      saving: true,
      publishing: kind === "publish",
      failed: false,
      message: kind === "save" ? "Saving…" : "Publishing…"
    });
    try {
      if (!(await this.verify()) || generation !== this.generation)
        return false;
      if (!this.pending) {
        const payload = composerPayload(this.state.fields);
        this.pending = {
          kind,
          ...(kind === "save" ? { payload } : {}),
          body: JSON.stringify({
            operation: kind === "save" ? "save-draft" : "publish-draft",
            id: this.state.id,
            expectedVersion: this.state.version,
            mutationId: this.uuid(),
            ...(kind === "save"
              ? { payload }
              : {
                  linkReceipt: this.state.fields.linkReceipt,
                  keepLinkPreview: this.state.fields.keepLinkPreview ?? false
                })
          })
        };
      }
      const request = this.pending;
      const r = await this.transport(
        "/api/platform/post-workspace",
        request.body
      );
      if (!(await this.verify()) || generation !== this.generation)
        return false;
      if (r.status !== 200) {
        if ([400, 403, 404, 409, 429].includes(r.status)) this.pending = null;
        this.set({
          failed: true,
          retry: !!this.pending,
          conflict: r.status === 409 || r.status === 404,
          latest: null,
          latestLoaded: false,
          message:
            typeof r.data.message === "string"
              ? r.data.message
              : "Couldn’t save. Your work is still in this tab."
        });
        return false;
      }
      if (
        typeof r.data.version !== "number" ||
        r.data.id !== this.state.id ||
        (request.kind === "publish" && typeof r.data.postId !== "string")
      )
        throw Error();
      this.pending = null;
      if (request.kind === "save") {
        this.acknowledged = JSON.stringify(request.payload);
        const dirty =
          JSON.stringify(composerPayload(this.state.fields)) !==
          this.acknowledged;
        this.set({
          version: r.data.version,
          dirty,
          retry: false,
          message: dirty
            ? "New changes haven’t been saved yet."
            : "Saved privately."
        });
      } else
        this.set({
          version: r.data.version,
          postId: r.data.postId as string,
          dirty: false,
          retry: false,
          message: "Post published once."
        });
      return true;
    } catch {
      if (generation === this.generation)
        this.set({
          failed: true,
          retry: !!this.pending,
          message:
            "Couldn’t confirm the save. Check your connection, then retry the same request. Your work is still in this tab."
        });
      return false;
    } finally {
      this.busy = false;
      if (generation === this.generation) {
        this.set({
          saving: false,
          publishing: this.pending?.kind === "publish"
        });
        this.schedule();
      }
    }
  }
  save = async () => {
    if (this.pending?.kind === "publish") return false;
    if (!this.state.dirty && !this.pending) return true;
    return this.send("save");
  };
  retry = () => this.send(this.pending?.kind ?? "save");
  publish = async () => {
    if (this.busy || this.pending || this.state.conflict || this.state.postId)
      return false;
    if (this.state.fields.replyAudience === null) {
      this.set({ message: "Choose who may reply before publishing." });
      return false;
    }
    if (!(await this.save()) || this.state.dirty || this.state.version === 0)
      return false;
    return this.send("publish");
  };
  loadLatest = async () => {
    if (this.busy || !this.state.id) return;
    this.busy = true;
    const generation = this.generation;
    this.set({ saving: true });
    try {
      if (!(await this.verify()) || generation !== this.generation) return;
      const r = await this.transport(
        `/api/platform/post-workspace?view=draft&id=${encodeURIComponent(this.state.id!)}`
      );
      if (!(await this.verify()) || generation !== this.generation) return;
      if (r.status !== 200) throw Error();
      this.set({
        latest: r.data.draft as DraftSnapshot | null,
        latestLoaded: true,
        message: r.data.draft
          ? "The saved copy is shown separately. Your unsent entries are unchanged."
          : "This draft is no longer available. You can save your unsent work as a new draft."
      });
    } catch {
      this.set({
        message:
          "The saved copy could not be loaded. Your entries are unchanged."
      });
    } finally {
      this.busy = false;
      if (generation === this.generation) this.set({ saving: false });
    }
  };
  useLatest = () => {
    if (this.busy || !this.state.latest || this.state.hidden) return;
    const row = this.state.latest;
    this.pending = null;
    this.acknowledged = JSON.stringify(row.payload);
    this.set({
      id: row.id,
      version: row.version,
      fields: row.payload,
      loadNumber: this.state.loadNumber + 1,
      dirty: false,
      conflict: false,
      latest: null,
      latestLoaded: false,
      failed: false,
      retry: false,
      message:
        "Loaded the saved copy. Review your audience and reply permissions."
    });
  };
  saveAsNew = () => {
    if (this.busy || this.state.hidden || !this.state.conflict) return;
    this.pending = null;
    this.acknowledged = "";
    this.set({
      id: this.uuid(),
      version: 0,
      conflict: false,
      failed: false,
      retry: false,
      latest: null,
      latestLoaded: false,
      dirty: true,
      message: "Your unsent copy will be saved as a new private draft."
    });
    void this.save();
  };
  cancelResume = () => {
    this.set({ resumeId: null });
    this.schedule();
  };
  resume = async (id: string, replace = false) => {
    if (this.busy || this.pending || this.state.publishing) {
      this.set({
        message:
          "Resolve the current save or publication before opening another draft."
      });
      return;
    }
    if ((this.state.dirty || this.state.conflict) && !replace) {
      this.stopTimer();
      this.set({ resumeId: id });
      return;
    }
    this.stopTimer();
    this.busy = true;
    const generation = this.generation;
    const before = JSON.stringify(this.state.fields);
    this.set({ saving: true, resumeId: null });
    const verifyResumeOwner = async () => {
      const sequence = this.identitySequence + 1;
      if (await this.verify()) return generation === this.generation;
      // Route/focus verification can supersede this read without changing the
      // account. Retry that interrupted check once; never retry an auth failure
      // or carry a selected draft across an account generation change.
      if (
        generation !== this.generation ||
        this.identitySequence <= sequence ||
        !this.state.ownerId ||
        this.state.failed
      )
        return false;
      return (await this.verify()) && generation === this.generation;
    };
    try {
      if (!(await verifyResumeOwner())) return;
      const r = await this.transport(
        `/api/platform/post-workspace?view=draft&id=${encodeURIComponent(id)}`
      );
      if (!(await verifyResumeOwner())) return;
      if (r.status !== 200) throw Error();
      const row = r.data.draft as DraftSnapshot | null;
      if (!row) {
        this.set({
          message:
            "This draft is no longer available. Your current entries are unchanged."
        });
        return;
      }
      if (JSON.stringify(this.state.fields) !== before) {
        this.set({
          resumeId: id,
          message:
            "Your entries changed while loading. Choose whether to replace them."
        });
        return;
      }
      this.acknowledged = JSON.stringify(row.payload);
      this.set({
        id: row.id,
        version: row.version,
        fields: row.payload,
        loadNumber: this.state.loadNumber + 1,
        dirty: false,
        conflict: false,
        latest: null,
        latestLoaded: false,
        failed: false,
        retry: false,
        postId: null,
        message:
          "Draft resumed. Review its audience and reply permissions. Renew any link preview before publishing."
      });
    } catch {
      if (generation === this.generation)
        this.set({
          message:
            "Draft could not be loaded. Your current entries are unchanged. Try opening it again."
        });
    } finally {
      this.busy = false;
      if (generation === this.generation) {
        this.set({ saving: false });
        this.schedule();
      }
    }
  };
  /** Drop only unacknowledged edits; keep the saved draft and its version. */
  discardChanges = () => {
    if (
      this.busy ||
      this.pending ||
      this.state.hidden ||
      this.state.postId ||
      this.state.externalWork.dirty ||
      this.state.externalWork.saving ||
      this.state.externalWork.conflict
    )
      return false;
    this.stopTimer();
    const conflicted = this.state.conflict;
    const fields: ComposerFields =
      !conflicted && this.acknowledged
        ? JSON.parse(this.acknowledged)
        : emptyComposer();
    this.acknowledged = JSON.stringify(composerPayload(fields));
    this.set({
      fields,
      ...(conflicted
        ? {
            id: this.uuid(),
            version: 0,
            conflict: false,
            latest: null,
            latestLoaded: false
          }
        : {}),
      dirty: false,
      failed: false,
      message:
        "Unsent changes discarded. Any saved draft is still in Your drafts.",
      loadNumber: this.state.loadNumber + 1
    });
    return true;
  };
  newDraft = () => {
    if (this.busy || !this.state.postId) return;
    const owner = this.state.ownerId;
    this.clear(owner, true);
    this.start();
  };
}
