import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { JsonLd } from "@/components/JsonLd";

describe("JsonLd", () => {
  it("renders a script tag with type application/ld+json", () => {
    const { container } = render(<JsonLd data={{ "@type": "Organization" }} />);
    const script = container.querySelector("script");
    expect(script).not.toBeNull();
    expect(script!.type).toBe("application/ld+json");
  });

  it("JSON-stringifies the data object into innerHTML", () => {
    const data = {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "CapVeri.com",
      url: "https://www.capveri.com",
    };
    const { container } = render(<JsonLd data={data} />);
    const script = container.querySelector("script");
    expect(JSON.parse(script!.innerHTML)).toEqual(data);
  });

  it("handles nested objects", () => {
    const data = {
      "@type": "Organization",
      contactPoint: { "@type": "ContactPoint", email: "test@test.com" },
    };
    const { container } = render(<JsonLd data={data} />);
    const parsed = JSON.parse(container.querySelector("script")!.innerHTML);
    expect(parsed.contactPoint.email).toBe("test@test.com");
  });
});
