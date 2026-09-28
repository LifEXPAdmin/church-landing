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
  // Preserve caches for API data and filename-like assets (including root hero
  // images). If these paths fall through to an HTML 404, the root's dynamic
  // render itself supplies no-store, and still receives this request's nonce.
  const dataOrAsset =
    path.startsWith("/api/") ||
    /\.(?:avif|css|gif|ico|jpe?g|js|json|png|svg|txt|webmanifest|webp|woff2?|xml)$/i.test(
      path
    );
  if (!dataOrAsset)
    response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}

export const config = {
  // Missing API/asset paths can render HTML 404s, so they need a nonce too.
  // Next handles missing compiled chunks with a plain-text response. Do not
  // skip prefetch or RSC: their render must use a trusted policy as well.
  matcher: ["/((?!_next/static/|_next/image(?:/|$)).*)"]
};
