"use server";

import { WaitlistRole } from "@prisma/client";
import { redirect } from "next/navigation";

import { trackEvent } from "@/lib/analytics";
import { prisma } from "@/lib/prisma";
import { syncSubscriberToMailerLite } from "@/lib/mailerlite";
import { ROLE_OPTIONS, type Role } from "@/lib/constants";

export interface JoinActionState {
  success: boolean;
  message: string;
  errors?: Partial<Record<"name" | "email" | "role", string>>;
}

const initialState: JoinActionState = {
  success: false,
  message: ""
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLES = new Set<Role>(ROLE_OPTIONS.map((role) => role.value));

export async function submitWaitlist(
  prevState: JoinActionState = initialState,
  formData: FormData
): Promise<JoinActionState> {
  void prevState;
  const honeypot = String(formData.get("company") ?? "").trim();
  if (honeypot.length > 0) {
    redirect("/thanks");
  }

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const message = String(formData.get("message") ?? "").trim();
  const role = String(formData.get("role") ?? "") as Role;
  const source = String(formData.get("source") ?? "direct").trim().slice(0, 120);

  const errors: JoinActionState["errors"] = {};

  if (name.length < 2) {
    errors.name = "Please enter your full name.";
  }

  if (!EMAIL_REGEX.test(email)) {
    errors.email = "Please enter a valid email address.";
  }

  if (!ROLES.has(role)) {
    errors.role = "Please select a role.";
  }

  if (errors.name || errors.email || errors.role) {
    return {
      success: false,
      message: "Please fix the highlighted fields.",
      errors
    };
  }

  let submittedRole: WaitlistRole | null = null;

  try {
    const signup = await prisma.waitlistSignup.upsert({
      where: {
        email_role: {
          email,
          role
        }
      },
      create: {
        name,
        email,
        role,
        message: message.length > 0 ? message : null,
        source
      },
      update: {
        name,
        message: message.length > 0 ? message : null,
        source
      }
    });

    await Promise.all([
      syncSubscriberToMailerLite({
        role: role as WaitlistRole,
        name,
        email
      }).catch((error) => {
        console.error("MailerLite sync failed", error);
      }),
      trackEvent({
        eventType: "JOIN_SUCCESS",
        path: "/join",
        role: role as WaitlistRole,
        label: source
      }).catch((error) => {
        console.error("Analytics tracking failed", error);
      })
    ]);

    submittedRole = signup.role;
  } catch (error) {
    console.error("Waitlist submit failed", error);
    return {
      success: false,
      message: "We couldn't submit your request right now. Please try again in a minute."
    };
  }

  if (submittedRole) {
    redirect(`/thanks?role=${submittedRole}`);
  }

  return {
    success: false,
    message: "We couldn't submit your request right now. Please try again in a minute."
  };
}
