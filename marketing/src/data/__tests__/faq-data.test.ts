import { describe, it, expect } from "vitest";
import { FAQ_CATEGORIES, getAllFAQs, getFAQCount } from "../faq-data";

const EXPECTED_CATEGORIES = [
  "getting-started",
  "cam-reconciliation-basics",
  "financial-calculations",
  "working-with-erp",
  "pricing-roi",
  "compliance-legal",
  "ai-lease-extraction",
  "tenant-portal-disputes",
  "security-privacy",
  "switching-migration",
];

describe("FAQ_CATEGORIES", () => {
  it("has all 10 expected categories", () => {
    const ids = FAQ_CATEGORIES.map((c) => c.id);
    for (const expected of EXPECTED_CATEGORIES) {
      expect(ids).toContain(expected);
    }
    expect(FAQ_CATEGORIES).toHaveLength(10);
  });

  it("every category has at least 3 questions", () => {
    for (const category of FAQ_CATEGORIES) {
      expect(
        category.questions.length,
        `${category.id} has fewer than 3 questions`,
      ).toBeGreaterThanOrEqual(3);
    }
  });

  it("every category has a non-empty title and description", () => {
    for (const category of FAQ_CATEGORIES) {
      expect(category.title.length).toBeGreaterThan(0);
      expect(category.description.length).toBeGreaterThan(0);
    }
  });

  it("every FAQ has a non-empty id, question, and answerPlainText", () => {
    for (const category of FAQ_CATEGORIES) {
      for (const q of category.questions) {
        expect(q.id.length, `empty id in ${category.id}`).toBeGreaterThan(0);
        expect(q.question.length, `empty question: ${q.id}`).toBeGreaterThan(0);
        expect(
          q.answerPlainText.length,
          `empty answerPlainText: ${q.id}`,
        ).toBeGreaterThan(0);
      }
    }
  });

  it("every FAQ has a JSX answer (not null/undefined)", () => {
    for (const category of FAQ_CATEGORIES) {
      for (const q of category.questions) {
        expect(q.answer, `null answer for ${q.id}`).not.toBeNull();
        expect(q.answer, `undefined answer for ${q.id}`).not.toBeUndefined();
      }
    }
  });

  it("has no duplicate FAQ ids across all categories", () => {
    const allIds = FAQ_CATEGORIES.flatMap((c) => c.questions.map((q) => q.id));
    const unique = new Set(allIds);
    expect(unique.size).toBe(allIds.length);
  });

  it("has no duplicate category ids", () => {
    const ids = FAQ_CATEGORIES.map((c) => c.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it("all ids are valid URL slugs (lowercase, hyphens, no spaces)", () => {
    const slugPattern = /^[a-z0-9]+(-[a-z0-9]+)*$/;
    for (const category of FAQ_CATEGORIES) {
      expect(category.id).toMatch(slugPattern);
      for (const q of category.questions) {
        expect(q.id, `invalid slug: ${q.id}`).toMatch(slugPattern);
      }
    }
  });
});

describe("getAllFAQs", () => {
  it("returns at least 60 items", () => {
    expect(getAllFAQs().length).toBeGreaterThanOrEqual(60);
  });

  it("returns plain objects with question and answer strings", () => {
    const faqs = getAllFAQs();
    for (const faq of faqs) {
      expect(typeof faq.question).toBe("string");
      expect(typeof faq.answer).toBe("string");
      expect(faq.question.length).toBeGreaterThan(0);
      expect(faq.answer.length).toBeGreaterThan(0);
    }
  });
});

describe("getFAQCount", () => {
  it("matches the actual total count of questions", () => {
    const actual = FAQ_CATEGORIES.reduce(
      (sum, c) => sum + c.questions.length,
      0,
    );
    expect(getFAQCount()).toBe(actual);
  });

  it("matches getAllFAQs length", () => {
    expect(getFAQCount()).toBe(getAllFAQs().length);
  });
});
