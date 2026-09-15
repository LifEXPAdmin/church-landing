"use client";
import {
  discoveryCountryLabel,
  discoveryLanguageLabel
} from "@/lib/platform/discovery-options";
import { useRef, useState } from "react";
import { flushSync } from "react-dom";
import { socialRequest, SocialClientError } from "@/lib/platform/social-client";
import type { DiscoveryExplanation } from "@/lib/platform/discovery-ranking";
import { useUnsavedSocialWork } from "./use-unsaved-social-work";
import { settlePhotoNavigation } from "./use-photo-back-guard";
export function DiscoveryPostExplanation({
  value,
  owner
}: {
  value: DiscoveryExplanation;
  owner: string | null;
}) {
  const [topic, setTopic] = useState(value.topics[0] ?? ""),
    [busy, setBusy] = useState(false),
    [pending, setPending] = useState<string | null>(null),
    [message, setMessage] = useState("");
  const flight = useRef(false);
  useUnsavedSocialWork(
    { dirty: false, saving: busy || !!pending, conflict: false },
    () =>
      setMessage("Confirm your pending recommendation choice before leaving."),
    true
  );
  async function feedback(choice: "more" | "less" | "clear") {
    if (!owner || !topic || flight.current) return;
    flight.current = true;
    setBusy(true);
    setMessage("");
    try {
      let body = pending;
      if (!body) {
        const { data } = await socialRequest<{ version: number }>(
          "/api/platform/discovery",
          undefined,
          owner
        );
        if (!Number.isSafeInteger(data.version))
          throw new SocialClientError(
            503,
            "Current recommendation choices could not be checked."
          );
        body = JSON.stringify({
          operation: "feedback",
          topic,
          choice,
          expectedVersion: data.version,
          mutationId: crypto.randomUUID()
        });
        setPending(body);
      }
      const { data } = await socialRequest<{
        id: string;
        version: number;
        message: string;
      }>("/api/platform/discovery", body, owner);
      if (data.id !== owner || !Number.isSafeInteger(data.version))
        throw new SocialClientError(
          503,
          "The recommendation choice was not confirmed."
        );
      flushSync(() => {
        setPending(null);
        setBusy(false);
        setMessage(data.message);
      });
      await settlePhotoNavigation();
    } catch (error) {
      if (
        error instanceof SocialClientError &&
        [400, 403, 404, 409, 429].includes(error.status)
      )
        setPending(null);
      setMessage(
        error instanceof Error
          ? error.message
          : "Your recommendation choice was not confirmed. Retry it."
      );
    } finally {
      flight.current = false;
      setBusy(false);
    }
  }
  return (
    <details
      className="my-2 rounded-lg border border-gc-border px-3 py-1 text-sm"
      data-reader-dirty={!!pending}
      data-reader-busy={busy}
    >
      <summary className="min-h-11 cursor-pointer py-3 font-semibold">
        Why this post? · {value.stage}
      </summary>
      <ul className="mb-3 list-disc space-y-1 pl-5">
        {value.reasons.length ? (
          value.reasons.map((reason, i) => (
            <li key={reason.code + i}>{reason.label}</li>
          ))
        ) : (
          <li>This post is currently eligible for your selected feed.</li>
        )}
      </ul>
      <p className="mb-3 text-gc-muted">
        {value.classification.language
          ? `Author-selected language: ${discoveryLanguageLabel(value.classification.language)}`
          : "Unclassified language"}{" "}
        · {value.classification.denomination ?? "Unclassified tradition"}
        {value.classification.locality
          ? ` · Author-shared country: ${discoveryCountryLabel(value.classification.locality)}`
          : ""}
      </p>
      {owner && value.topics.length > 0 && (
        <div className="space-y-2">
          <label className="block">
            Recommendation topic
            <select
              className="ml-2 min-h-11 max-w-full rounded-lg border border-gc-border bg-gc-surface px-2"
              value={topic}
              disabled={busy || !!pending}
              onChange={(e) => setTopic(e.target.value)}
            >
              {value.topics.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap gap-2">
            {pending ? (
              <button
                type="button"
                className="gc-button gc-button-quiet"
                disabled={busy}
                onClick={() => void feedback("more")}
              >
                Retry the same recommendation choice
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="gc-button gc-button-quiet"
                  disabled={busy}
                  onClick={() => void feedback("more")}
                >
                  More of this topic
                </button>
                <button
                  type="button"
                  className="gc-button gc-button-quiet"
                  disabled={busy}
                  onClick={() => void feedback("less")}
                >
                  Less of this topic
                </button>
                <button
                  type="button"
                  className="min-h-11 underline"
                  disabled={busy}
                  onClick={() => void feedback("clear")}
                >
                  Clear this topic feedback
                </button>
              </>
            )}
          </div>
          <p className="text-gc-muted">
            More/Less changes recommendation weight only. Your current page
            stays in place; refresh posts to apply it. Hidden topics and a full
            feedback reset are in Feed Settings.
          </p>
        </div>
      )}
      {message && (
        <p role="status" className="my-2">
          {message}
        </p>
      )}
    </details>
  );
}
