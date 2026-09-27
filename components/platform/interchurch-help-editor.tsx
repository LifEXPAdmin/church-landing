"use client";
import { useId, useState, type ReactNode } from "react";
import {
  helpCategories,
  helpDutyClasses,
  helpEquipmentModes,
  emptyHelpTerms,
  type HelpTermsFields
} from "@/lib/platform/interchurch-help-options";
import {
  exchangeCurrencies,
  EXCHANGE_ITEM_POLICY
} from "@/lib/platform/exchange-options";
import type { readInterchurchHelp } from "@/lib/platform/interchurch-help-reads";
import { DiscoveryPlacePicker } from "./discovery-place-picker";
import { portalInputClass } from "./portal-control-styles";
export type HelpPageData = Awaited<ReturnType<typeof readInterchurchHelp>>;
export type HelpCommand = (v: Record<string, unknown>) => Promise<boolean>;
export const helpButton = "gc-button";
export function HelpField({
  label,
  value,
  onChange,
  type = "text",
  maxLength = 2000
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  maxLength?: number;
}) {
  const id = useId();
  return (
    <div className="block space-y-1">
      <label htmlFor={id}>{label}</label>
      {type === "textarea" ? (
        <textarea
          id={id}
          className={portalInputClass}
          value={value}
          maxLength={maxLength}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          id={id}
          className={portalInputClass}
          type={type}
          value={value}
          maxLength={maxLength}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}
export function HelpSelect({
  label,
  value,
  onChange,
  choices
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  choices: Record<string, string>;
}) {
  const id = useId();
  return (
    <div className="block space-y-1">
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        className={portalInputClass}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Choose deliberately</option>
        {Object.entries(choices).map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </div>
  );
}
export function HelpCheck({
  children,
  checked,
  onChange
}: {
  children: ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex min-h-11 items-start gap-3">
      <input
        className="mt-1"
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{children}</span>
    </label>
  );
}
export function HelpTermsEditor({
  value,
  onChange
}: {
  value: HelpTermsFields;
  onChange: (v: HelpTermsFields) => void;
}) {
  const set = (k: keyof HelpTermsFields) => (v: string) =>
    onChange({ ...value, [k]: v });
  return (
    <div className="space-y-3">
      <HelpField
        label="Expected duties and resources"
        type="textarea"
        value={value.duties}
        onChange={set("duties")}
      />
      <HelpSelect
        label="Duty classification"
        value={value.dutyClass}
        onChange={set("dutyClass")}
        choices={helpDutyClasses}
      />
      <HelpSelect
        label="Equipment arrangement"
        value={value.equipmentMode}
        onChange={set("equipmentMode")}
        choices={helpEquipmentModes}
      />
      <p className="text-sm">
        Physical loans, child-facing fulfillment and signing up other adults are
        unavailable. Do not enter child records, medical details or screening
        files. Equipment availability and qualifications are not guaranteed.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <HelpField
          label="Proposed start"
          type="datetime-local"
          value={value.startLocal}
          onChange={set("startLocal")}
        />
        <HelpField
          label="Proposed end"
          type="datetime-local"
          value={value.endLocal}
          onChange={set("endLocal")}
        />
      </div>
      <HelpField
        label="Time zone"
        value={value.timeZone}
        maxLength={100}
        onChange={set("timeZone")}
      />
      <HelpSelect
        label="Paid or voluntary"
        value={value.compensation}
        onChange={(v) =>
          onChange({
            ...value,
            compensation: v,
            ...(v === "VOLUNTARY"
              ? { price: "", currency: "", rateUnit: "" }
              : {})
          })
        }
        choices={{
          VOLUNTARY: "Voluntary, no service fee",
          PAID: "Paid, exact amount"
        }}
      />
      {value.compensation === "PAID" && (
        <>
          <HelpField
            label="Payment amount (leave empty for voluntary)"
            value={value.price}
            maxLength={16}
            onChange={set("price")}
          />
          <HelpSelect
            label="Currency (leave empty for voluntary)"
            value={value.currency}
            onChange={set("currency")}
            choices={Object.fromEntries(
              Object.keys(exchangeCurrencies).map((k) => [k, k])
            )}
          />
          <HelpSelect
            label="Rate unit (leave empty for voluntary)"
            value={value.rateUnit}
            onChange={set("rateUnit")}
            choices={{ TASK: "Per described task", HOUR: "Per hour" }}
          />
        </>
      )}
      <HelpField
        label="Expense reimbursement, including none"
        type="textarea"
        value={value.reimbursement}
        maxLength={500}
        onChange={set("reimbursement")}
      />
    </div>
  );
}
export function HelpTermsSummary({ terms: t }: { terms: HelpTermsFields }) {
  return (
    <dl className="space-y-2 break-words">
      <div>
        <dt className="font-semibold">Expected duties</dt>
        <dd className="whitespace-pre-wrap">{t.duties}</dd>
      </div>
      <div>
        <dt className="font-semibold">Proposed window</dt>
        <dd>
          {t.startLocal.replace("T", " ")} to {t.endLocal.replace("T", " ")} (
          {t.timeZone})
        </dd>
      </div>
      <div>
        <dt className="font-semibold">Compensation</dt>
        <dd>
          {t.compensation === "PAID"
            ? `${t.price} ${t.currency} per ${t.rateUnit === "HOUR" ? "hour" : "described task"}`
            : "Voluntary, no service fee"}
        </dd>
      </div>
      <div>
        <dt className="font-semibold">Expenses</dt>
        <dd>{t.reimbursement}</dd>
      </div>
      <div>
        <dt className="font-semibold">Duty boundary</dt>
        <dd>{helpDutyClasses[t.dutyClass as keyof typeof helpDutyClasses]}</dd>
      </div>
      <div>
        <dt className="font-semibold">Equipment</dt>
        <dd>
          {
            helpEquipmentModes[
              t.equipmentMode as keyof typeof helpEquipmentModes
            ]
          }
        </dd>
      </div>
    </dl>
  );
}
export function HelpRequestEditor({
  initial,
  churches,
  visible,
  blocked,
  command,
  onDirty
}: {
  initial?: Extract<HelpPageData, { view: "request" }>;
  churches: Extract<HelpPageData, { view: "context" }>["churches"];
  visible: boolean;
  blocked: boolean;
  command: HelpCommand;
  onDirty: (v: boolean) => void;
}) {
  const [church, setChurch] = useState(initial?.listing.church.id ?? "");
  const [f, set] = useState({
    title: initial?.listing.title ?? "",
    category: initial?.request.category ?? "",
    terms: initial?.request.terms ?? emptyHelpTerms,
    country: initial?.listing.country ?? "US",
    placeId: String(initial?.listing.placeId ?? ""),
    audience: initial?.listing.audience ?? "PUBLIC",
    acceptCoordinator: false,
    coordinatorDisplay: initial?.request.coordinatorDisplay ?? ""
  });
  const [confirmed, confirm] = useState(false);
  const change = (v: Partial<typeof f>) => {
    set({ ...f, ...v });
    onDirty(true);
  };
  if (!visible) return null;
  return (
    <form
      aria-label="Ministry request editor"
      className="space-y-4 rounded-xl border p-4"
      onSubmit={(e) => {
        e.preventDefault();
        void command({
          operation: initial ? "help-save" : "help-create",
          ...(initial
            ? {
                requestId: initial.request.id,
                itemPolicy: EXCHANGE_ITEM_POLICY,
                itemConfirmed: confirmed
              }
            : { ownerChurchId: church }),
          expectedVersion: initial?.request.version ?? 0,
          schema: 1,
          fields: { ...f, placeId: Number(f.placeId) }
        });
      }}
    >
      <h2 className="text-2xl">
        {initial ? "Edit ministry request" : "Create a ministry request"}
      </h2>
      <fieldset disabled={blocked} className="min-w-0 space-y-3">
        {!initial && (
          <HelpSelect
            label="Requesting church"
            value={church}
            onChange={(v) => {
              setChurch(v);
              onDirty(true);
            }}
            choices={Object.fromEntries(
              churches.filter((c) => c.canDraft).map((c) => [c.id, c.name])
            )}
          />
        )}
        <HelpField
          label="Request title"
          value={f.title}
          maxLength={120}
          onChange={(v) => change({ title: v })}
        />
        <HelpSelect
          label="Help category"
          value={f.category}
          choices={helpCategories}
          onChange={(v) => change({ category: v })}
        />
        <HelpTermsEditor
          value={f.terms}
          onChange={(v) => change({ terms: v })}
        />
        <DiscoveryPlacePicker
          country={f.country || null}
          placeId={f.placeId ? Number(f.placeId) : null}
          disabled={blocked}
          onCountry={(country) =>
            change({ country: country ?? "", placeId: "" })
          }
          onPlace={(place) =>
            change({ placeId: place === null ? "" : String(place) })
          }
        />

        <HelpSelect
          label="Request audience"
          value={f.audience}
          onChange={(v) => change({ audience: v as "PUBLIC" | "CHURCH" })}
          choices={{
            PUBLIC: "Public, including other churches",
            CHURCH: "Only the requesting church"
          }}
        />
        <HelpField
          label="Public coordinator name or role"
          value={f.coordinatorDisplay}
          maxLength={120}
          onChange={(v) => change({ coordinatorDisplay: v })}
        />
        <HelpCheck
          checked={f.acceptCoordinator}
          onChange={(v) => change({ acceptCoordinator: v })}
        >
          I am the current church Exchange manager and explicitly accept
          responsibility for receiving private offers. Replacing a coordinator
          never transfers old private offers.
        </HelpCheck>
        {initial?.listing.state !== "DRAFT" && initial && (
          <HelpCheck checked={confirmed} onChange={confirm}>
            I may publish this request and have described it honestly. Material
            changes require fresh agreement acknowledgment.
          </HelpCheck>
        )}
        <button className={helpButton}>Save request</button>
      </fieldset>
    </form>
  );
}
