import { WaitlistRole } from "@prisma/client";

const roleToLabel: Record<WaitlistRole, string> = {
  BELIEVER: "Believer / Community",
  CHURCH: "Church / Pastor",
  CREATOR: "Creator / Preacher",
  BUSINESS: "Business",
  BUILDER: "Builder / Volunteer"
};

interface WaitlistEmailPayload {
  role: WaitlistRole;
  name: string;
  email: string;
  message?: string | null;
}

export async function sendWaitlistNotification(payload: WaitlistEmailPayload) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  const notifyTo = process.env.NOTIFY_TO_EMAIL ?? "mcdrew169@yahoo.com";

  if (!apiKey || !from) {
    return;
  }

  const subject = `New ${roleToLabel[payload.role]} waitlist signup`;
  const html = `
    <h2>New waitlist signup</h2>
    <p><strong>Role:</strong> ${roleToLabel[payload.role]}</p>
    <p><strong>Name:</strong> ${payload.name}</p>
    <p><strong>Email:</strong> ${payload.email}</p>
    <p><strong>Message:</strong> ${payload.message && payload.message.length > 0 ? payload.message : "(none)"}</p>
  `;

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from,
      to: [notifyTo],
      reply_to: payload.email,
      subject,
      html,
      tags: [
        { name: "app", value: "church" },
        { name: "role", value: payload.role.toLowerCase() }
      ]
    })
  });
}
