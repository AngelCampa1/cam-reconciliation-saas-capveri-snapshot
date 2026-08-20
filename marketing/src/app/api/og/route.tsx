import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";

const CATEGORY_COLORS: Record<string, string> = {
  Blog: "#3b82f6",
  Resource: "#8b5cf6",
  Tool: "#10b981",
  Comparison: "#f59e0b",
  Glossary: "#6366f1",
  Pricing: "#ec4899",
};

function CapVeriMark() {
  return (
    <svg width="48" height="48" viewBox="0 0 256 256" fill="none">
      <path
        d="M49 166a83 83 0 0 1 20-88v34a57 57 0 0 0-6 54H49Z"
        fill="#0F8E8A"
      />
      <path
        d="M190 126a83 83 0 0 1-151 76l12-9a67 67 0 0 0 126-52l13-15Z"
        fill="#18212A"
      />
      <path d="M70 96 111 72v86l-41 23V96Z" fill="#0B817D" />
      <path d="M119 48 161 24v109l-42 33V48Z" fill="#18212A" />
      <path d="M168 76 209 100v54l-41 25V76Z" fill="#0B817D" />
      <path
        d="M86 180h24v25H86v-25Zm33-14h24v39h-24v-39Zm33-23h24v62h-24v-62Z"
        fill="#C9A646"
      />
      <path d="m87 153 41 38 74-82 11 9-84 95-58-50 16-10Z" fill="#0B817D" />
      <path d="m92 151 36 33 70-77 8 7-78 88-48-42 12-9Z" fill="#FFFFFF" />
      <path d="m92 151 36 33 70-77 8 7-78 88-48-42 12-9Z" fill="#0B817D" />
    </svg>
  );
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const title = searchParams.get("title") ?? "CapVeri.com";
  const category = searchParams.get("category") ?? "";

  const badgeColor = CATEGORY_COLORS[category] ?? "#6b7280";

  return new ImageResponse(
    <div
      style={{
        height: "100%",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "60px 80px",
        backgroundColor: "#0a0a0a",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      {/* Top bar with logo + category */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "16px",
          marginBottom: "40px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <CapVeriMark />
          </div>
          <span
            style={{
              fontSize: "28px",
              fontWeight: 700,
              color: "#f8fafc",
            }}
          >
            CapVeri.com
          </span>
        </div>
        {category && (
          <div
            style={{
              display: "flex",
              backgroundColor: badgeColor,
              color: "white",
              padding: "4px 16px",
              borderRadius: "9999px",
              fontSize: "16px",
              fontWeight: 600,
            }}
          >
            {category}
          </div>
        )}
      </div>

      {/* Title */}
      <div
        style={{
          display: "flex",
          fontSize: title.length > 60 ? "48px" : "56px",
          fontWeight: 700,
          color: "#fafafa",
          lineHeight: 1.2,
          maxWidth: "900px",
        }}
      >
        {title}
      </div>

      {/* Bottom tagline */}
      <div
        style={{
          display: "flex",
          marginTop: "auto",
          fontSize: "20px",
          color: "#71717a",
        }}
      >
        CRE FinOps Platform for Landlords &amp; Property Managers
      </div>
    </div>,
    {
      width: 1200,
      height: 630,
    },
  );
}
