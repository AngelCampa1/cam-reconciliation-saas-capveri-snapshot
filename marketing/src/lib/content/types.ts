export type FunnelStage = "tofu" | "mofu" | "bofu";

export type ContentAudience = "tenant" | "landlord" | "mixed";

export type ContentTag =
  | "gross-up"
  | "cap-math"
  | "yardi"
  | "mri"
  | "boma-2024"
  | "compliance"
  | "tenant-audit"
  | "texas"
  | "california"
  | "pro-rata"
  | "lease-renewal"
  | "base-year"
  | "management-fee"
  | "gl-export"
  | "occupancy"
  | "vacancy"
  | "realpage"
  | "appfolio"
  | "industrial"
  | "retail";

export interface ResourceFrontmatter {
  title: string;
  description: string;
  datePublished: string;
  dateModified: string;
  author: string;
  buttonText: string;
  order: number;
  funnelStage?: FunnelStage;
  audience?: ContentAudience;
  tags?: ContentTag[];
  faq?: Array<{ q: string; a: string }>;
}

export type BlogCategory =
  | "cam-errors"
  | "compliance"
  | "cre-finops"
  | "how-to"
  | "operations"
  | "market-trends"
  | "technology";

export interface BlogFrontmatter {
  title: string;
  description: string;
  excerpt: string;
  datePublished: string;
  dateModified: string;
  author: string;
  authorRole: string;
  category?: BlogCategory;
  funnelStage?: FunnelStage;
  audience?: ContentAudience;
  tags?: ContentTag[];
  faq?: Array<{ q: string; a: string }>;
}

export type ContentCollection = "blog" | "resources";
