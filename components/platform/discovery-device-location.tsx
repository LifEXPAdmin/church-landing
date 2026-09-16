"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { coarseDeviceArea } from "@/lib/platform/device-location";
import { discoveryCountryLabel } from "@/lib/platform/discovery-options";
import { currentSocialOwner } from "@/lib/platform/social-client";
import { useReadVisibility } from "./read-visibility";

type Place = { id: number; country: string; label: string };
export function DiscoveryDeviceLocation({
  owner,
  country,
  disabled,
  onPlace
}: {
  owner: string;
  country: string | null;
  disabled: boolean;
  onPlace: (id: number) => void;
}) {
  const visible = useReadVisibility();
  const allowed = useRef(false);
  allowed.current = visible && !disabled;
  const sequence = useRef(0),
    controller = useRef<AbortController | null>(null),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [places, setPlaces] = useState<Place[]>([]);
  const stop = useCallback(() => {
    sequence.current++;
    controller.current?.abort();
    controller.current = null;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);
  useEffect(() => () => stop(), [stop]);
  useEffect(() => {
    if (visible && !disabled) return;
    stop();
    setBusy(false);
    setPlaces([]);
    setMessage("");
  }, [visible, disabled, stop]);

  async function start() {
    if (!country || busy || !allowed.current) return;
    setPlaces([]);
    if (!window.isSecureContext || !navigator.geolocation) {
      setMessage(
        "Device location is unavailable here. Choose a country and town manually."
      );
      return;
    }
    stop();
    const seq = sequence.current,
      abort = new AbortController();
    controller.current = abort;
    const active = () =>
      seq === sequence.current && allowed.current && !abort.signal.aborted;
    const finish = (notice: string, suggestions: Place[] = []) => {
      if (!active()) return;
      stop();
      setBusy(false);
      setPlaces(suggestions);
      setMessage(notice);
    };
    setBusy(true);
    setMessage(
      "Checking access, then asking this device once. You can cancel and choose a town manually."
    );
    // Also bound time spent waiting for a browser permission prompt.
    timer.current = setTimeout(
      () =>
        finish(
          "The location request took too long. Retry or choose a town manually."
        ),
      25000
    );
    const request = async (body?: string) => {
      const response = await fetch("/api/platform/discovery/device", {
        method: body ? "POST" : "GET",
        cache: "no-store",
        credentials: "same-origin",
        signal: abort.signal,
        headers: {
          "X-Expected-Account": owner,
          ...(body ? { "Content-Type": "application/json" } : {})
        },
        ...(body ? { body } : {})
      });
      const result = await response.json();
      if (!response.ok)
        throw Error(
          result.message ??
            "Area suggestions are unavailable. Choose a town manually."
        );
      if (result.ownerId !== owner)
        throw Error("Your sign-in changed. Reload before continuing.");
      return result;
    };
    try {
      const access = await request();
      if (!active()) return;
      if (access.available !== true)
        throw Error("Device location is unavailable. Choose a town manually.");
      navigator.geolocation.getCurrentPosition(
        (position) => {
          if (!active()) return;
          const area = coarseDeviceArea(position);
          if (!area) {
            finish(
              "This device could not provide a recent enough or accurate enough location. Choose a town manually or retry."
            );
            return;
          }
          // Only this quarter-degree cell leaves the callback. Never serialize Position.
          void request(JSON.stringify({ country, ...area }))
            .then(async (result) => {
              if (!active()) return;
              if ((await currentSocialOwner()) !== owner)
                throw Error("Your sign-in changed. Reload before continuing.");
              if (!active()) return;
              if (
                !Array.isArray(result.places) ||
                result.places.length > 5 ||
                result.places.some(
                  (place: Place) =>
                    !Number.isSafeInteger(place.id) ||
                    place.id <= 0 ||
                    place.country !== country ||
                    typeof place.label !== "string" ||
                    place.label.length > 500
                )
              )
                throw Error(
                  "Area suggestions could not be confirmed. Choose a town manually."
                );
              finish(
                result.places.length
                  ? "Approximate suggestions in your selected country. Choose an area, then save your feed settings."
                  : "No nearby catalog area was found in that country. Check the country or choose a town manually.",
                result.places
              );
            })
            .catch((error: unknown) =>
              finish(
                error instanceof Error
                  ? error.message
                  : "Area suggestions are unavailable. Choose a town manually."
              )
            );
        },
        (error) =>
          finish(
            error.code === 1
              ? "Location permission was not granted. Manual country and town choices remain available. You can change site permissions in your browser."
              : error.code === 3
                ? "This device timed out. Retry or choose a town manually."
                : "This device could not find your location. Choose a town manually."
          ),
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 0 }
      );
    } catch (error) {
      finish(
        error instanceof Error
          ? error.message
          : "Device location is unavailable. Choose a town manually."
      );
    }
  }

  return (
    <section
      className="space-y-3 rounded-lg border border-gc-border p-3"
      aria-label="Optional device location"
    >
      <h3 className="font-semibold">Suggest an area using this device</h3>
      <p className="text-sm text-gc-muted">
        Optional. After you ask, your browser may request location permission.
        We round the result to an approximate area before sending it to
        God&apos;s Churches to suggest towns in your selected country. Device
        coordinates are not saved. Only the named area you choose is saved when
        you save feed settings. Your profile location and its audience stay
        separate.
      </p>
      <p className="text-sm">
        {country
          ? `Selected country: ${discoveryCountryLabel(country)}.`
          : "Choose a country above first. Manual entry never needs device permission."}
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="gc-button gc-button-quiet"
          disabled={disabled || !visible || !country || busy}
          onClick={() => void start()}
        >
          {busy ? "Finding approximate area…" : "Use device location once"}
        </button>
        {busy && (
          <button
            type="button"
            className="gc-button gc-button-quiet"
            onClick={() => {
              stop();
              setBusy(false);
              setPlaces([]);
              setMessage(
                "Location lookup cancelled. Choose a town manually or start a new request."
              );
            }}
          >
            Cancel location lookup
          </button>
        )}
      </div>
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
      {places.length > 0 && (
        <ul className="rounded-lg border border-gc-border">
          {places.map((place) => (
            <li key={place.id}>
              <button
                type="button"
                className="min-h-11 w-full px-3 py-2 text-left hover:bg-gc-hover"
                disabled={disabled || !visible}
                onClick={() => onPlace(place.id)}
              >
                {place.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
