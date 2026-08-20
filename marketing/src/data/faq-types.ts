import type { ReactNode } from "react";

export interface FAQItem {
  /** URL-safe slug used as anchor and key */
  id: string;
  question: string;
  /** Rich JSX answer for rendering */
  answer: ReactNode;
  /** Plain text answer for search filtering and schema.org structured data */
  answerPlainText: string;
}

export interface FAQCategory {
  /** URL-safe slug used as section anchor */
  id: string;
  title: string;
  description: string;
  questions: FAQItem[];
}
