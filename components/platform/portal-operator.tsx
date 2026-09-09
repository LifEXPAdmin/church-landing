"use client";

import { useId, useState } from "react";

import type {
  ChurchSummary,
  PortalSnapshot
} from "@/lib/platform/portal-types";
import {
  PortalActionForm,
  portalInputClass
} from "@/components/platform/portal-action-form";
import {
  PortalCard,
  PortalEmpty,
  PortalHeading
} from "@/components/platform/portal-ui";

type OperatorData = NonNullable<PortalSnapshot["operator"]>;
type OperatorUser = OperatorData["users"][number];
const capabilityLabels: Record<string, string> = {
  REVIEW_CONNECTIONS: "Review connections",
  APPOINT_COORDINATORS: "Appoint coordinators"
};
const slotLabels: Record<string, string> = {
  PRIMARY: "Primary coordinator",
  BACKUP: "Backup coordinator",
  RELATIONSHIP_OWNER: "Relationship owner"
};

function Choose({
  label,
  value,
  onChange,
  options
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="text-sm font-semibold text-gc-text">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={portalInputClass}
      >
        <option value="">Choose an option</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

const userOptions = (users: OperatorUser[]) =>
  users.map((user) => ({
    value: user.id,
    label: `${user.name} (@${user.username})`
  }));
const churchOptions = (churches: ChurchSummary[]) =>
  churches.map((church) => ({ value: church.id, label: church.name }));

function CapabilityAssignments({
  data,
  churchId
}: {
  data: OperatorData;
  churchId: string;
}) {
  const [userId, setUserId] = useState("");
  const [capability, setCapability] = useState("");
  const target = data.users.find((user) => user.id === userId && user.eligible);
  const existing = data.grants.find(
    (grant) =>
      grant.churchId === churchId &&
      grant.userId === userId &&
      grant.capability === capability
  );
  const active = data.grants.filter(
    (grant) => grant.churchId === churchId && !grant.revoked
  );
  return (
    <PortalCard title="Church permissions">
      <p className="text-sm text-gc-muted">
        Assign permissions explicitly. A profile category or contact title never
        grants review or appointment access.
      </p>
      <Choose
        label="Account to receive permission"
        value={userId}
        onChange={setUserId}
        options={userOptions(data.users.filter((user) => user.eligible))}
      />
      <Choose
        label="Church permission"
        value={capability}
        onChange={setCapability}
        options={Object.entries(capabilityLabels).map(([value, label]) => ({
          value,
          label
        }))}
      />
      {target && capability && (
        <PortalActionForm
          key={`${userId}:${capability}`}
          operation="grant"
          payload={{
            churchId,
            userId,
            capability,
            expectedVersion: existing?.version ?? 0
          }}
          label={
            existing && !existing.revoked
              ? "Permission already assigned"
              : "Assign church permission"
          }
          disabled={!!existing && !existing.revoked}
          confirmation={`Assign ${capabilityLabels[capability].toLowerCase()} permission to ${target.name} for this church.`}
        />
      )}
      <h3 className="pt-2 text-2xl text-gc-text">Current permissions</h3>
      {active.length === 0 ? (
        <PortalEmpty>No permissions are assigned for this church.</PortalEmpty>
      ) : (
        active.map((grant) => (
          <div
            key={grant.id}
            className="space-y-3 rounded-xl border border-gc-divider p-4"
          >
            <p className="font-semibold text-gc-text">
              {data.users.find((user) => user.id === grant.userId)?.name ??
                "Assigned account"}
            </p>
            <p className="text-sm text-gc-muted">
              {capabilityLabels[grant.capability] ?? "Church permission"}
            </p>
            <PortalActionForm
              operation="revoke-grant"
              payload={{
                churchId,
                id: grant.id,
                expectedVersion: grant.version
              }}
              label="Revoke permission"
              confirmation="I want to end this church permission, including for existing sessions."
            />
          </div>
        ))
      )}
    </PortalCard>
  );
}

function ContactAppointments({
  data,
  churchId,
  slots
}: {
  data: OperatorData;
  churchId: string;
  slots: string[];
}) {
  const [slot, setSlot] = useState("");
  const [userId, setUserId] = useState("");
  const target = data.users.find((user) => user.id === userId && user.eligible);
  const existing = data.assignments.find(
    (assignment) => assignment.churchId === churchId && assignment.slot === slot
  );
  const visible = data.assignments.filter(
    (assignment) =>
      assignment.churchId === churchId &&
      slots.includes(assignment.slot) &&
      !assignment.revoked
  );
  return (
    <PortalCard title="Appointed contacts">
      <p className="text-sm leading-relaxed text-gc-muted">
        Primary and backup coordinators must have approved connections to this
        church. A relationship owner requires a separate operator assignment.
        Contact titles do not add software permissions.
      </p>
      <Choose
        label="Contact role"
        value={slot}
        onChange={setSlot}
        options={slots.map((value) => ({ value, label: slotLabels[value] }))}
      />
      <Choose
        label="Account to appoint"
        value={userId}
        onChange={setUserId}
        options={userOptions(data.users.filter((user) => user.eligible))}
      />
      {target && slots.includes(slot) && (
        <PortalActionForm
          key={`${slot}:${userId}`}
          operation="assign-contact"
          payload={{
            churchId,
            userId,
            slot,
            audience: "SAME_CHURCH",
            expectedVersion: existing?.version ?? 0
          }}
          label={
            existing && !existing.revoked
              ? "Replace contact appointment"
              : "Appoint contact"
          }
          description="Enter only contact details approved for sharing with this church's eligible, approved members. Blank fields publish no contact method; replacing an appointment replaces its previous contact details."
          fields={[
            {
              name: "contactEmail",
              label: "Approved contact email",
              type: "email",
              maxLength: 254
            },
            {
              name: "phone",
              label: "Approved contact phone",
              type: "tel",
              maxLength: 32
            }
          ]}
          confirmation={`I confirm ${target.name}'s appointment and that these contact details may be shown to approved members of this church.`}
        />
      )}
      <h3 className="pt-2 text-2xl text-gc-text">Current appointments</h3>
      {visible.length === 0 ? (
        <PortalEmpty>
          No contacts have been appointed for the roles you manage here.
        </PortalEmpty>
      ) : (
        visible.map((assignment) => (
          <div
            key={assignment.id}
            className="space-y-3 rounded-xl border border-gc-divider p-4"
          >
            <p className="font-semibold text-gc-text">
              {slotLabels[assignment.slot]}
            </p>
            <p className="text-sm text-gc-muted">
              {data.users.find((user) => user.id === assignment.userId)?.name ??
                "Assigned account"}
            </p>
            <PortalActionForm
              operation="revoke-contact"
              payload={{
                churchId,
                id: assignment.id,
                expectedVersion: assignment.version
              }}
              label="End contact appointment"
              confirmation="I want to remove this contact appointment from future church contact views."
            />
          </div>
        ))
      )}
    </PortalCard>
  );
}

function AccountStatus({
  data,
  viewerId
}: {
  data: OperatorData;
  viewerId: string;
}) {
  const [userId, setUserId] = useState("");
  const target = data.users.find(
    (user) => user.id === userId && user.id !== viewerId
  );
  return (
    <PortalCard title="Account access">
      <p className="text-sm text-gc-muted">
        Suspension ends sessions and removes private sharing, permissions, and
        appointments. Restoring access does not reactivate those assignments.
      </p>
      <Choose
        label="Account to manage"
        value={userId}
        onChange={setUserId}
        options={userOptions(data.users.filter((user) => user.id !== viewerId))}
      />
      {target && typeof target.version === "number" && (
        <>
          <p className="text-sm font-semibold text-gc-accent">
            Current status: {target.suspended ? "Suspended" : "Not suspended"}
          </p>
          <PortalActionForm
            key={target.id}
            operation="suspend"
            payload={{
              userId: target.id,
              expectedVersion: target.version,
              suspended: !target.suspended
            }}
            label={
              target.suspended ? "Restore account access" : "Suspend account"
            }
            confirmation={
              target.suspended
                ? `Restore account access for ${target.name} without restoring old assignments.`
                : `Suspend ${target.name}'s account and end their sessions and private assignments.`
            }
          />
        </>
      )}
    </PortalCard>
  );
}

export function PortalOperator({
  churches,
  coordinatorChurches,
  capabilities,
  data,
  viewerId
}: {
  churches: ChurchSummary[];
  coordinatorChurches: ChurchSummary[];
  capabilities: string[];
  data: OperatorData;
  viewerId: string;
}) {
  const [churchId, setChurchId] = useState("");
  const manageAccess = capabilities.includes("MANAGE_CHURCH_ACCESS");
  const relationshipOwner = capabilities.includes("ASSIGN_RELATIONSHIP_OWNER");
  const scopedChurches =
    manageAccess || relationshipOwner ? churches : coordinatorChurches;
  const church = scopedChurches.find((item) => item.id === churchId);
  const canAppoint = coordinatorChurches.some((item) => item.id === churchId);
  const slots = [
    ...(canAppoint ? ["PRIMARY", "BACKUP"] : []),
    ...(relationshipOwner ? ["RELATIONSHIP_OWNER"] : [])
  ];
  return (
    <>
      <PortalHeading
        title={
          capabilities.length ? "Church administration" : "Contact appointments"
        }
        description="Only the controls covered by your current, explicitly assigned permissions are available here."
      />
      <div className="space-y-6">
        {capabilities.includes("ESTABLISH_CHURCH") && (
          <PortalCard title="Establish a church">
            <PortalActionForm
              operation="establish"
              payload={{ expectedVersion: 0 }}
              label="Establish church"
              fields={[
                {
                  name: "name",
                  label: "Church name",
                  required: true,
                  maxLength: 100
                },
                {
                  name: "slug",
                  label: "Church link name",
                  required: true,
                  maxLength: 60,
                  pattern: "[a-z0-9]+(?:-[a-z0-9]+)*",
                  hint: "Use lowercase words separated by hyphens. This identifier is public."
                },
                {
                  name: "summary",
                  label: "Public church summary",
                  type: "textarea",
                  required: true,
                  maxLength: 500
                }
              ]}
              description="The name, link name, and summary are public. Do not include private member or staff details."
              confirmation="I confirm that this church listing is ready to publish."
            />
          </PortalCard>
        )}
        {(manageAccess ||
          relationshipOwner ||
          coordinatorChurches.length > 0) && (
          <>
            <PortalCard title="Choose a church to manage">
              {scopedChurches.length ? (
                <Choose
                  label="Church"
                  value={churchId}
                  onChange={setChurchId}
                  options={churchOptions(scopedChurches)}
                />
              ) : (
                <PortalEmpty>
                  No churches are available within your current permissions.
                </PortalEmpty>
              )}
            </PortalCard>
            {church && (
              <div key={church.id} className="space-y-5">
                <h2 className="text-3xl text-gc-text">{church.name}</h2>
                <div className="grid items-start gap-6 lg:grid-cols-2">
                  {manageAccess && (
                    <CapabilityAssignments data={data} churchId={church.id} />
                  )}
                  {slots.length > 0 && (
                    <ContactAppointments
                      data={data}
                      churchId={church.id}
                      slots={slots}
                    />
                  )}
                </div>
              </div>
            )}
          </>
        )}
        {capabilities.includes("MANAGE_ACCOUNTS") && (
          <AccountStatus data={data} viewerId={viewerId} />
        )}
      </div>
    </>
  );
}
