import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { VideoEmbed } from "@/components/VideoEmbed";

const PROPS = {
  youtubeId: "abc123",
  title: "CAM Reconciliation Demo: Upload a Yardi CSV and Catch the Errors",
  thumbnailUrl: "https://i.ytimg.com/vi/abc123/hqdefault.jpg",
};

describe("VideoEmbed", () => {
  it("renders thumbnail image and play button before click", () => {
    render(<VideoEmbed {...PROPS} />);

    const btn = screen.getByRole("button", {
      name: `Play video: ${PROPS.title}`,
    });
    expect(btn).toBeDefined();

    // iframe must NOT be present yet
    expect(screen.queryByTitle(PROPS.title)).toBeNull();
  });

  it("swaps in iframe with nocookie src after clicking play", () => {
    render(<VideoEmbed {...PROPS} />);

    const btn = screen.getByRole("button", {
      name: `Play video: ${PROPS.title}`,
    });
    fireEvent.click(btn);

    const iframe = screen.getByTitle(PROPS.title);
    expect(iframe).toBeDefined();
    expect((iframe as HTMLIFrameElement).src).toContain(
      `youtube-nocookie.com/embed/${PROPS.youtubeId}`,
    );
    expect((iframe as HTMLIFrameElement).src).toContain("autoplay=1");
  });

  it("button is no longer rendered after clicking play", () => {
    render(<VideoEmbed {...PROPS} />);

    fireEvent.click(
      screen.getByRole("button", { name: `Play video: ${PROPS.title}` }),
    );

    expect(
      screen.queryByRole("button", { name: `Play video: ${PROPS.title}` }),
    ).toBeNull();
  });
});
