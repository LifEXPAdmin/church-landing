"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import type {
  readFollowingLists,
  FollowingListMember
} from "@/lib/platform/following-lists";
import { useFeedbackSnapshot } from "./use-feedback-snapshot";
import { ReadVisibility } from "./read-visibility";
import { usePrivateChoiceAction } from "./use-private-choice-action";
import { portalInputClass } from "./portal-action-form";

type Page = Awaited<ReturnType<typeof readFollowingLists>>;
const href = (id?: string) =>
  "/platform/relationships/lists" +
  (id ? "?list=" + encodeURIComponent(id) : "");
const memberKey = (member: FollowingListMember) =>
  member.kind + ":" + member.targetId;
export function FollowingLists({
  owner,
  listId
}: {
  owner: string;
  listId?: string;
}) {
  const [kind, setKind] = useState("person"),
    [search, setSearch] = useState(""),
    [after, setAfter] = useState("");
  const query = new URLSearchParams({
    kind,
    ...(listId ? { listId } : {}),
    ...(search ? { q: search } : {}),
    ...(after ? { after } : {})
  });
  const snapshot = useFeedbackSnapshot<Page>(
    owner,
    "/api/platform/following-lists?" + query,
    (page) => page.ownerId === owner,
    "private following lists"
  );
  return (
    <section className="space-y-5" aria-label="Private following lists">
      <p>
        Only you can see these names and members. Use a list to narrow
        Following. Lists do not grant church access or endorse anyone.
      </p>
      <p>
        Unfollowing or blocking removes an entry. Following again does not add
        it back. Muted posts remain hidden.
      </p>
      {!snapshot.visible && (
        <div className="space-y-3">
          <p role="status">
            {snapshot.busy
              ? "Checking your private following lists…"
              : snapshot.notice}
          </p>
          <button
            type="button"
            className="gc-button gc-button-quiet"
            disabled={snapshot.busy}
            onClick={() => void snapshot.load()}
          >
            Check current lists
          </button>
          <Link className="gc-button gc-button-quiet" href={href()}>
            Open all private lists
          </Link>
        </div>
      )}
      {snapshot.data && (
        <ReadVisibility.Provider value={snapshot.visible}>
          <div hidden={!snapshot.visible}>
            <ListWorkspace
              owner={owner}
              page={snapshot.data}
              kind={kind}
              search={search}
              after={after}
              onSearch={(nextKind, nextSearch) => {
                setKind(nextKind);
                setSearch(nextSearch);
                setAfter("");
              }}
              onPage={setAfter}
            />
          </div>
        </ReadVisibility.Provider>
      )}
    </section>
  );
}
function ListWorkspace({
  owner,
  page,
  kind,
  search,
  after,
  onSearch,
  onPage
}: {
  owner: string;
  page: Page;
  kind: string;
  search: string;
  after: string;
  onSearch: (kind: string, search: string) => void;
  onPage: (after: string) => void;
}) {
  const [base] = useState(() => ({
    version: page.version,
    name: page.list?.name ?? "",
    members: page.list?.members ?? []
  }));
  const [name, setName] = useState(base.name),
    [members, setMembers] = useState<FollowingListMember[]>(base.members);
  const [query, setQuery] = useState(search);
  const changed =
    base.version !== page.version ||
    JSON.stringify(base.members) !== JSON.stringify(page.list?.members ?? []);
  const dirty =
    name !== base.name ||
    JSON.stringify(members) !== JSON.stringify(base.members);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const intent = useRef<"save" | "delete" | "recover">("save");
  const save = usePrivateChoiceAction(
    "/api/platform/following-lists",
    owner,
    dirty,
    (receipt) => {
      location.assign(
        intent.current === "save" ? href(page.list?.id ?? receipt.id) : href()
      );
    },
    true
  );
  const feed = usePrivateChoiceAction(
    "/api/platform/feed",
    owner,
    false,
    () => location.assign("/platform?feed=following"),
    true
  );
  const blocked = save.blocked || feed.blocked;
  function choose(id: string | null) {
    if (blocked || dirty || changed) return;
    void feed.command({
      mode: "following",
      followingListId: id,
      expectedVersion: page.feedVersion,
      expectedListsVersion: page.version
    });
  }
  function discard() {
    if (
      confirm(
        "Reload current saved lists and discard these local entries? An unconfirmed request may already be saved."
      )
    )
      location.reload();
  }
  return (
    <div className="space-y-5">
      <nav className="flex flex-wrap gap-2" aria-label="Your private lists">
        <Link
          prefetch={false}
          className="gc-button gc-button-quiet"
          href={href()}
          aria-current={!page.list ? "page" : undefined}
        >
          All private lists
        </Link>
        {page.lists.map((list) => (
          <Link
            key={list.id}
            prefetch={false}
            className="gc-button gc-button-quiet max-w-full break-words"
            href={href(list.id)}
            aria-current={page.list?.id === list.id ? "page" : undefined}
          >
            {list.name}
          </Link>
        ))}
      </nav>
      {changed && (
        <div className="space-y-3">
          <p role="status">
            Your saved lists or follows changed. Your local entries are retained
            and concealed. Confirm any original save, then reload to review
            current choices.
          </p>
          <button
            type="button"
            className="gc-button gc-button-quiet"
            onClick={discard}
          >
            Reload current lists
          </button>
        </div>
      )}
      {save.status}
      {feed.status}
      <div hidden={changed} className="space-y-5">
        {page.recoveryRequired ? (
          <div className="space-y-3">
            <h2 className="text-2xl">Review lists after recovery</h2>
            <p>
              Your newer list choices could not be recovered. Older names and
              membership were cleared. Reset these private lists to continue.
              Your follows are unchanged.
            </p>
            <button
              type="button"
              className="gc-button"
              disabled={blocked}
              onClick={() => {
                intent.current = "recover";
                void save.command({
                  operation: "recover",
                  expectedVersion: base.version
                });
              }}
            >
              Reset private lists after recovery
            </button>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <p>
                {page.selectedId
                  ? page.lists.some((l) => l.id === page.selectedId)
                    ? "Following currently uses your selected private list."
                    : "The selected list was deleted. Choose another list or All following before opening Following."
                  : "Following currently includes all your follows."}
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="gc-button gc-button-quiet"
                  disabled={blocked || dirty}
                  onClick={() => choose(null)}
                >
                  Use All following
                </button>
                {page.list && (
                  <button
                    type="button"
                    className="gc-button"
                    disabled={blocked || dirty}
                    onClick={() => choose(page.list!.id)}
                  >
                    Use this list in Following
                  </button>
                )}
              </div>
              <p className="text-sm text-gc-muted">
                Your saved discovery filters and current post permissions still
                apply. Save your edits before choosing a feed.
              </p>
            </div>
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                if (blocked || changed) return;
                intent.current = "save";
                void save.command(
                  page.list
                    ? {
                        operation: "save",
                        listId: page.list.id,
                        name,
                        members: members.map(
                          ({ kind, targetId, relationshipId, since }) => ({
                            kind,
                            targetId,
                            relationshipId,
                            since
                          })
                        ),
                        expectedVersion: base.version
                      }
                    : {
                        operation: "create",
                        name,
                        expectedVersion: base.version
                      }
                );
              }}
            >
              <h2 className="text-2xl">
                {page.list ? "Edit private list" : "Create a private list"}
              </h2>
              {!page.list && (
                <p>
                  Keep up to 20 named lists, with up to 100 people or churches
                  in each. Add members after creating the list.
                </p>
              )}
              <label className="block space-y-2">
                <span>Private list name</span>
                <input
                  className={portalInputClass}
                  value={name}
                  maxLength={60}
                  required
                  disabled={blocked}
                  onChange={(event) => setName(event.target.value)}
                  autoComplete="off"
                />
              </label>
              {page.list && (
                <div className="space-y-3">
                  <h3 className="text-xl">
                    List members ({members.length} of 100)
                  </h3>
                  {!members.length && (
                    <p>
                      This list is empty. Add people or churches from your
                      follows below.
                    </p>
                  )}
                  <ul className="space-y-2">
                    {members.map((member) => (
                      <li
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gc-border p-3"
                        key={memberKey(member)}
                      >
                        <span className="min-w-0 break-words">
                          {member.name}{" "}
                          <span className="text-sm text-gc-muted">
                            (
                            {member.kind === "church"
                              ? "Church"
                              : member.username
                                ? "@" + member.username
                                : "Person"}
                            )
                          </span>
                        </span>
                        <button
                          type="button"
                          className="gc-button gc-button-quiet"
                          disabled={blocked}
                          aria-label={`Remove ${member.name} from this list`}
                          onClick={() =>
                            setMembers(
                              members.filter(
                                (m) => memberKey(m) !== memberKey(member)
                              )
                            )
                          }
                        >
                          Remove from list
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <button
                  className="gc-button"
                  type="submit"
                  disabled={
                    blocked ||
                    !name.trim() ||
                    (page.list ? !dirty : page.lists.length >= 20)
                  }
                >
                  {page.list ? "Save private list" : "Create private list"}
                </button>
                {dirty && (
                  <button
                    type="button"
                    className="gc-button gc-button-quiet"
                    disabled={blocked}
                    onClick={discard}
                  >
                    Discard local edits
                  </button>
                )}
              </div>
            </form>
            {page.list && (
              <>
                <section className="space-y-3" aria-label="Add current follows">
                  <h3 className="text-xl">Add from your follows</h3>
                  <form
                    className="space-y-3"
                    role="search"
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (!blocked) onSearch(kind, query.trim());
                    }}
                  >
                    <label className="block space-y-2">
                      <span>Followed accounts</span>
                      <select
                        className={portalInputClass}
                        value={kind}
                        disabled={blocked}
                        onChange={(event) =>
                          onSearch(event.target.value, query.trim())
                        }
                      >
                        <option value="person">People</option>
                        <option value="church">Churches</option>
                      </select>
                    </label>
                    <label className="block space-y-2">
                      <span>Search your follows</span>
                      <input
                        className={portalInputClass}
                        type="search"
                        value={query}
                        maxLength={100}
                        disabled={blocked}
                        onChange={(event) => setQuery(event.target.value)}
                      />
                    </label>
                    <button
                      className="gc-button gc-button-quiet"
                      disabled={blocked}
                      type="submit"
                    >
                      Search follows
                    </button>
                  </form>
                  {!page.candidates.length && (
                    <p>
                      No current follows match this selection. Follow people or
                      churches before adding them to a list.
                    </p>
                  )}
                  <ul className="space-y-2">
                    {page.candidates.map((member) => {
                      const selected = members.some(
                        (m) => memberKey(m) === memberKey(member)
                      );
                      return (
                        <li
                          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gc-border p-3"
                          key={memberKey(member)}
                        >
                          <span className="min-w-0 break-words">
                            {member.name}
                            {member.username
                              ? " (@" + member.username + ")"
                              : ""}
                          </span>
                          <button
                            type="button"
                            className="gc-button gc-button-quiet"
                            disabled={
                              blocked || selected || members.length >= 100
                            }
                            aria-label={`Add ${member.name} to this list`}
                            onClick={() => setMembers([...members, member])}
                          >
                            {selected ? "In this list" : "Add to list"}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  <div className="flex flex-wrap gap-2">
                    {after && (
                      <button
                        type="button"
                        className="gc-button gc-button-quiet"
                        disabled={blocked}
                        onClick={() => onPage("")}
                      >
                        First follows
                      </button>
                    )}
                    {page.nextCursor && (
                      <button
                        type="button"
                        className="gc-button gc-button-quiet"
                        disabled={blocked}
                        onClick={() => onPage(page.nextCursor!)}
                      >
                        More follows
                      </button>
                    )}
                  </div>
                </section>
                <section className="space-y-3 border-t border-gc-border pt-5">
                  <h3 className="text-xl">Delete this private list</h3>
                  <p>
                    Deleting this list leaves every follow intact. If it is
                    selected for Following, you will need to choose another list
                    or All following.
                  </p>
                  {deleteOpen ? (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="gc-button"
                        disabled={blocked || dirty}
                        onClick={() => {
                          intent.current = "delete";
                          void save.command({
                            operation: "delete",
                            listId: page.list!.id,
                            expectedVersion: base.version
                          });
                        }}
                      >
                        Confirm delete list
                      </button>
                      <button
                        type="button"
                        className="gc-button gc-button-quiet"
                        disabled={blocked}
                        onClick={() => setDeleteOpen(false)}
                      >
                        Keep list
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="gc-button gc-button-quiet"
                      disabled={blocked || dirty}
                      onClick={() => setDeleteOpen(true)}
                    >
                      Delete list
                    </button>
                  )}
                </section>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
