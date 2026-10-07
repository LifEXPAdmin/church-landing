/** Browser defaults for the canonical injected draft controller. */
import {
  DraftController as PortableDraftController,
  type DraftScheduler,
  type DraftTransport
} from "../../packages/shared-core/src/draft-controller";
export {
  emptyComposer,
  composerPayload
} from "../../packages/shared-core/src/draft-controller";
export type {
  ComposerFields,
  DraftSnapshot,
  DraftState,
  DraftTransport,
  DraftScheduler
} from "../../packages/shared-core/src/draft-controller";

export class DraftController extends PortableDraftController {
  constructor(
    transport: DraftTransport,
    uuid = () => crypto.randomUUID(),
    scheduler: DraftScheduler = {
      schedule: (callback, milliseconds) => setTimeout(callback, milliseconds),
      cancel: handle => clearTimeout(handle as ReturnType<typeof setTimeout>)
    }
  ) {
    super(transport, uuid, scheduler);
  }
}
