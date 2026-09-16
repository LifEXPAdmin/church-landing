"use client";
import { useId } from "react";
import {
  EXCHANGE_CONTACT_NOTICE,
  EXCHANGE_ITEM_NOTICE,
  exchangeCategoryLabels,
  exchangeConditionLabels,
  exchangeCurrencies,
  exchangeIntentLabels,
  type ExchangeEditorFields as Fields
} from "@/lib/platform/exchange-options";
import { DiscoveryPlacePicker } from "./discovery-place-picker";
import { portalInputClass } from "./portal-action-form";

export function ExchangeEditorFields({
  value,
  onChange,
  churches,
  disabled
}: {
  value: Fields;
  onChange: (fields: Fields) => void;
  churches: { id: string; name: string }[];
  disabled: boolean;
}) {
  const id = useId();
  const change = <K extends keyof Fields>(key: K, field: Fields[K]) =>
    onChange({ ...value, [key]: field });
  const unavailableChurch =
    !!value.audienceChurchId &&
    !churches.some((c) => c.id === value.audienceChurchId);
  return (
    <fieldset disabled={disabled} className="min-w-0 space-y-6">
      <legend className="mb-3 text-2xl font-semibold">Item details</legend>
      <p className="text-gc-muted">
        Save an incomplete draft privately. The marked details are required
        before publication.
      </p>
      <label className="block space-y-2" htmlFor={`${id}-intent`}>
        <span id={`${id}-intent-label`}> Listing type </span>
        <select
          id={`${id}-intent`}
          aria-labelledby={`${id}-intent-label`}
          className={portalInputClass}
          value={value.intent}
          onChange={(e) =>
            onChange({
              ...value,
              intent: e.target.value as Fields["intent"],
              ...(e.target.value === "FREE" ? { price: "", currency: "" } : {})
            })
          }
        >
          {Object.entries(exchangeIntentLabels).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <p className="text-sm text-gc-muted">
        Choosing Free clears the price and currency. A displayed sale price does
        not create a payment or reservation.
      </p>
      <label className="block space-y-2" htmlFor={`${id}-title`}>
        <span id={`${id}-title-label`}> Title (required to publish) </span>
        <input
          id={`${id}-title`}
          aria-labelledby={`${id}-title-label`}
          className={portalInputClass}
          maxLength={120}
          value={value.title}
          onChange={(e) => change("title", e.target.value)}
        />
      </label>
      <label className="block space-y-2" htmlFor={`${id}-description`}>
        <span id={`${id}-description-label`}>
          {" "}
          Description (required to publish){" "}
        </span>
        <textarea
          id={`${id}-description`}
          aria-labelledby={`${id}-description-label`}
          className={portalInputClass}
          rows={6}
          maxLength={5000}
          value={value.description}
          onChange={(e) => change("description", e.target.value)}
          aria-describedby={`${id}-privacy`}
        />
      </label>
      <p id={`${id}-privacy`} className="text-sm text-gc-muted">
        {EXCHANGE_CONTACT_NOTICE}
      </p>
      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
        <label className="block min-w-0 space-y-2" htmlFor={`${id}-category`}>
          <span id={`${id}-category-label`}>
            {" "}
            Category (required to publish){" "}
          </span>
          <select
            id={`${id}-category`}
            aria-labelledby={`${id}-category-label`}
            className={portalInputClass}
            value={value.category}
            onChange={(e) =>
              change("category", e.target.value as Fields["category"])
            }
          >
            <option value="">Choose a category</option>
            {Object.entries(exchangeCategoryLabels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="block min-w-0 space-y-2" htmlFor={`${id}-condition`}>
          <span id={`${id}-condition-label`}>
            {" "}
            Condition (required to publish){" "}
          </span>
          <select
            id={`${id}-condition`}
            aria-labelledby={`${id}-condition-label`}
            className={portalInputClass}
            value={value.condition}
            onChange={(e) =>
              change("condition", e.target.value as Fields["condition"])
            }
          >
            <option value="">Choose the condition</option>
            {Object.entries(exchangeConditionLabels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {value.intent === "SALE" && (
        <fieldset className="min-w-0 space-y-3 rounded-xl border border-gc-divider p-4">
          <legend className="px-1 font-semibold">
            Sale price (required to publish)
          </legend>
          <label className="block space-y-2" htmlFor={`${id}-currency`}>
            <span id={`${id}-currency-label`}> Currency </span>
            <select
              id={`${id}-currency`}
              aria-labelledby={`${id}-currency-label`}
              className={portalInputClass}
              value={value.currency}
              onChange={(e) =>
                change("currency", e.target.value as Fields["currency"])
              }
            >
              <option value="">Choose a currency</option>
              {Object.entries(exchangeCurrencies).map(([key, item]) => (
                <option key={key} value={key}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-2" htmlFor={`${id}-price`}>
            <span id={`${id}-price-label`}> Amount </span>
            <input
              id={`${id}-price`}
              aria-labelledby={`${id}-price-label`}
              className={portalInputClass}
              inputMode="decimal"
              maxLength={16}
              value={value.price}
              onChange={(e) => change("price", e.target.value)}
              aria-describedby={`${id}-precision`}
            />
          </label>
          <p id={`${id}-precision`} className="text-sm">
            Use digits and a decimal point without a currency symbol.{" "}
            {value.currency
              ? `${exchangeCurrencies[value.currency].digits === 0 ? "Use a whole amount" : `Use up to ${exchangeCurrencies[value.currency].digits} decimal places`} for ${value.currency}.`
              : "Choose the currency explicitly."}{" "}
            Your amount will not be rounded or converted.
          </p>
        </fieldset>
      )}
      <fieldset className="min-w-0 space-y-3 rounded-xl border border-gc-divider p-4">
        <legend className="px-1 font-semibold">
          Coarse pickup area (required to publish)
        </legend>
        <p className="text-sm">
          Choose a town or area. This choice appears with the listing. Your
          private profile location is not copied.
        </p>
        <DiscoveryPlacePicker
          country={value.country || null}
          placeId={value.placeId}
          disabled={disabled}
          onCountry={(country) =>
            onChange({ ...value, country: country ?? "", placeId: null })
          }
          onPlace={(place) => change("placeId", place)}
        />
      </fieldset>
      <fieldset className="min-w-0 space-y-3 rounded-xl border border-gc-divider p-4">
        <legend className="px-1 font-semibold">
          Who may read this listing?
        </legend>
        <label className="block space-y-2" htmlFor={`${id}-audience`}>
          <span id={`${id}-audience-label`}> Audience </span>
          <select
            id={`${id}-audience`}
            aria-labelledby={`${id}-audience-label`}
            className={portalInputClass}
            value={value.audience}
            onChange={(e) =>
              onChange({
                ...value,
                audience: e.target.value as Fields["audience"],
                ...(e.target.value === "PUBLIC" ? { audienceChurchId: "" } : {})
              })
            }
          >
            <option value="PUBLIC">Public</option>
            <option value="CHURCH">One approved church</option>
          </select>
        </label>
        {value.audience === "CHURCH" && (
          <label className="block space-y-2" htmlFor={`${id}-church`}>
            <span id={`${id}-church-label`}>
              {" "}
              Church (required to publish){" "}
            </span>
            <select
              id={`${id}-church`}
              aria-labelledby={`${id}-church-label`}
              className={portalInputClass}
              value={value.audienceChurchId}
              onChange={(e) => change("audienceChurchId", e.target.value)}
            >
              <option value="">Choose an approved church</option>
              {unavailableChurch && (
                <option value={value.audienceChurchId}>
                  Previous choice is no longer available
                </option>
              )}
              {churches.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <p className="text-sm text-gc-muted">
          Public listings may be read without an account. A church audience
          requires current approved membership and an assigned Exchange
          reviewer. Photos follow the same audience. Changing the audience does
          not change who owns the listing.
        </p>
      </fieldset>
      <p className="rounded-xl border border-gc-divider p-4 text-sm">
        {EXCHANGE_ITEM_NOTICE}
      </p>
    </fieldset>
  );
}
