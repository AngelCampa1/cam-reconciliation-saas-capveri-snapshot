import type { FAQCategory } from "./faq-types";
import { publicKnowledge } from "@/generated/public-knowledge";

export const FAQ_CATEGORIES: FAQCategory[] =
  publicKnowledge.marketing.faqCategories.map((category) => ({
    ...category,
    questions: category.questions.map((question) => ({
      id: question.id,
      question: question.question,
      answer: <>{question.answer}</>,
      answerPlainText: question.answer,
    })),
  }));

/**
 * Returns a flat array of all FAQs with plain text answers
 * for schema.org FAQPage structured data.
 */
export function getAllFAQs(): Array<{
  question: string;
  answer: string;
}> {
  return FAQ_CATEGORIES.flatMap((category) =>
    category.questions.map((q) => ({
      question: q.question,
      answer: q.answerPlainText,
    })),
  );
}

/**
 * Returns the total number of FAQs across all categories.
 */
export function getFAQCount(): number {
  return FAQ_CATEGORIES.reduce(
    (sum, category) => sum + category.questions.length,
    0,
  );
}
