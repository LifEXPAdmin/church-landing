"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import { socialRequest, SocialClientError } from "@/lib/platform/social-client";
import type { SettingsContext } from "@/lib/platform/settings-context";
import {
  settingsFolders,
  settingsRegistry,
  searchSettings,
  settingHref,
  type SettingRegistration
} from "@/lib/platform/settings-registry";
import { GoogleAccountOptions } from "./google-account";
import { AccountIdentitySummary, SettingsControls } from "./settings-controls";
import { SettingsSecurity } from "./settings-security";
import { SettingsPrivacy } from "./settings-privacy";

const positions = new Map<string, { y: number; focus: string }>();
let positionOwner: string | null = null;

export function SettingsWorkspace({
  owner,
  folder,
  setting
}: {
  owner: string;
  folder?: string;
  setting?: string;
}) {
  const router = useRouter(),
    pathname = usePathname(),
    params = useSearchParams();
  const initialQuery = folder ? "" : (params.get("q") ?? "").slice(0, 200);
  const [query, setQuery] = useState(initialQuery);
  const [data, setData] = useState<SettingsContext | null>(null),
    [hidden, setHidden] = useState(true),
    [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const generation = useRef(0),
    restored = useRef(false),
    savedQuery = useRef(initialQuery);
  const key =
    pathname + (initialQuery ? "?q=" + encodeURIComponent(initialQuery) : "");
  const load = useCallback(async () => {
    const seq = ++generation.current;
    setBusy(true);
    setError("");
    try {
      const r = await socialRequest<SettingsContext>(
        "/api/platform/settings",
        undefined,
        owner
      );
      if (seq !== generation.current) return;
      if (r.data.ownerId !== owner) {
        setData(null);
        router.refresh();
        throw new Error(
          "Your sign-in changed. Reload settings before continuing."
        );
      }
      if (
        !r.data.methods ||
        typeof r.data.methods.password !== "boolean" ||
        typeof r.data.methods.google !== "boolean"
      )
        throw new Error(
          "Sign-in options could not be checked. Retry settings."
        );
      if (
        !r.data.privacy ||
        !["EVERYONE", "FOLLOWED", "NOBODY"].includes(r.data.privacy.mentions) ||
        typeof r.data.privacy.showRelationships !== "boolean"
      )
        throw new Error(
          "Privacy choices could not be checked. Retry settings."
        );
      setData(r.data);
      setHidden(false);
    } catch (e) {
      if (seq === generation.current) {
        setHidden(true);
        setError(
          e instanceof Error
            ? e.message
            : "Settings could not be checked. Try again."
        );
        if (e instanceof SocialClientError && e.status === 401) {
          setData(null);
          router.refresh();
        }
      }
    } finally {
      if (seq === generation.current) setBusy(false);
    }
  }, [owner, router]);
  useEffect(() => {
    if (positionOwner !== owner) {
      positions.clear();
      positionOwner = owner;
    }
    void load();
    const hide = () => {
      generation.current++;
      setHidden(true);
      setBusy(false);
    };
    const restore = () => {
      if (document.visibilityState !== "hidden") void load();
    };
    const visibility = () =>
      document.visibilityState === "hidden" ? hide() : restore();
    window.addEventListener("blur", hide);
    window.addEventListener("focus", restore);
    window.addEventListener("online", restore);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      // Request generation counter, not a DOM ref.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      generation.current++;
      window.removeEventListener("blur", hide);
      window.removeEventListener("focus", restore);
      window.removeEventListener("online", restore);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [load, owner]);
  useEffect(() => {
    setQuery(initialQuery);
    savedQuery.current = initialQuery;
  }, [initialQuery]);
  useEffect(() => {
    if (!data || hidden || restored.current) return;
    restored.current = true;
    const saved = positions.get(key);
    if (!saved) return;
    const frame = requestAnimationFrame(() => {
      document.getElementById(saved.focus)?.focus({ preventScroll: true });
      window.scrollTo(0, saved.y);
    });
    return () => cancelAnimationFrame(frame);
  }, [data, hidden, key]);
  function remember(event: React.MouseEvent) {
    if (event.defaultPrevented) return;
    const target = (event.target as Element).closest<HTMLAnchorElement>(
      "a[href]"
    );
    if (!target) return;
    const from =
      pathname + (!folder && query ? "?q=" + encodeURIComponent(query) : "");
    positions.set(from, { y: window.scrollY, focus: target.id });
    if (positions.size > 40) positions.delete(positions.keys().next().value!);
    if (!folder && savedQuery.current !== query) {
      const url = new URL(location.href);
      if (query) url.searchParams.set("q", query);
      else url.searchParams.delete("q");
      history.replaceState(history.state, "", url.pathname + url.search);
      savedQuery.current = query;
    }
  }
  const activeFolder = settingsFolders.find((f) => f.id === folder);
  const active = setting
    ? settingsRegistry.find(
        (s) => s.folder === folder && s.id.split(".")[1] === setting
      )
    : undefined;
  const entries = settingsRegistry.filter(
    (s) =>
      s.state !== "future" &&
      (s.id !== "profile.photos" || data?.photosAvailable)
  );
  const results = query.trim() ? searchSettings(query, entries) : [];
  const scope =
    active?.scope === "browser"
      ? "This browser"
      : active?.scope === "church"
        ? "Selected church"
        : "Personal settings";
  const rows = (list: readonly SettingRegistration[], showPath = false) => (
    <div className="gc-settings-rows">
      {list.map((s) => (
        <Link
          key={s.id}
          id={"setting-" + s.id.replaceAll(".", "-")}
          className="gc-settings-destination"
          href={settingHref(s)}
        >
          <span>
            <strong>{s.label}</strong>
            {showPath && (
              <small>
                Settings ›{" "}
                {settingsFolders.find((f) => f.id === s.folder)?.label}
              </small>
            )}
            <span>{s.description}</span>
          </span>
          <ChevronRight aria-hidden="true" />
        </Link>
      ))}
    </div>
  );
  return (
    <div className="gc-settings-workspace" onClickCapture={remember}>
      <nav className="gc-settings-sidebar" aria-label="Settings folders">
        <Link
          href="/platform/settings"
          aria-current={!folder ? "page" : undefined}
        >
          All settings
        </Link>
        {settingsFolders.map((f) => (
          <Link
            key={f.id}
            href={"/platform/settings/" + f.id}
            aria-current={folder === f.id ? "page" : undefined}
          >
            {f.label}
          </Link>
        ))}
      </nav>
      <div className="gc-settings-main">
        <nav aria-label="Settings path" className="gc-settings-breadcrumb">
          <Link
            href={
              active
                ? "/platform/settings/" + folder
                : folder
                  ? "/platform/settings"
                  : "/platform/menu"
            }
          >
            {active
              ? "Back to " + activeFolder?.label
              : folder
                ? "Back to settings"
                : "Back to Menu"}
          </Link>
        </nav>
        <header className="space-y-3">
          <p className="gc-eyebrow">{scope}</p>
          <h1 className="text-4xl sm:text-5xl">
            {active?.label ?? activeFolder?.label ?? "Settings"}
          </h1>
          <p className="text-gc-muted">
            {active?.description ??
              activeFolder?.description ??
              "Find the choices that make Godschurches work for you."}
          </p>
        </header>
        {busy && !data && <p role="status">Loading your settings…</p>}
        {error && (
          <div className="gc-settings">
            <p role="status">{error}</p>
            <button
              type="button"
              className="gc-button"
              disabled={busy}
              onClick={() => void load()}
            >
              Retry settings
            </button>
          </div>
        )}
        {data && (
          <div
            inert={hidden ? true : undefined}
            aria-hidden={hidden ? true : undefined}
            style={hidden ? { visibility: "hidden" } : undefined}
          >
            <GoogleAccountOptions enabled={data.googleAvailable}>
              {!folder && (
                <>
                  <div className="gc-settings-account">
                    <strong>{data.name}</strong>
                    <span>@{data.username} · Personal account</span>
                    <p>
                      Account controls are private. Your member profile and
                      church directory choices are separate.
                    </p>
                  </div>
                  <form
                    role="search"
                    className="gc-settings-search"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const url = query
                        ? "?q=" + encodeURIComponent(query)
                        : "";
                      router.replace("/platform/settings" + url, {
                        scroll: false
                      });
                    }}
                  >
                    <label htmlFor="settings-search">Search settings</label>
                    <input
                      id="settings-search"
                      name="q"
                      type="search"
                      maxLength={200}
                      value={query}
                      placeholder="Try password, alerts or hide phone"
                      onChange={(e) => setQuery(e.target.value)}
                    />
                    <button type="submit" className="gc-button gc-button-quiet">
                      Search
                    </button>
                  </form>
                  {query.trim() ? (
                    <section aria-label="Settings search results">
                      <p role="status">
                        {results.length
                          ? `${results.length} matching ${results.length === 1 ? "setting" : "settings"}.`
                          : "No matching settings. Try a different word."}
                      </p>
                      {rows(results, true)}
                    </section>
                  ) : (
                    <div className="gc-settings-folder-list">
                      {settingsFolders.map((f) => (
                        <Link
                          id={"folder-" + f.id}
                          className="gc-settings-destination"
                          key={f.id}
                          href={"/platform/settings/" + f.id}
                        >
                          <span>
                            <strong>{f.label}</strong>
                            <span>{f.description}</span>
                          </span>
                          <ChevronRight aria-hidden="true" />
                        </Link>
                      ))}
                    </div>
                  )}
                </>
              )}
              {folder === "account" && !active && (
                <div className="gc-settings">
                  <AccountIdentitySummary data={data} />
                </div>
              )}
              {folder === "security" && !active && (
                <SettingsSecurity data={data} />
              )}
              {folder === "privacy" && !active && (
                <SettingsPrivacy data={data} />
              )}
              {folder &&
                !active &&
                rows(entries.filter((s) => s.folder === folder))}
              {active && "control" in active.destination && (
                <SettingsControls
                  control={active.destination.control}
                  data={data}
                />
              )}
            </GoogleAccountOptions>
          </div>
        )}
      </div>
    </div>
  );
}
