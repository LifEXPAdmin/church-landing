"use client";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  GROUP_SCHEMA,
  groupFormats,
  groupJoinPolicies,
  groupKinds
} from "@/lib/platform/group-options";
import {
  groupAcceptFields,
  groupLeaderField,
  groupConfirmField
} from "@/lib/platform/group-form-fields";
import type { readGroup, groupEligibility } from "@/lib/platform/group-reads";
import { socialRequest } from "@/lib/platform/social-client";
import { usePrivateChoiceAction } from "./use-private-choice-action";
import { usePrivateEdit } from "./private-edit-scope";
import { portalInputClass } from "./portal-action-form";
import type { readGroupEventChoice } from "@/lib/platform/group-events";
import { useReadVisibility } from "./read-visibility";

export type GroupField = {
  key: string;
  label: string;
  type?: "checkbox" | "textarea";
  choices?: Record<string, string>;
  required?: boolean;
  max?: number;
  initial?: string | boolean;
  help?: string;
};
type Values = Record<string, string | boolean>;
const endpoint = "/api/platform/groups";
function Fields({
  fields,
  values,
  change
}: {
  fields: GroupField[];
  values: Values;
  change: (key: string, value: string | boolean) => void;
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
              required={f.required}
              checked={!!values[f.key]}
              className="ml-3 h-5 w-5"
              onChange={(e) => change(f.key, e.target.checked)}
            />
          ) : f.choices ? (
            <select
              id={`${id}-${f.key}`}
              className={portalInputClass}
              required={f.required}
              value={String(values[f.key] ?? "")}
              onChange={(e) => change(f.key, e.target.value)}
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
              required={f.required}
              maxLength={f.max}
              value={String(values[f.key] ?? "")}
              onChange={(e) => change(f.key, e.target.value)}
            />
          ) : (
            <input
              id={`${id}-${f.key}`}
              className={portalInputClass}
              required={f.required}
              maxLength={f.max}
              value={String(values[f.key] ?? "")}
              onChange={(e) => change(f.key, e.target.value)}
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
function GroupForm({
  owner,
  title,
  fields = [],
  initial = {},
  build,
  children,
  onSaved
}: {
  owner: string;
  title: string;
  fields?: GroupField[];
  initial?: Values;
  build: (values: Values) => Record<string, unknown>;
  children?: ReactNode;
  onSaved?: () => void;
}) {
  const defaults = {
    ...Object.fromEntries(
      fields.map((f) => [
        f.key,
        f.initial ?? (f.type === "checkbox" ? false : "")
      ])
    ),
    ...initial
  };
  const [values, setValues] = useState<Values>(defaults);
  const [problem, setProblem] = useState("");
  const edit = usePrivateEdit(title);
  const dirty = JSON.stringify(values) !== JSON.stringify(defaults);
  const action = usePrivateChoiceAction(endpoint, owner, dirty, onSaved, true);
  return (
    <form
      aria-label={title}
      className="space-y-4 rounded-xl border border-gc-divider p-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (action.blocked || !edit.claim()) return;
        try {
          setProblem("");
          void action.command(build(values));
        } catch (error) {
          setProblem(
            error instanceof Error
              ? error.message
              : "Review the current entries."
          );
        }
      }}
    >
      <h3 className="text-xl">{title}</h3>
      {children}
      {edit.notice}
      <fieldset
        className="min-w-0 space-y-4"
        disabled={action.blocked || edit.blocked}
      >
        <Fields
          fields={fields}
          values={values}
          change={(key, value) => {
            if (edit.claim()) setValues({ ...values, [key]: value });
          }}
        />
        <div className="flex flex-wrap gap-3">
          <button type="submit" className="gc-button">
            {title}
          </button>
          {dirty && (
            <button
              type="button"
              className="gc-button gc-button-quiet"
              onClick={() => {
                if (confirm("Discard these unsaved group entries?")) {
                  setValues(defaults);
                  edit.release();
                }
              }}
            >
              Discard edits
            </button>
          )}
        </div>
      </fieldset>
      {action.status}
      {problem && <p role="status">{problem}</p>}
    </form>
  );
}
export function GroupAction({
  owner,
  title,
  body,
  fields,
  children
}: {
  owner: string;
  title: string;
  body: Record<string, unknown>;
  fields?: GroupField[];
  children?: ReactNode;
}) {
  return (
    <GroupForm
      owner={owner}
      title={title}
      fields={fields}
      build={(values) => ({ ...body, ...values })}
    >
      {children}
    </GroupForm>
  );
}
export function GroupIdentityForm({
  owner,
  current,
  churches = []
}: {
  owner: string;
  current?: Awaited<ReturnType<typeof readGroup>>;
  churches?: Awaited<ReturnType<typeof groupEligibility>>["churches"];
}) {
  const router = useRouter();
  const g = current?.group;
  const initial: Values = {
    name: g?.name ?? "",
    purpose: g?.purpose ?? "",
    rules: g?.rules ?? "",
    kind: g?.kind ?? "INTEREST",
    discovery: g?.discovery ?? "LISTED",
    joinPolicy: g?.joinPolicy ?? "APPROVAL",
    format: g?.format ?? "LOCAL",
    area: g?.area ?? "",
    topic: g?.topic ?? "",
    churchId: g?.church?.id ?? "",
    slug: g?.slug ?? "",
    acceptedRules: false,
    leaderDisclosure: false
  };
  const destination = useRef(g?.slug ?? "");
  const fields: GroupField[] = [
    { key: "name", label: "Group name", required: true, max: 80 },
    ...(!g
      ? [
          {
            key: "slug",
            label: "Group address",
            required: true,
            max: 60,
            help: "Choose 3 to 60 lowercase letters, numbers and single hyphens. This address stays reserved."
          },
          { key: "kind", label: "Group type", choices: groupKinds },
          {
            key: "churchId",
            label: "Church connection",
            choices: {
              "": "Independent group",
              ...Object.fromEntries(churches.map((c) => [c.id, c.name]))
            },
            help: "Church life groups and ministry teams require your current explicit group duty in the selected church."
          }
        ]
      : []),
    {
      key: "purpose",
      label: "Purpose",
      type: "textarea",
      required: true,
      max: 2000
    },
    {
      key: "rules",
      label: "Group rules",
      type: "textarea",
      required: true,
      max: 4000
    },
    {
      key: "discovery",
      label: "Discovery",
      choices: {
        LISTED: "Listed public About page",
        UNLISTED: "Unlisted, named invitations only"
      },
      help: "Discussions and the member roster are private in both choices. A private cohort must be unlisted."
    },
    {
      key: "joinPolicy",
      label: "Joining",
      choices: groupJoinPolicies,
      help: "Unlisted groups and private cohorts require named invitations."
    },
    { key: "format", label: "Meeting format", choices: groupFormats },
    {
      key: "area",
      label: "General area",
      max: 100,
      help: "Use a city or broad area, without a home address."
    },
    { key: "topic", label: "Topic", max: 80 },
    ...groupAcceptFields,
    groupLeaderField
  ];
  return (
    <GroupForm
      owner={owner}
      title={g ? "Save group details" : "Create group"}
      fields={fields}
      initial={initial}
      build={(v) => {
        destination.current = String(v.slug);
        const {
          name,
          purpose,
          rules,
          kind,
          discovery,
          joinPolicy,
          format,
          area,
          topic,
          churchId
        } = v;
        return {
          operation: g ? "edit" : "create",
          schema: GROUP_SCHEMA,
          ...(g
            ? { groupId: g.id, expectedVersion: g.version }
            : { slug: v.slug }),
          fields: {
            name,
            purpose,
            rules,
            kind,
            discovery,
            joinPolicy,
            format,
            area,
            topic,
            churchId: churchId || null
          },
          acceptedRules: v.acceptedRules,
          leaderDisclosure: v.leaderDisclosure
        };
      }}
      onSaved={() => router.push(`/platform/groups/${destination.current}`)}
    >
      <p>
        Adult groups use personal identities. A listed About page shows the
        purpose, rules, general area and consenting leaders. Changing rules
        requires members to accept them again before posting. Group type and
        church destination cannot change after creation.
      </p>
    </GroupForm>
  );
}
export function GroupInviteForm({
  owner,
  slug,
  groupId
}: {
  owner: string;
  slug: string;
  groupId: string;
}) {
  const [username, setUsername] = useState(""),
    [choice, setChoice] = useState<{
      person: { id: string; name: string; username: string };
      version: number;
      contactVersion: number;
    } | null>(null),
    [message, setMessage] = useState("");
  const edit = usePrivateEdit("named invitation lookup");
  const visible = useReadVisibility(),
    generation = useRef(0);
  useEffect(() => {
    const counter = generation;
    const clear = () => {
      counter.current++;
      setChoice(null);
    };
    if (!visible) clear();
    window.addEventListener("blur", clear);
    window.addEventListener("social-relationships-changed", clear);
    return () => {
      counter.current++;
      window.removeEventListener("blur", clear);
      window.removeEventListener("social-relationships-changed", clear);
    };
  }, [visible]);
  return (
    <section className="space-y-3">
      <form
        className="space-y-3"
        aria-label="Find named invitation recipient"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!edit.claim()) return;
          setChoice(null);
          setMessage("Checking current contact choices…");
          const seq = ++generation.current;
          try {
            const { data } = await socialRequest<NonNullable<typeof choice>>(
              `${endpoint}?${new URLSearchParams({ view: "invite-choice", slug, username })}`,
              undefined,
              owner
            );
            if (seq === generation.current) setChoice(data);
            setMessage("");
            edit.release();
          } catch (error) {
            setMessage(
              error instanceof Error
                ? error.message
                : "Current contact choice could not be checked."
            );
            edit.release();
          }
        }}
      >
        <label className="block space-y-2">
          <span>Exact username</span>
          <input
            className={portalInputClass}
            value={username}
            required
            maxLength={100}
            disabled={edit.blocked}
            onChange={(e) => {
              setUsername(e.target.value);
              setChoice(null);
            }}
          />
        </label>
        <button className="gc-button gc-button-quiet" disabled={edit.blocked}>
          Check named recipient
        </button>
        {edit.notice}
        {message && <p role="status">{message}</p>}
      </form>
      {choice && (
        <GroupAction
          owner={owner}
          title="Send named group invitation"
          body={{
            operation: "invite",
            groupId,
            targetId: choice.person.id,
            contactVersion: choice.contactVersion,
            expectedVersion: choice.version
          }}
        >
          <p>
            Invite {choice.person.name} (@{choice.person.username}). They must
            accept the current rules. This sends no direct message and does not
            add them to the group.
          </p>
        </GroupAction>
      )}
    </section>
  );
}

export function GroupEventForm({
  owner,
  slug,
  groupId
}: {
  owner: string;
  slug: string;
  groupId: string;
}) {
  const [link, setLink] = useState(""),
    [choice, setChoice] = useState<Awaited<
      ReturnType<typeof readGroupEventChoice>
    > | null>(null),
    [message, setMessage] = useState("");
  const edit = usePrivateEdit("event link lookup"),
    visible = useReadVisibility(),
    generation = useRef(0);
  useEffect(() => {
    const counter = generation;
    const clear = () => {
      counter.current++;
      setChoice(null);
    };
    if (!visible) clear();
    window.addEventListener("blur", clear);
    window.addEventListener("social-relationships-changed", clear);
    return () => {
      counter.current++;
      window.removeEventListener("blur", clear);
      window.removeEventListener("social-relationships-changed", clear);
    };
  }, [visible]);
  return (
    <section className="space-y-3">
      <form
        aria-label="Check existing event link"
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!visible || !edit.claim()) return;
          const seq = ++generation.current;
          setChoice(null);
          setMessage("Checking the original event's current audience…");
          try {
            const url = new URL(link, location.origin),
              match = url.pathname.match(
                /^\/platform\/events\/([A-Za-z0-9_-]{1,100})$/
              );
            if (
              url.origin !== location.origin ||
              !match ||
              [...url.searchParams.keys()].some((key) => key !== "timeZone") ||
              url.searchParams.getAll("timeZone").length > 1 ||
              url.hash ||
              url.username ||
              url.password
            )
              throw new Error(
                "Paste the event page link from this website, without extra options or fragment values."
              );
            const { data } = await socialRequest<NonNullable<typeof choice>>(
              `${endpoint}?${new URLSearchParams({ view: "event-choice", slug, occurrenceId: match[1] })}`,
              undefined,
              owner
            );
            if (seq === generation.current) {
              setChoice(data);
              setMessage("");
            }
          } catch (error) {
            if (seq === generation.current)
              setMessage(
                error instanceof Error
                  ? error.message
                  : "The event could not be checked."
              );
          } finally {
            edit.release();
          }
        }}
      >
        <label className="block space-y-2">
          <span>Existing event page link</span>
          <input
            className={portalInputClass}
            value={link}
            maxLength={500}
            required
            disabled={edit.blocked}
            onChange={(e) => {
              setLink(e.target.value);
              setChoice(null);
            }}
          />
        </label>
        <button className="gc-button gc-button-quiet" disabled={edit.blocked}>
          Check original event
        </button>
        {edit.notice}
        {message && <p role="status">{message}</p>}
      </form>
      {choice?.event && choice.event.access !== "BUSY" && (
        <GroupAction
          owner={owner}
          title="Link event to group"
          body={{
            operation: "link-event",
            groupId,
            occurrenceId: choice.event.id,
            expectedVersion: choice.link?.version ?? 0,
            occurrenceVersion: choice.event.version,
            eventVersion: choice.event.eventVersion
          }}
          fields={[
            {
              ...groupConfirmField,
              label:
                "I understand the original event keeps its own audience and attendance choices"
            }
          ]}
        >
          <p>
            {choice.event.title}. Group membership does not grant calendar
            access. This creates a reference without copying the event.
          </p>
        </GroupAction>
      )}
    </section>
  );
}

export function GroupAnswerForm({
  owner,
  postId,
  version
}: {
  owner: string;
  postId: string;
  version: number;
}) {
  return (
    <GroupForm
      owner={owner}
      title="Select a helpful answer"
      fields={[
        {
          key: "link",
          label: "Link to the answer comment",
          required: true,
          max: 500,
          help: "Use Link to comment on the reply you want to select."
        }
      ]}
      build={(values) => {
        const url = new URL(String(values.link), location.origin);
        const ids = url.searchParams.getAll("comment");
        if (
          url.origin !== location.origin ||
          url.pathname !== `/platform/posts/${postId}` ||
          ids.length !== 1 ||
          !/^[A-Za-z0-9_-]{1,100}$/.test(ids[0])
        )
          throw new Error("Choose a comment link from this same question.");
        return {
          operation: "select-answer",
          postId,
          expectedVersion: version,
          commentId: ids[0]
        };
      }}
    />
  );
}
