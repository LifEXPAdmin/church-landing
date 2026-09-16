"use client";
import { useId } from "react";
import {
  EXCHANGE_CONTACT_NOTICE,
  EXCHANGE_ITEM_NOTICE,
  EXCHANGE_SERVICE_NOTICE,
  changeExchangeIntent,
  exchangeItemCategoryLabels,
  exchangeServiceCategoryLabels,
  exchangeServicePricingLabels,
  exchangeServiceUnitLabels,
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
  churchOwned,
  disabled
}: {
  value: Fields;
  onChange: (fields: Fields) => void;
  churches: { id: string; name: string }[];
  churchOwned: boolean;
  disabled: boolean;
}) {
  const id = useId();
  const service = value.intent === "SERVICE";
  const request = value.intent === "WANTED" || value.intent === "CHURCH_NEED";
  const change = <K extends keyof Fields>(key: K, field: Fields[K]) =>
    onChange({ ...value, [key]: field });
  const unavailableChurch =
    !!value.audienceChurchId &&
    !churches.some((c) => c.id === value.audienceChurchId);
  return (
    <fieldset disabled={disabled} className="min-w-0 space-y-6">
      <legend className="mb-3 text-2xl font-semibold">Listing details</legend>
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
          onChange={(e) => {
            const next = changeExchangeIntent(
              value,
              e.target.value as Fields["intent"]
            );
            const clearsEnteredFields = Object.keys(next).some(
              (key) =>
                next[key as keyof Fields] !== value[key as keyof Fields] &&
                key !== "intent" &&
                !!value[key as keyof Fields]
            );
            if (
              !clearsEnteredFields ||
              window.confirm(
                "Change listing type and clear its category, condition, price, requested items and service details? Your title, description, area and audience will remain."
              )
            )
              onChange(next);
          }}
        >
          {Object.entries(exchangeIntentLabels).map(([key, label]) => (
            <option
              key={key}
              value={key}
              disabled={key === "CHURCH_NEED" && !churchOwned}
            >
              {label}
            </option>
          ))}
        </select>
      </label>
      <p className="text-sm text-gc-muted">
        Changing type clears the previous type’s fields. A displayed price does
        not create a payment or reservation. Church need is available only for a
        church-owned listing with an assigned Exchange duty.
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
            {Object.entries(
              service
                ? exchangeServiceCategoryLabels
                : exchangeItemCategoryLabels
            ).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {!service && (
          <label
            className="block min-w-0 space-y-2"
            htmlFor={`${id}-condition`}
          >
            <span id={`${id}-condition-label`}>
              {" "}
              Condition{" "}
              {request ? "(optional preference)" : "(required to publish)"}{" "}
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
        )}
      </div>
      {request && (
        <fieldset className="min-w-0 space-y-3 rounded-xl border border-gc-divider p-4">
          <legend className="px-1 font-semibold">Item request</legend>
          <label className="block space-y-2" htmlFor={`${id}-requestedItems`}>
            <span id={`${id}-requestedItems-label`}>
              Requested items (required to publish)
            </span>
            <textarea
              id={`${id}-requestedItems`}
              aria-labelledby={`${id}-requestedItems-label`}
              className={portalInputClass}
              rows={4}
              maxLength={2000}
              value={value.requestedItems}
              onChange={(e) => change("requestedItems", e.target.value)}
            />
          </label>
          <label className="block space-y-2" htmlFor={`${id}-neededBy`}>
            <span id={`${id}-neededBy-label`}>Needed by (optional)</span>
            <input
              id={`${id}-neededBy`}
              aria-labelledby={`${id}-neededBy-label`}
              type="date"
              min="2000-01-01"
              max="2099-12-31"
              className={portalInputClass}
              value={value.neededBy}
              onChange={(e) => change("neededBy", e.target.value)}
            />
          </label>
          <p className="text-sm text-gc-muted">
            This calendar date describes your request. It does not create a
            booking or automatically close the listing. Keep personal and
            recipient details private.
          </p>
        </fieldset>
      )}
      {service && (
        <fieldset className="min-w-0 space-y-3 rounded-xl border border-gc-divider p-4">
          <legend className="px-1 font-semibold">Service details</legend>
          {(
            [
              ["serviceArea", "Service area (required to publish)", 500, 3],
              ["availability", "Availability (required to publish)", 1000, 3],
              [
                "qualifications",
                "Self-stated qualifications (required to publish)",
                2000,
                4
              ]
            ] as const
          ).map(([key, label, limit, rows]) => (
            <label
              key={key}
              className="block space-y-2"
              htmlFor={`${id}-${key}`}
            >
              <span id={`${id}-${key}-label`}>{label}</span>
              <textarea
                id={`${id}-${key}`}
                aria-labelledby={`${id}-${key}-label`}
                className={portalInputClass}
                rows={rows}
                maxLength={limit}
                value={value[key]}
                onChange={(e) => change(key, e.target.value)}
              />
            </label>
          ))}
          <p className="text-sm text-gc-muted">{EXCHANGE_SERVICE_NOTICE}</p>
          <label className="block space-y-2" htmlFor={`${id}-servicePricing`}>
            <span id={`${id}-servicePricing-label`}>
              Service pricing (required to publish)
            </span>
            <select
              id={`${id}-servicePricing`}
              aria-labelledby={`${id}-servicePricing-label`}
              className={portalInputClass}
              value={value.servicePricing}
              onChange={(e) =>
                onChange({
                  ...value,
                  servicePricing: e.target.value as Fields["servicePricing"],
                  ...(e.target.value !== "FIXED"
                    ? { currency: "", price: "", serviceUnit: "" }
                    : {})
                })
              }
            >
              <option value="">Choose free help or a paid rate</option>
              {Object.entries(exchangeServicePricingLabels).map(
                ([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                )
              )}
            </select>
          </label>
        </fieldset>
      )}
      {(value.intent === "SALE" ||
        (service && value.servicePricing === "FIXED")) && (
        <fieldset className="min-w-0 space-y-3 rounded-xl border border-gc-divider p-4">
          <legend className="px-1 font-semibold">
            {service ? "Service rate" : "Sale price"} (required to publish)
          </legend>
          {service && (
            <label className="block space-y-2" htmlFor={`${id}-serviceUnit`}>
              <span id={`${id}-serviceUnit-label`}>
                Price unit (required to publish)
              </span>
              <select
                id={`${id}-serviceUnit`}
                aria-labelledby={`${id}-serviceUnit-label`}
                className={portalInputClass}
                value={value.serviceUnit}
                onChange={(e) =>
                  change("serviceUnit", e.target.value as Fields["serviceUnit"])
                }
              >
                <option value="">Choose what this rate covers</option>
                {Object.entries(exchangeServiceUnitLabels).map(
                  ([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  )
                )}
              </select>
            </label>
          )}
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
          Coarse area (required to publish)
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
