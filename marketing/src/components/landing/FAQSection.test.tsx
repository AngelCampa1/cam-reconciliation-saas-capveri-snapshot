import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FAQSection, LANDING_FAQS } from "./FAQSection";

describe("FAQSection", () => {
  it("renders the complete landing FAQ list collapsed with the help link", () => {
    render(<FAQSection />);

    expect(
      screen.getByRole("heading", { name: /common questions/i }),
    ).toBeInTheDocument();

    for (const faq of LANDING_FAQS) {
      expect(
        screen.getByRole("button", { name: faq.question }),
      ).toHaveAttribute("aria-expanded", "false");
    }

    expect(screen.getAllByRole("button")).toHaveLength(LANDING_FAQS.length);
    expect(
      screen.getByRole("link", { name: /view all \d+\+ faqs/i }),
    ).toHaveAttribute("href", "/help");
  });

  it("FAQ list includes a question about tenant disputes", () => {
    const hasDisputeQuestion = LANDING_FAQS.some((faq) =>
      /tenant dispute/i.test(faq.question),
    );
    expect(hasDisputeQuestion).toBe(true);
  });

  it("safety FAQ uses verified security controls", () => {
    const safetyFaq = LANDING_FAQS.find((faq) =>
      /financial data safe/i.test(faq.question),
    );
    expect(safetyFaq).toBeDefined();
    expect(safetyFaq?.answer).toMatch(/encryption/i);
    expect(safetyFaq?.answer).toMatch(/organization-scoped access controls/i);
    expect(safetyFaq?.answer).toMatch(/human-reviewed/i);
  });

  it('the dispute FAQ answer mentions "calculation trace" or "audit trail"', () => {
    const disputeFaq = LANDING_FAQS.find((faq) =>
      /tenant dispute/i.test(faq.question),
    );
    expect(disputeFaq).toBeDefined();
    const mentionsTrace =
      /calculation trace/i.test(disputeFaq!.answer) ||
      /audit trail/i.test(disputeFaq!.answer);
    expect(mentionsTrace).toBe(true);
  });

  it("clicking an FAQ item expands it and shows the answer", async () => {
    const user = userEvent.setup();
    render(<FAQSection />);
    const [firstFaq] = LANDING_FAQS;
    const firstButton = screen.getByRole("button", {
      name: firstFaq.question,
    });

    await user.click(firstButton);

    expect(firstButton).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(firstFaq.answer)).toBeInTheDocument();
    expect(getAccordionPanel(firstButton)).toHaveClass("grid-rows-[1fr]");
    // Open panel is exposed to assistive tech and keyboard users.
    expect(getAccordionPanel(firstButton)).not.toHaveAttribute("inert");
  });

  it("clicking an open FAQ item closes it", async () => {
    const user = userEvent.setup();
    render(<FAQSection />);
    const [firstFaq] = LANDING_FAQS;
    const firstButton = screen.getByRole("button", {
      name: firstFaq.question,
    });

    await user.click(firstButton);
    await user.click(firstButton);

    expect(firstButton).toHaveAttribute("aria-expanded", "false");
    expect(getAccordionPanel(firstButton)).toHaveClass("grid-rows-[0fr]");
    // Collapsed panel is removed from the a11y tree and tab order.
    expect(getAccordionPanel(firstButton)).toHaveAttribute("inert");
  });

  it("each FAQ trigger is linked to its answer panel for assistive tech", () => {
    render(<FAQSection />);

    for (const faq of LANDING_FAQS) {
      const button = screen.getByRole("button", { name: faq.question });
      const panel = getAccordionPanel(button);
      const panelId = panel.getAttribute("id");
      const triggerId = button.getAttribute("id");
      expect(panelId).toBeTruthy();
      expect(triggerId).toBeTruthy();
      // Trigger points at its panel; panel is a region named by its trigger.
      expect(button).toHaveAttribute("aria-controls", panelId);
      expect(panel).toHaveAttribute("role", "region");
      expect(panel).toHaveAttribute("aria-labelledby", triggerId);
    }
  });

  it("collapsed FAQ panels start inert and out of the tab order", () => {
    render(<FAQSection />);

    for (const faq of LANDING_FAQS) {
      const button = screen.getByRole("button", { name: faq.question });
      expect(getAccordionPanel(button)).toHaveAttribute("inert");
    }
  });

  it("clicking a different FAQ closes the previously open one", async () => {
    const user = userEvent.setup();
    render(<FAQSection />);
    const [firstFaq, secondFaq] = LANDING_FAQS;
    const firstButton = screen.getByRole("button", {
      name: firstFaq.question,
    });
    const secondButton = screen.getByRole("button", {
      name: secondFaq.question,
    });

    await user.click(firstButton);
    expect(firstButton).toHaveAttribute("aria-expanded", "true");

    await user.click(secondButton);

    expect(secondButton).toHaveAttribute("aria-expanded", "true");
    expect(firstButton).toHaveAttribute("aria-expanded", "false");
    expect(getAccordionPanel(secondButton)).toHaveClass("grid-rows-[1fr]");
    expect(getAccordionPanel(firstButton)).toHaveClass("grid-rows-[0fr]");
  });
});

function getAccordionPanel(button: HTMLElement) {
  const panel = button.parentElement?.querySelector(".grid");
  expect(panel).toBeInstanceOf(HTMLElement);
  return panel as HTMLElement;
}
