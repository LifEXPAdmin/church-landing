"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { CheckCircle2 } from "lucide-react";

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
    <Button
      type="submit"
      size="lg"
      className="w-full rounded-full px-8 sm:w-auto"
      disabled={pending}
    >
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
        <div>
          <p className="text-sm uppercase tracking-[0.16em] text-primary">
            Step One
          </p>
          <h2 className="mt-1 text-3xl leading-tight">Choose your role</h2>
          <p className="mt-2 text-muted-foreground">
            Start with the option that best fits your calling today.
          </p>
        </div>
        <div className="grid gap-3">
          {ROLE_OPTIONS.map((option) => (
            <label
              key={option.value}
              className={cn(
                "group cursor-pointer rounded-2xl border border-border bg-card p-4 transition-all hover:border-primary/45 hover:shadow-[0_10px_24px_rgba(92,58,24,0.08)]",
                selectedRole === option.value &&
                  "border-primary bg-[#fffaf2] shadow-[0_10px_24px_rgba(92,58,24,0.1)] ring-1 ring-primary"
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
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-semibold">{option.label}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {option.description}
                  </p>
                </div>
                <span
                  className={cn(
                    "mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border border-border text-transparent transition-colors",
                    selectedRole === option.value &&
                      "border-primary bg-primary text-primary-foreground"
                  )}
                >
                  <CheckCircle2 className="h-4 w-4" />
                </span>
              </div>
            </label>
          ))}
        </div>
        {state.errors?.role ? (
          <p className="text-sm text-red-600">{state.errors.role}</p>
        ) : null}
      </section>

      <section className="space-y-4">
        <div>
          <p className="text-sm uppercase tracking-[0.16em] text-primary">
            Step Two
          </p>
          <h2 className="mt-1 text-3xl leading-tight">
            Tell us where to reach you
          </h2>
        </div>
        <div>
          <label htmlFor="name" className="mb-2 block text-sm font-semibold">
            Name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            className="w-full rounded-2xl border border-border bg-background px-4 py-3 outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
            aria-invalid={Boolean(state.errors?.name)}
          />
          {state.errors?.name ? (
            <p className="mt-1 text-sm text-red-600">{state.errors.name}</p>
          ) : null}
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
            className="w-full rounded-2xl border border-border bg-background px-4 py-3 outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
            aria-invalid={Boolean(state.errors?.email)}
          />
          {state.errors?.email ? (
            <p className="mt-1 text-sm text-red-600">{state.errors.email}</p>
          ) : null}
        </div>

        <div>
          <label htmlFor="message" className="mb-2 block text-sm font-semibold">
            What are you hoping to build or find?
          </label>
          <textarea
            id="message"
            name="message"
            rows={4}
            className="w-full rounded-2xl border border-border bg-background px-4 py-3 outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <div className="hidden">
          <label htmlFor="company">Company</label>
          <input
            id="company"
            name="company"
            type="text"
            autoComplete="off"
            tabIndex={-1}
          />
        </div>
        <input type="hidden" name="source" value={source ?? "direct"} />
      </section>

      {state.message && !state.success ? (
        <p className="text-sm text-red-600">{state.message}</p>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SubmitButton />
        {pending ? (
          <span className="text-sm text-muted-foreground">Please wait...</span>
        ) : null}
      </div>
    </form>
  );
}
