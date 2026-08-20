import { NextResponse, type NextRequest } from "next/server";

const APP_ROUTE_PREFIXES = [
  "/dashboard",
  "/auth",
  "/settings",
  "/properties",
  "/reconciliations",
  "/admin",
  "/tenant",
  "/organization",
  "/portfolio",
] as const;

function hostname(request: NextRequest): string {
  return request.headers.get("host")?.split(":")[0]?.toLowerCase() ?? "";
}

function startsWithAppRoute(pathname: string): boolean {
  return APP_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function middleware(request: NextRequest) {
  const host = hostname(request);
  const url = request.nextUrl.clone();

  if (host === "capveri.com") {
    url.hostname = "www.capveri.com";
    url.search = "";
    return NextResponse.redirect(url, 308);
  }

  if (host === "www.capveri.com" && startsWithAppRoute(url.pathname)) {
    url.hostname = "app.capveri.com";
    return NextResponse.redirect(url, 308);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api/|_next/|favicon.ico|icons/|site.webmanifest).*)"],
};
