import { publicKnowledge } from "@/generated/public-knowledge";

export interface FAQ {
  question: string;
  answer: string;
}

export const LANDING_FAQS: FAQ[] = publicKnowledge.marketing.landingFaqs.map(
  (faq) => ({
    question: faq.question,
    answer: faq.answer,
  }),
);
