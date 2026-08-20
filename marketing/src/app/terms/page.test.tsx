import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { publicKnowledge } from "@/generated/public-knowledge";
import TermsOfServicePage from "./page";

describe("terms page", () => {
  it("discloses the 80OFF discount duration", () => {
    render(<TermsOfServicePage />);

    expect(screen.getByText("8a. Limited Offer")).toBeInTheDocument();
    expect(
      screen.getByText(
        new RegExp(
          `${publicKnowledge.pricing.launchOffer.code} gives ${publicKnowledge.pricing.launchOffer.label}`,
          "i",
        ),
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/It applies only to subscriptions/i),
    ).toBeInTheDocument();
  });
});
