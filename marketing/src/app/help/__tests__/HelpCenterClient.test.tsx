import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HelpCenterPage } from "../HelpCenterClient";
import { FAQ_CATEGORIES, getFAQCount } from "@/data/faq-data";

// Mock IntersectionObserver - captures callback so we can simulate intersections
const mockObserve = vi.fn();
const mockDisconnect = vi.fn();
let intersectionCallback: IntersectionObserverCallback;

class MockIntersectionObserver {
  constructor(callback: IntersectionObserverCallback) {
    intersectionCallback = callback;
  }
  observe = mockObserve;
  disconnect = mockDisconnect;
  unobserve = vi.fn();
}

beforeEach(() => {
  mockObserve.mockClear();
  mockDisconnect.mockClear();
  vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
});

describe("HelpCenterPage", () => {
  it("renders the Help Center heading", () => {
    render(<HelpCenterPage />);
    expect(
      screen.getByRole("heading", { name: /help center/i, level: 1 }),
    ).toBeInTheDocument();
  });

  it("renders task-based beginner help cards before FAQs", () => {
    render(<HelpCenterPage />);
    expect(
      screen.getByRole("heading", { name: /what are you trying to do/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /start here/i })).toHaveAttribute(
      "href",
      "/docs",
    );
    expect(
      screen.getByRole("link", { name: /upload files/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /tenant questions/i }),
    ).toBeInTheDocument();
  });

  it("renders all category headings", () => {
    render(<HelpCenterPage />);
    for (const category of FAQ_CATEGORIES) {
      expect(
        screen.getByRole("heading", { name: new RegExp(category.title, "i") }),
      ).toBeInTheDocument();
    }
  });

  it("displays the total FAQ count in the subtitle", () => {
    render(<HelpCenterPage />);
    const count = getFAQCount();
    expect(
      screen.getByText(new RegExp(`${count} answers`)),
    ).toBeInTheDocument();
  });

  it("renders the updated date", () => {
    render(<HelpCenterPage />);
    expect(screen.getByText(/updated february 25, 2026/i)).toBeInTheDocument();
  });

  it("renders the search input", () => {
    render(<HelpCenterPage />);
    expect(
      screen.getByRole("searchbox", { name: /search help articles/i }),
    ).toBeInTheDocument();
  });

  it("renders category nav links with correct href anchors", () => {
    render(<HelpCenterPage />);
    for (const category of FAQ_CATEGORIES) {
      const links = screen.getAllByRole("link", {
        name: new RegExp(category.title, "i"),
      });
      const hasCorrectHref = links.some(
        (link) => link.getAttribute("href") === `#${category.id}`,
      );
      expect(hasCorrectHref).toBe(true);
    }
  });

  it("renders question count badges for each category", () => {
    render(<HelpCenterPage />);
    for (const category of FAQ_CATEGORIES) {
      // Find the section and check for the count badge
      const section = document.getElementById(category.id);
      expect(section).not.toBeNull();
      const badge = within(section!).getByText(
        String(category.questions.length),
      );
      expect(badge).toBeInTheDocument();
    }
  });

  it("renders Contact Support link pointing to /contact", () => {
    render(<HelpCenterPage />);
    const contactLink = screen.getByRole("link", {
      name: /contact support/i,
    });
    expect(contactLink).toHaveAttribute("href", "/contact");
  });

  it("renders 'Still have questions?' CTA", () => {
    render(<HelpCenterPage />);
    expect(
      screen.getByRole("heading", { name: /still have questions/i }),
    ).toBeInTheDocument();
  });

  describe("accordion behavior", () => {
    it("expands a FAQ item on click", async () => {
      const user = userEvent.setup();
      render(<HelpCenterPage />);
      const firstQuestion = FAQ_CATEGORIES[0].questions[0].question;
      const button = screen.getByRole("button", { name: firstQuestion });
      expect(button).toHaveAttribute("aria-expanded", "false");
      await user.click(button);
      expect(button).toHaveAttribute("aria-expanded", "true");
    });

    it("collapses a FAQ item on second click", async () => {
      const user = userEvent.setup();
      render(<HelpCenterPage />);
      const firstQuestion = FAQ_CATEGORIES[0].questions[0].question;
      const button = screen.getByRole("button", { name: firstQuestion });
      await user.click(button);
      await user.click(button);
      expect(button).toHaveAttribute("aria-expanded", "false");
    });

    it("allows multiple items to be open simultaneously", async () => {
      const user = userEvent.setup();
      render(<HelpCenterPage />);
      const q1 = FAQ_CATEGORIES[0].questions[0].question;
      const q2 = FAQ_CATEGORIES[0].questions[1].question;
      const button1 = screen.getByRole("button", { name: q1 });
      const button2 = screen.getByRole("button", { name: q2 });

      await user.click(button1);
      await user.click(button2);

      expect(button1).toHaveAttribute("aria-expanded", "true");
      expect(button2).toHaveAttribute("aria-expanded", "true");
    });
  });

  describe("search filtering", () => {
    it("filters questions by question text", async () => {
      const user = userEvent.setup();
      render(<HelpCenterPage />);
      const searchInput = screen.getByRole("searchbox");

      // Search for a specific term that appears in one question
      await user.type(searchInput, "gross-up safety valve");

      // The matching question should be visible
      expect(
        screen.getByText(/What is the gross-up safety valve/i),
      ).toBeInTheDocument();

      // Questions from unrelated categories should not be visible
      const allButtons = screen.getAllByRole("button");
      // Only matching questions should be shown (much fewer than total)
      expect(allButtons.length).toBeLessThan(getFAQCount());
    });

    it("filters questions by answer text", async () => {
      const user = userEvent.setup();
      render(<HelpCenterPage />);
      const searchInput = screen.getByRole("searchbox");

      // Search for a term that appears in an answer but not in question text
      await user.type(searchInput, "extracted values before financial use");

      // Should find results
      const buttons = screen.getAllByRole("button");
      expect(buttons.length).toBeGreaterThan(0);
    });

    it("shows all categories when search is empty", () => {
      render(<HelpCenterPage />);
      for (const category of FAQ_CATEGORIES) {
        expect(
          screen.getByRole("heading", {
            name: new RegExp(category.title, "i"),
          }),
        ).toBeInTheDocument();
      }
    });

    it("shows no-results message for nonsense query", async () => {
      const user = userEvent.setup();
      render(<HelpCenterPage />);
      const searchInput = screen.getByRole("searchbox");

      await user.type(searchInput, "xyzzy99nonsensequery");

      expect(screen.getByText(/no results found/i)).toBeInTheDocument();
    });
  });

  describe("IntersectionObserver scroll-spy", () => {
    it("observes category sections on mount", () => {
      render(<HelpCenterPage />);
      expect(mockObserve).toHaveBeenCalled();
    });

    it("disconnects observer on unmount", () => {
      const { unmount } = render(<HelpCenterPage />);
      unmount();
      expect(mockDisconnect).toHaveBeenCalled();
    });

    it("handles intersection callback for intersecting entries", () => {
      render(<HelpCenterPage />);
      const mockEntry = {
        isIntersecting: true,
        target: { id: "pricing-roi" },
      } as unknown as IntersectionObserverEntry;
      // Should not throw
      act(() => {
        intersectionCallback([mockEntry], {} as unknown as IntersectionObserver);
      });
      // Component should still be rendered
      expect(
        screen.getByRole("heading", { name: /help center/i }),
      ).toBeInTheDocument();
    });

    it("handles intersection callback for non-intersecting entries", () => {
      render(<HelpCenterPage />);
      const mockEntry = {
        isIntersecting: false,
        target: { id: "pricing-roi" },
      } as unknown as IntersectionObserverEntry;
      act(() => {
        intersectionCallback([mockEntry], {} as unknown as IntersectionObserver);
      });
      expect(
        screen.getByRole("heading", { name: /help center/i }),
      ).toBeInTheDocument();
    });
  });
});
