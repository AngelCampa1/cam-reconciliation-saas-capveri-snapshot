export interface KnowledgeSource {
  id: string;
  title: string;
  owner: "product" | "marketing" | "app" | "compliance";
  publicSafe: boolean;
  notes?: string;
}

export interface ProductFact {
  id: string;
  title: string;
  summary: string;
  details: string[];
  sourceIds: string[];
  tags: string[];
}

export interface CompanyProfile {
  name: string;
  legalName: string;
  siteUrl: string;
  appUrl: string;
  apiUrl: string;
  foundingDate: string;
  description: string;
  publicDescription: string;
  logoPath: string;
  sameAs: string[];
}

export interface PublicContact {
  id: string;
  label: string;
  email: string;
  mailto: string;
  useCases: string[];
  escalationBoundary: string;
}

export interface PublicCta {
  id: string;
  label: string;
  href: string;
  intent: string;
}

export interface PublicClaim {
  id: string;
  category:
    | "security"
    | "ai"
    | "compliance"
    | "workflow"
    | "roi"
    | "erp"
    | "pricing"
    | "support"
    | "trial"
    | "boma";
  wording: string;
  sourceIds: string[];
  tags: string[];
}

export interface PublicMessaging {
  landingHero: {
    eyebrow: string;
    headline: string;
    subhead: string;
  };
  valueProps: string[];
  stats: Array<{ label: string; value: string; context: string }>;
  workflowSteps: Array<{ title: string; body: string }>;
  trustIndicators: string[];
  auth: {
    trialCopy: string;
    trustCopy: string;
  };
  onboarding: {
    trialCta: string;
    paywallCopy: string;
  };
  inquiryTypes: Array<{ id: string; label: string; contactId: string }>;
  feedbackTaxonomy: Array<{ id: string; label: string; contactId: string }>;
}

export interface ResourceFact {
  id: string;
  title: string;
  description: string;
  datePublished?: string;
  dateModified?: string;
  faqIds?: string[];
  ctaId?: string;
  claimIds?: string[];
}

export interface MarketingFaq {
  id: string;
  question: string;
  answer: string;
  tags: string[];
  sourceIds: string[];
}

export interface MarketingFaqCategory {
  id: string;
  title: string;
  description: string;
  questions: MarketingFaq[];
}

export interface AppHelpStep {
  title: string;
  body: string;
}

export interface AppHelpTopic {
  id: string;
  title: string;
  summary: string;
  category: string;
  steps: AppHelpStep[];
  href?: string;
  ctaLabel?: string;
  keywords: string[];
  routes?: string[];
  terms?: string[];
  audiences?: Array<"landlord" | "tenant" | "admin">;
  relatedTopicIds?: string[];
  primaryAction?: string;
  difficulty?: "beginner" | "intermediate" | "advanced";
}

export interface AppHelpGuide {
  id: string;
  title: string;
  description: string;
  topicIds: string[];
}

export interface AppHelpFaq {
  id: string;
  question: string;
  answer: string;
  topicId?: string;
}

export interface GlossaryTerm {
  id: string;
  term: string;
  plainDefinition: string;
  domainDefinition: string;
  example: string;
  relatedTopicIds: string[];
}

export interface FieldHelp {
  fieldId: string;
  label: string;
  shortHelp: string;
  longHelpTopicId?: string;
  examples?: string[];
}

export interface RouteHelp {
  routePattern: string;
  topicIds: string[];
}

export interface CompetitorPositioning {
  id: string;
  name: string;
  category: string;
  positioning: string;
  safeComparison: string;
  objectionResponse: string;
  sourceIds: string[];
}

export interface ContactEscalation {
  id: string;
  label: string;
  email: string;
  useFor: string[];
  boundary: string;
}

export interface AssistantGuardrail {
  id: string;
  rule: string;
  allowed: string[];
  disallowed: string[];
}

export interface TierAudience {
  who: string;
  portfolio: string;
  primaryJobs: string[];
}

export interface ProductFeatureFact {
  key: string;
  name: string;
  description: string;
  domain: string; // matches FeatureDomainFact.id
  tier: string; // canonical tier id
}

export interface FeatureDomainFact {
  id: string;
  label: string;
  summary: string;
}
