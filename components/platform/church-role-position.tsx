"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { StructureSnapshot } from "@/lib/platform/church-structure-types";
import {
  PortalActionForm,
  portalInputClass,
  portalButtonClass
} from "./portal-action-form";
import { portalLinkClass } from "./portal-ui";

export function ChurchRolePosition({
  snapshot,
  requestKey
}: {
  snapshot: Pick<StructureSnapshot, "version" | "roleTemplates"> & {
    church: { id: string };
    positions: { id: string; name: string }[];
  };
  requestKey: string;
}) {
  const [selected, setSelected] = useState("");
  const [choice, setChoice] = useState("");
  const [parentId, setParentId] = useState("");
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);
  const applied = useRef(false);
  useEffect(() => {
    if (applied.current)
      formRef.current
        ?.querySelector<HTMLInputElement>('input[name="name"]')
        ?.focus();
  }, [selected]);
  const role = snapshot.roleTemplates?.find((item) => item.id === selected);
  return (
    <div
      ref={formRef}
      className="space-y-4"
      onChange={(event) => {
        const input = event.target;
        if (input instanceof HTMLSelectElement && input.name === "parentId")
          setParentId(input.value);
      }}
    >
      <label htmlFor="position-title-library" className="block font-semibold">
        Start from a church title
        <select
          ref={selectRef}
          disabled={busy}
          id="position-title-library"
          className={portalInputClass}
          value={choice}
          onChange={(event) => setChoice(event.target.value)}
        >
          <option value="">Write this position’s own details</option>
          {snapshot.roleTemplates?.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} · version {item.version}
            </option>
          ))}
        </select>
      </label>
      {choice !== selected && (
        <div className="space-y-2 rounded-xl border border-gc-divider p-3">
          <p>
            The selected title replaces the unsaved position name and
            responsibilities when you apply it. Your reporting choice is kept;
            this does not select an existing position or guess a supervisor.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={busy}
              className={portalButtonClass}
              onClick={() => {
                applied.current = true;
                setSelected(choice);
              }}
            >
              Use selected title
            </button>
            <button
              type="button"
              className={portalLinkClass}
              disabled={busy}
              onClick={() => {
                setChoice(selected);
                selectRef.current?.focus();
              }}
            >
              Keep position draft
            </button>
          </div>
        </div>
      )}
      <Link
        href={`/platform/churches/${encodeURIComponent(snapshot.church.id)}/structure/roles`}
        className={portalLinkClass}
      >
        Manage role titles and recommendations
      </Link>
      {role && (
        <p className="text-sm text-gc-muted">
          {role.description} This creates a separate position using title
          version {role.version}. Existing positions with the same title are
          unchanged.
        </p>
      )}
      <PortalActionForm
        key={selected}
        structureAction="create"
        onBusyChange={setBusy}
        payload={{
          churchId: snapshot.church.id,
          expectedVersion: snapshot.version,
          requestKey,
          ...(role
            ? { roleTemplateId: role.id, roleTemplateVersion: role.version }
            : {})
        }}
        fields={[
          {
            name: "name",
            label: "Position name",
            value: role?.name ?? "",
            maxLength: 100,
            required: true
          },
          {
            name: "description",
            label: "Responsibilities",
            value: role?.responsibilities ?? "",
            maxLength: 3000,
            type: "textarea",
            hint: "Visible to eligible approved members of this church. Edit for this particular position."
          },
          {
            name: "parentId",
            label: "Reports to",
            type: "select",
            value: parentId,
            options: [
              { value: "", label: "No parent position" },
              ...snapshot.positions.map((p) => ({
                value: p.id,
                label: p.name + " · " + p.id.slice(-6)
              }))
            ]
          }
        ]}
        label="Create position"
        description="The title and responsibilities are copied into this position. No assignment or software permission is granted."
      />
    </div>
  );
}
