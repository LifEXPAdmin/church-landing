"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";

import { submitWaitlist, type JoinActionState } from "@/app/join/actions";
import { Button } from "@/components/ui/button";
import { trackClientEvent } from "@/lib/client-analytics";
import { ROLE_OPTIONS, type Role } from "@/lib/constants";
import { cn } from "@/lib/utils";

interface JoinFormProps {
  initialRole?: string;
  source?: string;
}

const initialState: JoinActionState = {
  success: false,
  message: ""
};

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={pending}>
      {pending ? "Submitting..." : "Join Waitlist"}
    </Button>
  );
}

export function JoinForm({ initialRole, source }: JoinFormProps) {
  const [state, action, pending] = useActionState(submitWaitlist, initialState);

  const resolvedInitialRole = useMemo<Role>(() => {
    const maybeRole = initialRole?.toUpperCase() as Role | undefined;
    const exists = ROLE_OPTIONS.some((option) => option.value === maybeRole);
    return exists ? (maybeRole as Role) : "BELIEVER";
  }, [initialRole]);
  const [selectedRole, setSelectedRole] = useState<Role>(resolvedInitialRole);

  useEffect(() => {
    setSelectedRole(resolvedInitialRole);
  }, [resolvedInitialRole]);

  const trackSubmit = () => {
    trackClientEvent({
      eventType: "JOIN_SUBMIT",
      path: "/join",
      role: selectedRole
    });
  };

  return (
    <form action={action} className="space-y-8" onSubmit={trackSubmit}>
      <section className="space-y-3">
        <h2 className="text-2xl">Choose your role</h2>
        <p className="text-muted-foreground">Start with the option that best fits your calling today.</p>
        <div className="grid gap-3">
          {ROLE_OPTIONS.map((option) => (
            <label
              key={option.value}
              className={cn(
                "cursor-pointer rounded-xl border border-border bg-card p-4 transition-colors",
                selectedRole === option.value && "border-primary ring-1 ring-primary"
              )}
            >
              <input
                type="radio"
                name="role"
                value={option.value}
                checked={selectedRole === option.value}
                onChange={() => setSelectedRole(option.value)}
                className="sr-only"
              />
              <p className="font-semibold">{option.label}</p>
              <p className="text-sm text-muted-foreground">{option.description}</p>
            </label>
          ))}
        </div>
        {state.errors?.role ? <p className="text-sm text-red-600">{state.errors.role}</p> : null}
      </section>

      <section className="space-y-4">
        <div>
          <label htmlFor="name" className="mb-2 block text-sm font-semibold">
            Name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            className="w-full rounded-xl border border-border bg-background px-4 py-3"
            aria-invalid={Boolean(state.errors?.name)}
          />
          {state.errors?.name ? <p className="mt-1 text-sm text-red-600">{state.errors.name}</p> : null}
        </div>

        <div>
          <label htmlFor="email" className="mb-2 block text-sm font-semibold">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            className="w-full rounded-xl border border-border bg-background px-4 py-3"
            aria-invalid={Boolean(state.errors?.email)}
          />
          {state.errors?.email ? <p className="mt-1 text-sm text-red-600">{state.errors.email}</p> : null}
        </div>

        <div>
          <label htmlFor="message" className="mb-2 block text-sm font-semibold">
            What are you hoping to build or find?
          </label>
          <textarea
            id="message"
            name="message"
            rows={4}
            className="w-full rounded-xl border border-border bg-background px-4 py-3"
          />
        </div>

        <div className="hidden">
          <label htmlFor="company">Company</label>
          <input id="company" name="company" type="text" autoComplete="off" tabIndex={-1} />
        </div>
        <input type="hidden" name="source" value={source ?? "direct"} />
      </section>

      {state.message && !state.success ? <p className="text-sm text-red-600">{state.message}</p> : null}

      <div className="flex items-center gap-3">
        <SubmitButton />
        {pending ? <span className="text-sm text-muted-foreground">Please wait...</span> : null}
      </div>
    </form>
  );
}
