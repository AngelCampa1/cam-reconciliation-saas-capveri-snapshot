import { publicKnowledge } from "@/generated/public-knowledge";

export const PRICING_FAQS = [
  ...publicKnowledge.pricing.pricingFaqs.map((faq) => ({
    question: faq.question,
    answer: faq.answer,
  })),
];
