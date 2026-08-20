import { NextResponse } from "next/server";

export const dynamic = "force-static";

export function GET() {
  return NextResponse.json({
    app: "marketing",
    version: process.env.NEXT_PUBLIC_APP_VERSION || "0.1.0",
    commit:
      process.env.NEXT_PUBLIC_BUILD_COMMIT ||
      process.env.CF_PAGES_COMMIT_SHA ||
      process.env.GITHUB_SHA ||
      "unknown",
    environment: process.env.CF_WORKER_ENV || process.env.NODE_ENV || "unknown",
  });
}
