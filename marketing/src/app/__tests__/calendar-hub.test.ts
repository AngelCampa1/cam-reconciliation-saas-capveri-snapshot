import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

interface CalendarKeyDate {
  date: string;
  description: string;
}

interface CalendarEntry {
  slug: string;
  name: string;
  metaTitle: string;
  metaDescription: string;
  headline: string;
  subheadline: string;
  overview: string;
  keyDates: CalendarKeyDate[];
  checklist: string[];
  commonMistakes: string[];
  capveriRole: string;
  relatedResources: string[];
  relatedTools: string[];
  lastUpdated: string;
}

interface CalendarFile {
  lastUpdated: string;
  entries: CalendarEntry[];
}

function loadCalendarData(): CalendarFile {
  const filePath = join(process.cwd(), "data", "calendar.json");
  return JSON.parse(readFileSync(filePath, "utf-8")) as CalendarFile;
}

describe("calendar.json data validation", () => {
  it("loads and parses correctly", () => {
    expect(() => loadCalendarData()).not.toThrow();
  });

  it("has lastUpdated field", () => {
    const data = loadCalendarData();
    expect(data.lastUpdated).toBeTruthy();
    expect(new Date(data.lastUpdated).toString()).not.toBe("Invalid Date");
  });

  it("has at least 5 entries", () => {
    const data = loadCalendarData();
    expect(data.entries.length).toBeGreaterThanOrEqual(5);
  });

  it("no duplicate slugs", () => {
    const data = loadCalendarData();
    const slugs = data.entries.map((e) => e.slug);
    const unique = new Set(slugs);
    expect(unique.size).toBe(slugs.length);
  });

  it("all entries have required fields", () => {
    const data = loadCalendarData();
    const requiredFields: (keyof CalendarEntry)[] = [
      "slug",
      "name",
      "metaTitle",
      "metaDescription",
      "headline",
      "subheadline",
      "overview",
      "capveriRole",
      "lastUpdated",
    ];
    for (const entry of data.entries) {
      for (const field of requiredFields) {
        expect(
          typeof entry[field] === "string" &&
            (entry[field] as string).length > 0,
          `Field "${field}" is empty or missing for slug "${entry.slug}"`,
        ).toBe(true);
      }
    }
  });

  it("metaTitle <= 80 characters", () => {
    const data = loadCalendarData();
    for (const entry of data.entries) {
      expect(
        entry.metaTitle.length,
        `metaTitle too long for slug "${entry.slug}": ${entry.metaTitle.length} chars - "${entry.metaTitle}"`,
      ).toBeLessThanOrEqual(80);
    }
  });

  it("metaDescription <= 165 characters", () => {
    const data = loadCalendarData();
    for (const entry of data.entries) {
      expect(
        entry.metaDescription.length,
        `metaDescription too long for slug "${entry.slug}": ${entry.metaDescription.length} chars`,
      ).toBeLessThanOrEqual(165);
    }
  });

  it("keyDates has at least 1 item", () => {
    const data = loadCalendarData();
    for (const entry of data.entries) {
      expect(
        entry.keyDates.length,
        `keyDates is empty for slug "${entry.slug}"`,
      ).toBeGreaterThanOrEqual(1);
    }
  });

  it("checklist has at least 3 items", () => {
    const data = loadCalendarData();
    for (const entry of data.entries) {
      expect(
        entry.checklist.length,
        `checklist has fewer than 3 items for slug "${entry.slug}"`,
      ).toBeGreaterThanOrEqual(3);
    }
  });

  it("keyDates entries have date and description fields", () => {
    const data = loadCalendarData();
    for (const entry of data.entries) {
      for (const kd of entry.keyDates) {
        expect(
          kd.date.length > 0,
          `keyDate missing date in slug "${entry.slug}"`,
        ).toBe(true);
        expect(
          kd.description.length > 0,
          `keyDate missing description in slug "${entry.slug}"`,
        ).toBe(true);
      }
    }
  });

  it("relatedTools are valid /tools/ paths", () => {
    const data = loadCalendarData();
    for (const entry of data.entries) {
      for (const tool of entry.relatedTools) {
        expect(
          tool.startsWith("/tools/"),
          `Invalid tool path "${tool}" for slug "${entry.slug}"`,
        ).toBe(true);
      }
    }
  });

  it("relatedResources are valid internal paths", () => {
    const data = loadCalendarData();
    for (const entry of data.entries) {
      for (const resource of entry.relatedResources) {
        expect(
          resource.startsWith("/"),
          `Invalid resource path "${resource}" for slug "${entry.slug}"`,
        ).toBe(true);
      }
    }
  });

  it("commonMistakes has at least 1 item per entry", () => {
    const data = loadCalendarData();
    for (const entry of data.entries) {
      expect(
        entry.commonMistakes.length,
        `commonMistakes is empty for slug "${entry.slug}"`,
      ).toBeGreaterThanOrEqual(1);
    }
  });
});
