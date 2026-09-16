"use client";
import Link from "next/link";
import { useId, useState } from "react";
import type { readExchangeDefaults } from "@/lib/platform/exchange-defaults";
import {
  EXCHANGE_DEFAULTS_SCHEMA,
  exchangePersonalDefaultIntents,
  type ExchangeDefaultFields
} from "@/lib/platform/exchange-handoff-options";
import { exchangeIntentLabels } from "@/lib/platform/exchange-options";
import { DiscoveryPlacePicker } from "./discovery-place-picker";
import { useExchangeAction } from "./exchange-saved-controls";
import { portalInputClass } from "./portal-action-form";

export function ExchangeDefaultsForm({
  initial
}: {
  initial: Awaited<ReturnType<typeof readExchangeDefaults>>;
}) {
  const id = useId(),
    [fields, setFields] = useState(initial.fields);
  const dirty = JSON.stringify(fields) !== JSON.stringify(initial.fields),
    action = useExchangeAction(initial.ownerId, dirty, undefined, true);
  return (
    <form
      className="space-y-5"
      aria-label="Personal listing defaults"
      onSubmit={(event) => {
        event.preventDefault();
        void action.command({
          operation: "defaults-save",
          expectedVersion: initial.version,
          schema: EXCHANGE_DEFAULTS_SCHEMA,
          fields
        });
      }}
    >
      <p>
        Apply these private choices deliberately in a new personal draft. They
        never change existing listings, apply to church-owned drafts, or enable
        inquiries. Review every draft before publication.
      </p>
      {initial.recoveryRequired && (
        <p role="status">
          Recovery concealed your previous defaults. Review and save new choices
          before using them.
        </p>
      )}
      {!initial.available && !initial.recoveryRequired && (
        <p role="status">
          Your saved church audience is unavailable. Choose a currently approved
          church or deliberately choose Public before saving.
        </p>
      )}
      <fieldset className="min-w-0 space-y-5" disabled={action.blocked}>
        <label className="block space-y-2" htmlFor={`${id}-intent`}>
          <span>Default personal listing type</span>
          <select
            id={`${id}-intent`}
            className={portalInputClass}
            value={fields.intent}
            onChange={(e) =>
              setFields({
                ...fields,
                intent: e.target.value as ExchangeDefaultFields["intent"]
              })
            }
          >
            {exchangePersonalDefaultIntents.map((value) => (
              <option key={value} value={value}>
                {exchangeIntentLabels[value]}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-2" htmlFor={`${id}-audience`}>
          <span>Default audience</span>
          <select
            id={`${id}-audience`}
            className={portalInputClass}
            value={fields.audience}
            onChange={(e) =>
              setFields({
                ...fields,
                audience: e.target.value as ExchangeDefaultFields["audience"],
                audienceChurchId:
                  e.target.value === "CHURCH"
                    ? (initial.churches[0]?.id ?? null)
                    : null
              })
            }
          >
            <option value="PUBLIC">Public</option>
            <option value="CHURCH">One approved church</option>
          </select>
        </label>
        {fields.audience === "CHURCH" && (
          <label className="block space-y-2" htmlFor={`${id}-church`}>
            <span>Approved church audience</span>
            <select
              id={`${id}-church`}
              required
              className={portalInputClass}
              value={fields.audienceChurchId ?? ""}
              onChange={(e) =>
                setFields({
                  ...fields,
                  audienceChurchId: e.target.value || null
                })
              }
            >
              <option value="">Choose an approved church</option>
              {fields.audienceChurchId &&
                !initial.churches.some(
                  (c) => c.id === fields.audienceChurchId
                ) && (
                  <option value={fields.audienceChurchId}>
                    Previously saved church is unavailable
                  </option>
                )}
              {initial.churches.map((c) => (
                <option value={c.id} key={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <section className="space-y-3" aria-label="Default general town">
          <h2 className="text-2xl">General listing area</h2>
          <p>
            A listing can show this town. Keep exact addresses in private pickup
            instructions.
          </p>
          <DiscoveryPlacePicker
            country={fields.country}
            placeId={fields.placeId}
            onCountry={(country) =>
              setFields({ ...fields, country, placeId: null })
            }
            onPlace={(placeId) => setFields({ ...fields, placeId })}
            disabled={action.blocked}
          />
        </section>
        <label className="block space-y-2" htmlFor={`${id}-pickup`}>
          <span>Reusable private pickup instructions (optional)</span>
          <textarea
            id={`${id}-pickup`}
            rows={5}
            maxLength={2000}
            className={portalInputClass}
            value={fields.pickupDetails}
            onChange={(e) =>
              setFields({ ...fields, pickupDetails: e.target.value })
            }
          />
        </label>
        <p>
          This text stays in your private defaults. Copy it deliberately when
          proposing a handoff, then review it. Only the two agreed participants
          can read the saved handoff instructions.
        </p>
        <button type="submit" className="gc-button">
          Save personal defaults
        </button>
        {dirty && (
          <button
            type="button"
            className="gc-button gc-button-quiet"
            onClick={() => setFields(initial.fields)}
          >
            Discard unsaved defaults
          </button>
        )}
      </fieldset>
      {action.status}
      <p>
        <Link
          prefetch={false}
          className="underline"
          href="/platform/settings/privacy/messages?context=exchange"
        >
          Contact request choices
        </Link>{" "}
        and{" "}
        <Link
          prefetch={false}
          className="underline"
          href="/platform/settings/notifications/availability?context=exchange"
        >
          handoff alerts
        </Link>{" "}
        remain separate.
      </p>
    </form>
  );
}
