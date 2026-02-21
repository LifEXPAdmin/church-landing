import { WaitlistRole } from "@prisma/client";

interface MailerLiteSyncPayload {
  role: WaitlistRole;
  name: string;
  email: string;
}

const DEFAULT_GROUP_NAMES: Record<WaitlistRole, string> = {
  BELIEVER: "Church (User)",
  CHURCH: "Church (Church)",
  CREATOR: "Church (Creator)",
  BUSINESS: "Church (Business)",
  BUILDER: "Church (Builder)"
};

const ROLE_TO_GROUP_ID_ENV: Record<WaitlistRole, string> = {
  BELIEVER: "MAILERLITE_GROUP_ID_BELIEVER",
  CHURCH: "MAILERLITE_GROUP_ID_CHURCH",
  CREATOR: "MAILERLITE_GROUP_ID_CREATOR",
  BUSINESS: "MAILERLITE_GROUP_ID_BUSINESS",
  BUILDER: "MAILERLITE_GROUP_ID_BUILDER"
};

const ROLE_TO_GROUP_NAME_ENV: Record<WaitlistRole, string> = {
  BELIEVER: "MAILERLITE_GROUP_NAME_BELIEVER",
  CHURCH: "MAILERLITE_GROUP_NAME_CHURCH",
  CREATOR: "MAILERLITE_GROUP_NAME_CREATOR",
  BUSINESS: "MAILERLITE_GROUP_NAME_BUSINESS",
  BUILDER: "MAILERLITE_GROUP_NAME_BUILDER"
};

function getApiKey() {
  return process.env.MAILERLITE_API_KEY?.trim();
}

async function fetchGroupIdByName(apiKey: string, groupName: string) {
  const url = `https://connect.mailerlite.com/api/groups?filter[name]=${encodeURIComponent(groupName)}&limit=100`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`MailerLite groups lookup failed: ${response.status}`);
  }

  const body = (await response.json()) as {
    data?: Array<{ id: string; name: string }>;
  };

  const group = body.data?.find((item) => item.name.toLowerCase() === groupName.toLowerCase()) ?? body.data?.[0];

  return group?.id;
}

async function resolveGroupId(apiKey: string, role: WaitlistRole) {
  const configuredGroupId = process.env[ROLE_TO_GROUP_ID_ENV[role]]?.trim();
  if (configuredGroupId) {
    return configuredGroupId;
  }

  const groupName = process.env[ROLE_TO_GROUP_NAME_ENV[role]]?.trim() || DEFAULT_GROUP_NAMES[role];
  const fetchedGroupId = await fetchGroupIdByName(apiKey, groupName);

  if (!fetchedGroupId) {
    throw new Error(`MailerLite group not found for role ${role} (expected group name: ${groupName})`);
  }

  return fetchedGroupId;
}

export async function syncSubscriberToMailerLite(payload: MailerLiteSyncPayload) {
  const apiKey = getApiKey();
  if (!apiKey) {
    return;
  }

  const groupId = await resolveGroupId(apiKey, payload.role);

  const response = await fetch("https://connect.mailerlite.com/api/subscribers", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({
      email: payload.email,
      fields: {
        name: payload.name
      },
      groups: [groupId],
      status: "active"
    })
  });

  if (!response.ok) {
    const bodyText = await response.text();
    throw new Error(`MailerLite subscribe failed: ${response.status} ${bodyText}`);
  }
}
