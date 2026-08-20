import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import ResourcesHub from "../page";
import type { ResourceFrontmatter } from "@/lib/content/types";

vi.mock("@/lib/content/mdx", () => ({
  getAllPosts: vi.fn(),
}));

import { getAllPosts } from "@/lib/content/mdx";

const SAMPLE_RESOURCES: Array<{
  slug: string;
  frontmatter: ResourceFrontmatter;
}> = [
  {
    slug: "deterministic-vs-ai-cam",
    frontmatter: {
      title: "Deterministic vs AI CAM Reconciliation",
      description:
        "Why deterministic calculation, not AI, is the only defensible approach for CAM math.",
      buttonText: "Compare the Approaches",
      order: 10,
      datePublished: "2026-01-15",
      dateModified: "2026-02-24",
      author: "Angel Campa",
    },
  },
  {
    slug: "what-is-cam-reconciliation",
    frontmatter: {
      title: "What Is CAM Reconciliation?",
      description: "The definitive guide to CAM reconciliation.",
      buttonText: "Read the Guide",
      order: 1,
      datePublished: "2026-01-08",
      dateModified: "2026-01-08",
      author: "Angel Campa",
    },
  },
];

describe("Resources hub page", () => {
  beforeEach(() => {
    vi.mocked(getAllPosts).mockResolvedValue(SAMPLE_RESOURCES as never);
  });

  it("renders the focused operator-first hub", async () => {
    const jsx = await ResourcesHub();
    render(jsx);
    expect(
      screen.getByText("Fewer pages. Better reconciliation guidance."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Start with the cluster you need"),
    ).toBeInTheDocument();
  });
});
