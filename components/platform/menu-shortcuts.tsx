"use client";
import { useState } from "react";
import type { MenuShortcutsState } from "@/lib/platform/menu-shortcuts";
import type { NavigationId } from "@/lib/platform/navigation-registry";
import { usePrivateChoiceAction } from "./use-private-choice-action";

export function MenuShortcutsEditor({
  initial
}: {
  initial: MenuShortcutsState;
}) {
  // The owner/version key resets this baseline after a save. An authority-only
  // refresh may filter initial.ids while the original choices remain mounted.
  const [savedIds] = useState<NavigationId[]>(initial.ids);
  const [ids, setIds] = useState<NavigationId[]>(savedIds);
  const [dirty, setDirty] = useState(false);
  const action = usePrivateChoiceAction(
    "/api/platform/menu-shortcuts",
    initial.ownerId,
    dirty,
    () => setDirty(false),
    true
  );
  const unavailable = ids.some(
    (id) => !initial.choices.some((item) => item.id === id)
  );
  function change(next: NavigationId[]) {
    setIds(next);
    setDirty(JSON.stringify(next) !== JSON.stringify(savedIds));
  }
  function move(index: number, direction: -1 | 1) {
    const next = [...ids];
    [next[index], next[index + direction]] = [
      next[index + direction],
      next[index]
    ];
    change(next);
  }
  return (
    <details className="space-y-4">
      <summary className="cursor-pointer py-3 font-semibold">
        Edit Menu shortcuts
      </summary>
      <p>
        Choose up to {initial.limit} shortcuts. Their order is saved to your
        account for other devices. A shortcut gives no extra access.
      </p>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void action.command({ expectedVersion: initial.version, ids });
        }}
      >
        <fieldset className="space-y-4" disabled={action.blocked}>
          <legend className="font-semibold">Available shortcuts</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {initial.choices.map((item) => (
              <label
                key={item.id}
                className="flex min-h-11 items-center gap-3 break-words"
              >
                <input
                  type="checkbox"
                  checked={ids.includes(item.id)}
                  disabled={
                    !ids.includes(item.id) && ids.length >= initial.limit
                  }
                  onChange={(event) =>
                    change(
                      event.target.checked
                        ? [...ids, item.id]
                        : ids.filter((id) => id !== item.id)
                    )
                  }
                />
                <span>{item.title}</span>
              </label>
            ))}
          </div>
          <p aria-live="polite">
            {ids.length} of {initial.limit} shortcuts selected.
          </p>
          {unavailable && (
            <p role="status">
              A selected shortcut is no longer available. Remove it before
              saving, or reload current choices.
            </p>
          )}
          {ids.length > 0 && (
            <ol aria-label="Shortcut order" className="space-y-3">
              {ids.map((id, index) => {
                const title =
                  initial.choices.find((item) => item.id === id)?.title ??
                  "Unavailable shortcut";
                return (
                  <li
                    key={id}
                    className="flex min-w-0 flex-wrap items-center gap-2 rounded-lg border border-gc-divider p-3"
                  >
                    <span className="min-w-0 flex-1 break-words">
                      {index + 1}. {title}
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {!initial.choices.some((item) => item.id === id) && (
                        <button
                          type="button"
                          className="gc-button gc-button-quiet"
                          onClick={() =>
                            change(ids.filter((entry) => entry !== id))
                          }
                        >
                          Remove unavailable shortcut
                        </button>
                      )}
                      <button
                        type="button"
                        className="gc-button gc-button-quiet"
                        disabled={index === 0}
                        aria-label={`Move ${title} up`}
                        onClick={() => move(index, -1)}
                      >
                        Up
                      </button>
                      <button
                        type="button"
                        className="gc-button gc-button-quiet"
                        disabled={index === ids.length - 1}
                        aria-label={`Move ${title} down`}
                        onClick={() => move(index, 1)}
                      >
                        Down
                      </button>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
          <button
            className="gc-button"
            type="submit"
            disabled={!dirty || unavailable}
          >
            Save Menu shortcuts
          </button>
        </fieldset>
      </form>
      {action.status}
      <div className="flex flex-wrap gap-3">
        {dirty && (
          <button
            type="button"
            className="gc-button gc-button-quiet"
            disabled={action.blocked}
            onClick={() => {
              if (confirm("Discard these unsaved shortcut choices?"))
                change(savedIds);
            }}
          >
            Discard local shortcut edits
          </button>
        )}
        <button
          type="button"
          className="gc-button gc-button-quiet"
          disabled={action.blocked}
          onClick={() => {
            if (
              confirm(
                "Remove all saved Menu shortcuts and discard these local shortcut edits? Other settings stay the same."
              )
            )
              void action.command({
                expectedVersion: initial.version,
                ids: []
              });
          }}
        >
          Reset Menu shortcuts
        </button>
      </div>
    </details>
  );
}
