import { createHmac } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { accountOrigin } from "../platform/account-config";

export const CSP_REPORT_MAX_BYTES = 16_384;
export const CSP_REPORT_MAX_BATCH = 8;
export const CSP_REPORT_REQUESTS_PER_MINUTE = 60;
const BODY_TIMEOUT_MS = 3000;

const directives = [
  "default-src",
  "script-src",
  "script-src-elem",
  "script-src-attr",
  "style-src",
  "style-src-elem",
  "style-src-attr",
  "img-src",
  "font-src",
  "connect-src",
  "worker-src",
  "child-src",
  "frame-src",
  "frame-ancestors",
  "object-src",
  "base-uri",
  "form-action",
  "manifest-src",
  "media-src",
  "trusted-types",
  "require-trusted-types-for"
] as const;
type Directive = (typeof directives)[number];
type ResourceKind =
  | "inline"
  | "eval"
  | "same-origin"
  | "external"
  | "data"
  | "blob"
  | "other";
export type CspDiagnostic = {
  directive: Directive;
  disposition: "enforce" | "report";
  resource: ResourceKind;
  status?: number;
  line?: number;
  column?: number;
};
type ReportDatabase = Pick<Prisma.TransactionClient, "$queryRaw">;
type Options = {
  env?: NodeJS.ProcessEnv;
  log?: (event: "csp_violation", reports: CspDiagnostic[]) => void;
};
const responseHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff"
};

class ReportError extends Error {
  readonly status: number;
  constructor(status: number) {
    super("Report unavailable");
    this.status = status;
  }
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new ReportError(400);
  return value as Record<string, unknown>;
}
function sameOrigin(value: unknown, origin: string) {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.origin === origin && !url.username && !url.password;
  } catch {
    return false;
  }
}
function resourceKind(value: unknown, origin: string): ResourceKind {
  if (value === "inline" || value === "eval") return value;
  if (typeof value !== "string") return "other";
  if (/^data:/i.test(value)) return "data";
  if (/^blob:/i.test(value)) return "blob";
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol)) return "other";
    return url.origin === origin ? "same-origin" : "external";
  } catch {
    return "other";
  }
}
function integer(value: unknown, maximum: number) {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= maximum
    ? value
    : undefined;
}
function diagnostic(
  body: Record<string, unknown>,
  origin: string,
  modern: boolean
): CspDiagnostic {
  const directive = body[modern ? "effectiveDirective" : "effective-directive"];
  const disposition = body.disposition;
  if (
    !directives.includes(directive as Directive) ||
    !["enforce", "report"].includes(disposition as string)
  )
    throw new ReportError(400);
  if (!sameOrigin(body[modern ? "documentURL" : "document-uri"], origin))
    throw new ReportError(400);
  const status = integer(body[modern ? "statusCode" : "status-code"], 599);
  const line = integer(body[modern ? "lineNumber" : "line-number"], 10_000_000);
  const column = integer(
    body[modern ? "columnNumber" : "column-number"],
    10_000_000
  );
  // Construct a fresh projection. Reports, URLs, policies, samples and headers
  // are attacker-controlled and must never be forwarded to diagnostics.
  return {
    directive: directive as Directive,
    disposition: disposition as "enforce" | "report",
    resource: resourceKind(body[modern ? "blockedURL" : "blocked-uri"], origin),
    ...(status !== undefined && (status === 0 || status >= 100)
      ? { status }
      : {}),
    ...(line !== undefined ? { line } : {}),
    ...(column !== undefined ? { column } : {})
  };
}

async function readReports(request: Request) {
  if (!request.body) throw new ReportError(400);
  const reader = request.body.getReader();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ReportError(408)), BODY_TIMEOUT_MS);
  });
  try {
    return await Promise.race([
      (async () => {
        const chunks: Uint8Array[] = [];
        let length = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          length += value.byteLength;
          if (length > CSP_REPORT_MAX_BYTES) throw new ReportError(413);
          chunks.push(value);
        }
        try {
          return JSON.parse(
            new TextDecoder("utf-8", { fatal: true }).decode(
              Buffer.concat(chunks)
            )
          ) as unknown;
        } catch {
          throw new ReportError(400);
        }
      })(),
      timeout
    ]);
  } finally {
    clearTimeout(timer);
    // Cancellation cannot turn a generic failure into a reflected stream error.
    void reader.cancel().catch(() => {});
  }
}

/** One fixed, independent bucket bounds work/logs across all server instances.
 * No client identifiers or attacker-selected keys are stored, and no account
 * limiter rows are deleted or charged by this diagnostic endpoint.
 */
export async function allowCspReport(db: ReportDatabase, secret: string) {
  const key = createHmac("sha256", secret)
    .update("csp-report:v1:global")
    .digest("hex");
  const [row] = await db.$queryRaw<Array<{ hits: number }>>`
    INSERT INTO "PlatformAuthLimit" ("key", "hits", "expiresAt")
    VALUES (${key}, 1, (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + INTERVAL '60 seconds')
    ON CONFLICT ("key") DO UPDATE SET
      "hits" = CASE WHEN "PlatformAuthLimit"."expiresAt" <= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') THEN 1
                    ELSE LEAST("PlatformAuthLimit"."hits" + 1, ${CSP_REPORT_REQUESTS_PER_MINUTE + 1}) END,
      "expiresAt" = CASE WHEN "PlatformAuthLimit"."expiresAt" <= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
                        THEN (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + INTERVAL '60 seconds'
                        ELSE "PlatformAuthLimit"."expiresAt" END
    RETURNING "hits"`;
  if (!row || !Number.isInteger(row.hits) || row.hits < 1)
    throw new Error("Report unavailable");
  return row.hits <= CSP_REPORT_REQUESTS_PER_MINUTE;
}

export async function handleCspReport(
  db: ReportDatabase,
  request: Request,
  options: Options = {}
): Promise<Response> {
  try {
    if (request.method !== "POST") throw new ReportError(405);
    const env = options.env ?? process.env;
    const origin = accountOrigin(env);
    const suppliedOrigin = request.headers.get("origin");
    const fetchSite = request.headers.get("sec-fetch-site");
    if (
      (suppliedOrigin !== null && suppliedOrigin !== origin.origin) ||
      (fetchSite !== null && fetchSite !== "same-origin")
    )
      throw new ReportError(403);
    // Older report senders omit Origin and Fetch Metadata. Their reported
    // document origin is still checked; this never authenticates their claims.
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname);
    const secret =
      env.AUTH_RATE_LIMIT_SECRET ??
      (local && env.NODE_ENV !== "production" && !env.VERCEL
        ? "local-development-only-account-limit-key"
        : "");
    if (secret.length < 32) throw new ReportError(503);
    const type = request.headers
      .get("content-type")
      ?.split(";", 1)[0]
      .trim()
      .toLowerCase();
    if (
      type !== "application/csp-report" &&
      type !== "application/reports+json"
    )
      throw new ReportError(415);
    const length = request.headers.get("content-length");
    if (
      length !== null &&
      (!/^\d+$/.test(length) || Number(length) > CSP_REPORT_MAX_BYTES)
    )
      throw new ReportError(413);
    // Charge before consuming/parsing the body, including malformed reports.
    if (!(await allowCspReport(db, secret))) throw new ReportError(429);
    const value = await readReports(request);
    let reports: CspDiagnostic[];
    if (type === "application/csp-report") {
      reports = [
        diagnostic(object(object(value)["csp-report"]), origin.origin, false)
      ];
    } else {
      if (
        !Array.isArray(value) ||
        value.length < 1 ||
        value.length > CSP_REPORT_MAX_BATCH
      )
        throw new ReportError(400);
      reports = value.map((entry) => {
        const report = object(entry);
        if (
          report.type !== "csp-violation" ||
          !sameOrigin(report.url, origin.origin)
        )
          throw new ReportError(400);
        return diagnostic(object(report.body), origin.origin, true);
      });
    }
    (options.log ?? ((event, diagnostics) => console.info(event, diagnostics)))(
      "csp_violation",
      reports
    );
    return new Response(null, { status: 204, headers: responseHeaders });
  } catch (error) {
    const status = error instanceof ReportError ? error.status : 503;
    return Response.json(
      { error: "Report unavailable" },
      {
        status,
        headers: {
          ...responseHeaders,
          ...(status === 405 ? { Allow: "POST" } : {}),
          ...(status === 429 ? { "Retry-After": "60" } : {})
        }
      }
    );
  }
}
