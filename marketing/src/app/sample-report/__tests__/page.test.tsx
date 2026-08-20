import { render, screen, act } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import SampleReportPage from "../page";

vi.mock("@/lib/content/pseo-data", () => ({
  getVideoForPlacement: vi.fn().mockResolvedValue(null),
}));

describe("SampleReportPage", () => {
  it("displays the synthetic audit packet framing", async () => {
    let container!: HTMLElement;
    await act(async () => {
      ({ container } = render(await SampleReportPage()));
    });
    expect(
      screen.getByRole("heading", { name: /sample cam audit packet/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/sample data only/i)).toBeInTheDocument();
    expect(
      screen.getByText("Demo exceptions routed for review"),
    ).toBeInTheDocument();
    expect(screen.getByText("Issue Type")).toBeInTheDocument();
    expect(screen.getByText("Review before sending")).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/Recoverable/);
    expect(container.textContent).not.toMatch(/Error Type/);
  });
});
