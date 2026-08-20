import type { MDXComponents } from "mdx/types";
import { Alert } from "./Alert";
import { Steps, Step } from "./Steps";
import { Table } from "./Table";
import { TwoColumnCard } from "./TwoColumnCard";
import { InfoCardGrid } from "./InfoCardGrid";
import { FAQSection } from "./FAQSection";
import { CTABox } from "./CTABox";
import { StatGrid } from "./StatGrid";
import { VideoEmbed } from "@/components/VideoEmbed";

export { Alert } from "./Alert";
export { Steps, Step } from "./Steps";
export { Table } from "./Table";
export { TwoColumnCard } from "./TwoColumnCard";
export { InfoCardGrid } from "./InfoCardGrid";
export { FAQSection } from "./FAQSection";
export { CTABox } from "./CTABox";
export { StatGrid } from "./StatGrid";
export { VideoEmbed } from "@/components/VideoEmbed";

export const MDX_COMPONENTS: MDXComponents = {
  Alert,
  Steps,
  Step,
  table: Table,
  TwoColumnCard,
  InfoCardGrid,
  FAQSection,
  CTABox,
  StatGrid,
  VideoEmbed,
};
