import { describe, expect, it } from "vitest";

import {
  getAllVideos,
  getVideo,
  getVideoForPlacement,
  getVideosForPlacement,
} from "../pseo-data";

describe("video data helpers", () => {
  it("loads all six videos from videos.json", async () => {
    const videos = await getAllVideos();
    expect(videos.length).toBeGreaterThanOrEqual(6);
  });

  it("every declared placement resolves back to its own video", async () => {
    const videos = await getAllVideos();
    expect(videos.length).toBeGreaterThan(0);

    for (const video of videos) {
      expect(video.placements.length).toBeGreaterThan(0);
      for (const placement of video.placements) {
        const matches = await getVideosForPlacement(placement);
        const slugs = matches.map((v) => v.slug);
        // The placement must resolve to at least this video. A typo'd
        // placement key in videos.json would otherwise render nothing on the
        // page with no error. This guard fails fast instead.
        expect(slugs).toContain(video.slug);
      }
    }
  });

  it("getVideoForPlacement returns the first matching video", async () => {
    const videos = await getAllVideos();
    const placement = videos[0].placements[0];
    const result = await getVideoForPlacement(placement);
    expect(result).not.toBeNull();
    expect(result?.placements).toContain(placement);
  });

  it("returns empty/null for unknown slugs and placements", async () => {
    expect(await getVideo("does-not-exist")).toBeNull();
    expect(await getVideoForPlacement("no-such-placement")).toBeNull();
    expect(await getVideosForPlacement("no-such-placement")).toEqual([]);
  });
});
