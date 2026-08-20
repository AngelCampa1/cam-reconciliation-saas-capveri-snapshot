import governance from "../../../data/seo/indexed-page-governance.json";
import type { FunnelStage } from "@/lib/content/types";

export interface IndexedPriorityPage {
  path: string;
  funnelStage: FunnelStage;
  primaryIntent: string;
  canonicalTopic: string;
  primaryCTA: string;
  nextStepHref: string;
  citationReady: boolean;
  author: string;
  reviewer: string;
  updated: string;
  sourcesSection: string;
  parentInternalLinks: string[];
  childInternalLinks: string[];
}

export const PROMOTED_INDEX_PATHS = governance.promotedPaths as string[];

export const PRIORITY_INDEXED_PAGES =
  governance.priorityPages as IndexedPriorityPage[];
