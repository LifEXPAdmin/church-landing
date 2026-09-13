export function founderAccountId(): string | null {
  const id = process.env.FOUNDER_ACCOUNT_ID?.trim();
  return id && /^[\w-]{1,80}$/.test(id) ? id : null;
}
export function newFounderWelcomeAt() {
  return process.env.FOUNDER_WELCOME_ENABLED === "true" ? new Date() : null;
}
