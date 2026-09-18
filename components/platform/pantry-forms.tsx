"use client";
import { useId, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type {
  PantryCategoryView,
  PantryHubView,
  PantrySessionView
} from "@/lib/platform/pantry-reads";
import {
  PANTRY_SCHEMA,
  pantryAvailability
} from "@/lib/platform/pantry-options";
import { usePrivateChoiceAction } from "./use-private-choice-action";
import { portalInputClass } from "./portal-action-form";
import { usePantryEdit } from "./pantry-edit-scope";

const endpoint = "/api/platform/pantry";
type Values = Record<string, string | boolean>;
type Field = {
  key: string;
  label: string;
  type?: "text" | "textarea" | "number" | "datetime-local" | "checkbox";
  required?: boolean;
  max?: number;
  choices?: Record<string, string>;
  help?: string;
};
function Fields({
  fields,
  values,
  setValues
}: {
  fields: Field[];
  values: Values;
  setValues: (v: Values) => void;
}) {
  const id = useId();
  return (
    <>
      {fields.map((f) => (
        <label
          key={f.key}
          htmlFor={`${id}-${f.key}`}
          className="block space-y-2"
        >
          <span>{f.label}</span>
          {f.type === "checkbox" ? (
            <input
              id={`${id}-${f.key}`}
              type="checkbox"
              className="ml-3 h-5 w-5"
              checked={!!values[f.key]}
              onChange={(e) =>
                setValues({ ...values, [f.key]: e.target.checked })
              }
            />
          ) : f.choices ? (
            <select
              id={`${id}-${f.key}`}
              className={portalInputClass}
              value={String(values[f.key] ?? "")}
              onChange={(e) =>
                setValues({ ...values, [f.key]: e.target.value })
              }
            >
              {Object.entries(f.choices).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          ) : f.type === "textarea" ? (
            <textarea
              id={`${id}-${f.key}`}
              className={portalInputClass}
              rows={3}
              maxLength={f.max}
              required={f.required}
              value={String(values[f.key] ?? "")}
              onChange={(e) =>
                setValues({ ...values, [f.key]: e.target.value })
              }
            />
          ) : (
            <input
              id={`${id}-${f.key}`}
              className={portalInputClass}
              type={f.type ?? "text"}
              required={f.required}
              maxLength={f.max}
              min={f.type === "number" ? 0 : undefined}
              max={f.type === "number" ? f.max : undefined}
              step={f.type === "number" ? 1 : undefined}
              value={String(values[f.key] ?? "")}
              onChange={(e) =>
                setValues({ ...values, [f.key]: e.target.value })
              }
            />
          )}
          {f.help && (
            <span className="block text-sm text-gc-muted">{f.help}</span>
          )}
        </label>
      ))}
    </>
  );
}
function PantryForm({
  owner,
  title,
  initial,
  fields,
  body,
  children,
  create = false,
  newRequest = false
}: {
  owner: string;
  title: string;
  initial: Values;
  fields: Field[];
  body: (values: Values, id: string) => Record<string, unknown>;
  children?: ReactNode;
  create?: boolean;
  newRequest?: boolean;
}) {
  const [values, setValues] = useState(initial),
    id = useRef<string | null>(null),
    router = useRouter();
  const edit = usePantryEdit(title);
  const action = usePrivateChoiceAction(
    endpoint,
    owner,
    JSON.stringify(values) !== JSON.stringify(initial),
    (receipt) => {
      if (newRequest) router.push(`/platform/pantry/requests/${receipt.id}`);
      if (create) {
        setValues(initial);
        id.current = null;
      }
    },
    true
  );
  return (
    <form
      aria-label={title}
      className="space-y-4 rounded-xl border border-gc-divider p-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (action.blocked || !edit.claim()) return;
        id.current ??= crypto.randomUUID();
        void action.command(body(values, id.current));
      }}
    >
      <h3 className="text-xl">{title}</h3>
      {children}
      {edit.notice}
      <fieldset
        disabled={action.blocked || edit.blocked}
        className="min-w-0 space-y-4"
      >
        <Fields
          fields={fields}
          values={values}
          setValues={(next) => {
            if (!edit.claim()) return;
            setValues(next);
            if (JSON.stringify(next) === JSON.stringify(initial))
              edit.release();
          }}
        />
        <button type="submit" className="gc-button">
          {title}
        </button>
        {edit.editing && (
          <button
            type="button"
            className="gc-button gc-button-quiet"
            onClick={() => {
              setValues(initial);
              id.current = null;
              edit.release();
            }}
          >
            Discard local edits
          </button>
        )}
      </fieldset>
      {action.status}
    </form>
  );
}
export function PantryHubForm({
  owner,
  churchId,
  hub,
  coordinated
}: {
  owner: string;
  churchId: string;
  hub: PantryHubView | null;
  coordinated: boolean;
}) {
  return (
    <PantryForm
      owner={owner}
      title="Save hub and intake choices"
      initial={{
        title: hub?.title ?? "",
        description: hub?.description ?? "",
        hours: hub?.hours ?? "",
        accessInfo: hub?.accessInfo ?? "",
        eligibility: hub?.eligibility ?? "",
        audience: hub?.audience ?? "CHURCH",
        published: hub?.published ?? false,
        intakeEnabled: hub?.intakeEnabled ?? false,
        acceptCoordinator: coordinated
      }}
      fields={[
        { key: "title", label: "Hub title", required: true, max: 120 },
        {
          key: "description",
          label: "Public description",
          type: "textarea",
          required: true,
          max: 2000
        },
        {
          key: "hours",
          label: "Public hours",
          type: "textarea",
          required: true,
          max: 1000
        },
        {
          key: "accessInfo",
          label: "Public access guidance",
          type: "textarea",
          required: true,
          max: 1000,
          help: "Use church access information. Keep private pickup directions with the appointment."
        },
        {
          key: "eligibility",
          label: "Public eligibility and availability guidance",
          type: "textarea",
          required: true,
          max: 1000,
          help: "Explain the operator's actual terms. Do not request identity documents, income or health details here."
        },
        {
          key: "audience",
          label: "Who can find this hub",
          choices: {
            CHURCH: "Current approved church members",
            PUBLIC: "Public, when the church is listed"
          }
        },
        {
          key: "published",
          label: "Publish the hub information",
          type: "checkbox"
        },
        {
          key: "intakeEnabled",
          label: "Accept new private assistance requests",
          type: "checkbox"
        },
        {
          key: "acceptCoordinator",
          label:
            "I accept named coordinator responsibility for private requests",
          type: "checkbox",
          help: "Replacing a coordinator ends the previous private access and pickup offers. It does not transfer recipient histories. Unchecking your own responsibility closes intake."
        }
      ]}
      body={(v) => ({
        operation: "configure",
        churchId,
        expectedVersion: hub?.version ?? 0,
        schema: PANTRY_SCHEMA,
        fields: v
      })}
    >
      <p>
        Public information is separate from the private request queue. Your
        current assistance duty and explicit consent govern intake.
      </p>
    </PantryForm>
  );
}
export function PantryStockForm({
  owner,
  hubId,
  row
}: {
  owner: string;
  hubId: string;
  row?: PantryCategoryView;
}) {
  return (
    <PantryForm
      owner={owner}
      title={row ? `Save ${row.label} availability` : "Add supply category"}
      create={!row}
      initial={{
        label: row?.label ?? "",
        unit: row?.unit ?? "",
        availability: row?.availability ?? "APPROXIMATE",
        quantity: row?.quantity?.toString() ?? "",
        description: row?.description ?? "",
        active: row?.active ?? true,
        reason: ""
      }}
      fields={[
        { key: "label", label: "Category name", max: 80, required: true },
        { key: "unit", label: "Unit name", max: 40, required: true },
        {
          key: "availability",
          label: "Availability type",
          choices: pantryAvailability
        },
        {
          key: "quantity",
          label: "Count, only for counted stock",
          type: "number",
          max: 10000,
          help: "Clear this field for approximate or unavailable stock. Availability never guarantees a reservation."
        },
        {
          key: "description",
          label: "Public contents or substitution guidance",
          type: "textarea",
          max: 500
        },
        { key: "active", label: "Show this category", type: "checkbox" },
        {
          key: "reason",
          label: "Private adjustment reason",
          type: "textarea",
          max: 300,
          required: true,
          help: "Record a stock fact, without recipient names or assistance histories."
        }
      ]}
      body={(v, id) => ({
        operation: "category",
        hubId,
        id: row?.id ?? id,
        expectedVersion: row?.version ?? 0,
        schema: PANTRY_SCHEMA,
        fields: {
          ...v,
          quantity: v.quantity === "" ? null : Number(v.quantity)
        }
      })}
    />
  );
}
export function PantrySessionForm({
  owner,
  hubId,
  row
}: {
  owner: string;
  hubId: string;
  row?: PantrySessionView;
}) {
  return (
    <PantryForm
      owner={owner}
      title={row ? "Save pickup session" : "Add pickup session"}
      create={!row}
      initial={{
        startLocal: row?.startLocal ?? "",
        endLocal: row?.endLocal ?? "",
        timeZone: row?.timeZone ?? "",
        capacity: String(row?.capacity ?? 1),
        pickupDetails: row?.pickupDetails ?? "",
        active: row?.active ?? true
      }}
      fields={[
        {
          key: "startLocal",
          label: "Pickup starts",
          type: "datetime-local",
          required: true
        },
        {
          key: "endLocal",
          label: "Pickup ends",
          type: "datetime-local",
          required: true
        },
        {
          key: "timeZone",
          label: "Time zone",
          required: true,
          max: 100,
          help: "Use an exact zone such as America/Chicago. Review daylight-saving changes."
        },
        {
          key: "capacity",
          label: "Number of pickup places",
          type: "number",
          required: true,
          max: 100
        },
        {
          key: "pickupDetails",
          label: "Private pickup directions",
          type: "textarea",
          required: true,
          max: 1000
        },
        { key: "active", label: "Offer this session", type: "checkbox" }
      ]}
      body={(v, id) => ({
        operation: "session",
        hubId,
        id: row?.id ?? id,
        expectedVersion: row?.version ?? 0,
        schema: PANTRY_SCHEMA,
        fields: { ...v, capacity: Number(v.capacity) }
      })}
    >
      <p>
        Directions go only to the coordinator and people offered this session.
        Existing appointments prevent silent time or direction changes.
      </p>
      {row && (
        <p>
          {row.occupied} of {row.capacity} places used, including collected or
          missed pickups.
        </p>
      )}
    </PantryForm>
  );
}
export function PantryRequestForm({
  owner,
  hub,
  categories,
  coordinator
}: {
  owner: string;
  hub: PantryHubView;
  categories: PantryCategoryView[];
  coordinator: { id: string; name: string };
}) {
  const available = categories.filter(
    (c) => c.active && c.availability !== "UNAVAILABLE"
  );
  return (
    <PantryForm
      owner={owner}
      title="Send private assistance request"
      create
      newRequest
      initial={{
        ...Object.fromEntries(available.map((c) => [c.id, "0"])),
        note: "",
        pickupContact: "",
        accepted: false
      }}
      fields={[
        ...available.map((c) => ({
          key: c.id,
          label: `${c.label} (${c.unit})`,
          type: "number" as const,
          max: 10000,
          help: "Leave zero for categories you are not requesting."
        })),
        {
          key: "note",
          label: "Optional practical note",
          type: "textarea",
          max: 500,
          help: "Share only what helps coordinate pickup. Do not include income, identity documents, health details or other people's information."
        },
        {
          key: "pickupContact",
          label: "Optional pickup contact you choose to share",
          max: 200,
          help: "Your sign-in email is not automatically shared. You can follow this request in your private history."
        },
        {
          key: "accepted",
          label: `Share these selected items and entries with ${coordinator.name}, the current coordinator`,
          type: "checkbox"
        }
      ]}
      body={(v, id) => ({
        operation: "request",
        id,
        hubId: hub.id,
        expectedVersion: 0,
        consentVersion: hub.consentVersion,
        coordinatorId: coordinator.id,
        accepted: v.accepted,
        items: available
          .filter((c) => Number(v[c.id]) > 0)
          .map((c) => ({
            categoryId: c.id,
            version: c.version,
            quantity: Number(v[c.id])
          })),
        note: v.note,
        pickupContact: v.pickupContact
      })}
    >
      <p>
        Request assistance for yourself. Only the named current coordinator
        receives these entries. A request does not guarantee supplies or a
        pickup. You will review and confirm any offered appointment separately.
      </p>
    </PantryForm>
  );
}
export function PantryReplenishmentForm({
  owner,
  hubId,
  row
}: {
  owner: string;
  hubId: string;
  row: PantryCategoryView;
}) {
  return (
    <PantryForm
      owner={owner}
      title="Save replenishment link"
      initial={{ needId: row.replenishment?.id ?? "" }}
      fields={[
        {
          key: "needId",
          label: "Published Church Need reference",
          max: 100,
          help: "Copy the reference from your reviewed Need address. It must be active and owned by this church. Leave empty to remove the link."
        }
      ]}
      body={(v) => ({
        operation: "replenish",
        hubId,
        id: row.id,
        expectedVersion: row.version,
        needId: v.needId || null
      })}
    />
  );
}
