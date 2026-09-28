import { NextRequest, NextResponse } from "next/server";
import {
  requestScriptPolicy,
  CSP_REPORT_ENDPOINT
} from "./lib/security/content-security-policy";

const ADMIN_USERNAME = "admin";

function unauthorizedResponse() {
  return new NextResponse("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Waitlist Admin", charset="UTF-8"'
    }
  });
}

function authenticateAdmin(request: NextRequest) {
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminPassword) {
    return new NextResponse("ADMIN_PASSWORD is not configured.", {
      status: 500
    });
  }

  const authHeader = request.headers.get("authorization");

  if (!authHeader?.startsWith("Basic ")) {
    return unauthorizedResponse();
  }

  let decoded: string;
  try {
    decoded = atob(authHeader.slice(6));
  } catch {
    return unauthorizedResponse();
  }
  const separatorIndex = decoded.indexOf(":");

  if (separatorIndex === -1) {
    return unauthorizedResponse();
  }

  const username = decoded.slice(0, separatorIndex);
  const password = decoded.slice(separatorIndex + 1);

  if (username !== ADMIN_USERNAME || password !== adminPassword) {
    return unauthorizedResponse();
  }

  return null;
}

export function middleware(request: NextRequest) {
  const { policy, forwarded } = requestScriptPolicy(
    request.headers,
    process.env.NODE_ENV === "development"
  );
  const path = request.nextUrl.pathname;
  const denied =
    path === "/admin" || path.startsWith("/admin/")
      ? authenticateAdmin(request)
      : null;
  const response =
    denied ?? NextResponse.next({ request: { headers: forwarded } });
  response.headers.set("Content-Security-Policy", policy);
  response.headers.set("Reporting-Endpoints", `csp="${CSP_REPORT_ENDPOINT}"`);
  // A cached document cannot share a nonce with another request. Static assets
  // are excluded below and retain their normal immutable/cache behavior.
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}

export const config = {
  // Do not skip prefetch or RSC: their server render must use a trusted policy
  // too. Exclude only API responses and known non-document asset namespaces.
  matcher: [
    "/((?!api/|api$|_next/|images/|brand/|favicon\\.ico$|manifest\\.webmanifest$|robots\\.txt$|sitemap\\.xml$|notification-worker\\.js$).*)"
  ]
};
