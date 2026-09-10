"use client";
import { useState } from "react";
export const accountInputClass =
  "mt-2 w-full rounded-xl border border-gc-divider bg-gc-canvas px-4 py-3 text-base text-gc-text outline-none focus:ring-2 focus:ring-gc-focus";
export function PasswordField({
  id,
  name,
  label,
  autocomplete
}: {
  id: string;
  name: string;
  label: string;
  autocomplete: "new-password" | "current-password";
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div>
      <label htmlFor={id}>{label}</label>
      <div className="relative">
        <input
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          autoComplete={autocomplete}
          minLength={8}
          maxLength={128}
          required
          className={`${accountInputClass} pr-20`}
        />
        <button
          type="button"
          aria-label={`${visible ? "Hide" : "Show"} ${label.toLowerCase()}`}
          aria-pressed={visible}
          aria-controls={id}
          onClick={() => setVisible(!visible)}
          className="absolute bottom-1 right-1 min-h-11 min-w-16 rounded-xl text-sm text-gc-accent focus-visible:outline focus-visible:outline-2"
        >
          {visible ? "Hide" : "Show"}
        </button>
      </div>
    </div>
  );
}
