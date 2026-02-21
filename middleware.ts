import { NextRequest, NextResponse } from "next/server";

const ADMIN_USERNAME = "admin";

function unauthorizedResponse() {
  return new NextResponse("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Waitlist Admin", charset="UTF-8"'
    }
  });
}

export function middleware(request: NextRequest) {
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminPassword) {
    return new NextResponse("ADMIN_PASSWORD is not configured.", { status: 500 });
  }

  const authHeader = request.headers.get("authorization");

  if (!authHeader?.startsWith("Basic ")) {
    return unauthorizedResponse();
  }

  const decoded = atob(authHeader.slice(6));
  const separatorIndex = decoded.indexOf(":");

  if (separatorIndex === -1) {
    return unauthorizedResponse();
  }

  const username = decoded.slice(0, separatorIndex);
  const password = decoded.slice(separatorIndex + 1);

  if (username !== ADMIN_USERNAME || password !== adminPassword) {
    return unauthorizedResponse();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"]
};
