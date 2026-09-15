"use client";
import { useState } from "react";
import type { WelcomePostView } from "@/lib/platform/church-welcome-commands";
import { welcomePurposes } from "@/lib/platform/onboarding-options";
import { useWelcomeView } from "./use-welcome-view";
import { useUnsavedSocialWork } from "./use-unsaved-social-work";
export function WelcomePostLabel({
  ownerId,
  churchId,
  postId,
  active
}: {
  ownerId: string;
  churchId: string;
  postId: string;
  active: boolean;
}) {
  const [purpose, setPurpose] = useState<string | null>(null),
    [baseVersion, setBaseVersion] = useState<number | null>(null),
    [notice, setNotice] = useState("");
  const { data, message, saving, save, refresh, unconfirmed, retry } =
    useWelcomeView<WelcomePostView>(
      "/api/platform/church-tools?view=post&churchId=" +
        encodeURIComponent(churchId) +
        "&postId=" +
        encodeURIComponent(postId),
      ownerId,
      active
    );
  useUnsavedSocialWork(
    {
      dirty: baseVersion !== null,
      saving: false,
      conflict: !!data && baseVersion !== null && baseVersion !== data.version
    },
    () =>
      setNotice("Save, retry or discard your local post label before leaving."),
    true
  );
  return (
    <section className="space-y-3" aria-label="Welcome and questions">
      <p>
        Optionally label this church post so an authorized welcome host can find
        an unanswered introduction or question. This changes no audience and
        sends no message.
      </p>
      {message && <p role="status">{message}</p>}
      {notice && <p role="status">{notice}</p>}
      {baseVersion !== null && !unconfirmed && !saving && (
        <button
          type="button"
          className="gc-button gc-button-quiet"
          onClick={() => {
            setPurpose(null);
            setBaseVersion(null);
            setNotice("");
          }}
        >
          Discard local post label
        </button>
      )}
      {unconfirmed && (
        <button
          className="gc-button gc-button-quiet"
          disabled={saving}
          onClick={() =>
            void retry().then((ok) => {
              if (ok) {
                setPurpose(null);
                setBaseVersion(null);
                setNotice("");
              }
            })
          }
        >
          Retry unconfirmed change
        </button>
      )}
      {data ? (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void save({
              operation: "tag",
              churchId,
              postId,
              purpose: purpose ?? data.purpose,
              expectedVersion: baseVersion ?? data.version
            }).then((ok) => {
              if (ok) {
                setPurpose(null);
                setBaseVersion(null);
              }
            });
          }}
        >
          <label className="block">
            Post label
            <select
              className="mt-1 w-full rounded-lg border border-gc-divider p-3"
              disabled={saving}
              value={purpose ?? data.purpose}
              onChange={(e) => {
                setPurpose(e.target.value);
                setBaseVersion((v) => v ?? data.version);
              }}
            >
              {Object.entries(welcomePurposes).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {baseVersion !== null && baseVersion !== data.version && (
            <div role="status">
              <p>
                The current label changed to{" "}
                {welcomePurposes[data.purpose as keyof typeof welcomePurposes]}.
                Review it before applying your choice.
              </p>
              <button
                type="button"
                className="gc-button gc-button-quiet"
                disabled={saving}
                onClick={() => setBaseVersion(data.version)}
              >
                I reviewed the current label
              </button>
            </div>
          )}

          <button className="gc-button gc-button-quiet" disabled={saving}>
            Save post label
          </button>
        </form>
      ) : (
        <button
          className="gc-button gc-button-quiet"
          onClick={() => void refresh()}
        >
          Check post access
        </button>
      )}
    </section>
  );
}
