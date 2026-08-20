import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FrontmatterFAQ } from "../FrontmatterFAQ";

describe("FrontmatterFAQ", () => {
  it("renders frontmatter FAQ questions and answers as visible content", () => {
    render(
      <FrontmatterFAQ
        faqs={[
          {
            q: "What makes CAM FAQ content extractable?",
            a: "The question and direct answer are visible in the rendered article.",
          },
        ]}
      />,
    );

    // The question renders inside a <summary><h3> for document outline semantics.
    expect(
      screen.getByRole("heading", {
        name: "What makes CAM FAQ content extractable?",
      }),
    ).toBeInTheDocument();
    // The answer is inside a <details> which is closed by default in JSDOM,
    // so the <p> is in the DOM but may not be visible; assert presence only.
    expect(
      screen.getByText(
        "The question and direct answer are visible in the rendered article.",
      ),
    ).toBeInTheDocument();
  });

  it("omits the section when frontmatter has no FAQ entries", () => {
    const { container } = render(<FrontmatterFAQ />);

    expect(container).toBeEmptyDOMElement();
  });
});
