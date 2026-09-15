// One bounded provider attempt. The caller owns retry policy and idempotency.
// Never return a provider body or exception containing recipient/key material.
export async function sendResendEmail(
  apiKey: string,
  body: string,
  idempotencyKey: string,
  send: typeof fetch = fetch
) {
  try {
    const response = await send("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey
      },
      body,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(10000)
    });
    if (response.ok) {
      const result: unknown = await response.json();
      return result &&
        typeof result === "object" &&
        "id" in result &&
        typeof result.id === "string" &&
        result.id
        ? response.status
        : 0;
    }
    await response.body?.cancel();
    return response.status;
  } catch {
    return 0;
  }
}
