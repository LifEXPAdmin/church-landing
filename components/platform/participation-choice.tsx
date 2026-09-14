"use client";
import { useState } from "react";
import type { PlatformRole } from "@prisma/client";
import { roleLabels } from "@/lib/platform/format";
import { accountInputClass } from "./account-fields";

export function ParticipationChoice({
  id,
  initialValue = "BELIEVER"
}: {
  id: string;
  initialValue?: PlatformRole;
}) {
  const [value, setValue] = useState(initialValue);
  return (
    <div>
      <label htmlFor={id}>How would you like to participate?</label>
      <select
        id={id}
        name="role"
        className={accountInputClass}
        value={value}
        onChange={(event) => setValue(event.target.value as PlatformRole)}
        aria-describedby={`${id}-help`}
      >
        {Object.entries(roleLabels).map(([choice, label]) => (
          <option key={choice} value={choice}>
            {label}
          </option>
        ))}
      </select>
      <div
        id={`${id}-help`}
        className="mt-2 space-y-2 text-sm text-gc-muted"
        aria-live="polite"
      >
        {value === "EXPLORING_FAITH" && (
          <p>
            I’m learning about Christianity and figuring out what I believe.
          </p>
        )}
        <p>
          This describes your interests. It does not grant church or
          administrative access. You can change it in Edit profile. Exploring
          Faith is private to your account.
        </p>
      </div>
    </div>
  );
}
