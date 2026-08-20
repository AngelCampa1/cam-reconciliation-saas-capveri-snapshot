/* ------------------------------------------------------------------ */
/*  Programmatic SEO data types for CapVeri marketing site             */
/*  Each type maps 1:1 to a JSON data file in marketing/data/          */
/* ------------------------------------------------------------------ */

// ── State Compliance Guides (/resources/states/[state]/cam-compliance) ──

export interface StateCaseLaw {
  name: string;
  citation: string;
  year: number;
  summary: string;
}

export interface StateComplianceData {
  slug: string;
  name: string;
  abbreviation: string;
  primaryStatute: string | null;
  reconciliationTiming: string | null;
  tenantAuditRights: string;
  requiredDisclosures: string;
  penalties: string | null;
  caseLaw: StateCaseLaw[];
  regulatoryBody: string;
  complianceComplexity: "high" | "medium" | "low";
  notes: string;
  keyTakeawayForLandlords: string;
  qualifiedTenantDefinition?: string;
  statuteEffectiveDate?: string;
  relatedResources?: string[];
  relatedTools?: string[];
}

// ── Metro Market CAM Guides (/resources/markets/[metro]/cam-guide) ──

export interface MetroVacancyRates {
  office: number | null;
  retail: number | null;
  industrial: number | null;
  source: string;
  asOf: string;
}

export interface MetroMarketData {
  slug: string;
  name: string;
  state: string;
  vacancyRates: MetroVacancyRates;
  avgCamPerSF: {
    office: number | null;
    retail: number | null;
    industrial: number | null;
  };
  taxAssessmentAuthority: string;
  taxProtestProcedure: string;
  propertyTaxRate: string;
  keySubmarkets: string[];
  localBomaChapter: string | null;
  marketSpecificIssues: string[];
  notes: string;
  relatedResources?: string[];
  relatedTools?: string[];
}

// ── Property Type CAM Guides (/resources/property-types/[type]/cam-guide) ──

export interface PropertyTypeData {
  slug: string;
  name: string;
  typicalCamPools: string[];
  standardExclusions: string[];
  commonLeaseStructures: string[];
  grossUpApplicability: string;
  benchmarkCamPerSF: { low: number; high: number; source: string };
  commonBillingErrors: string[];
  relevantBomaStandards: string[];
  notes: string;
  relatedResources?: string[];
  relatedTools?: string[];
}

// ── ERP/Software Config Guides (/resources/software/[product]/cam-setup) ──

export interface SoftwareConfigData {
  slug: string;
  name: string;
  vendor: string;
  camModuleName: string;
  moduleNavigation: string;
  recoveryPoolConfig: string;
  chargeCodeSetup: string;
  exportProcedure: string;
  commonMistakes: string[];
  capveriIntegration: string;
  notes: string;
  troubleshooting?: Array<{ q: string; a: string }>;
  relatedResources?: string[];
  relatedTools?: string[];
}

// ── BOMA Standard Deep Dives (/resources/boma/[topic]) ──

export interface BomaTopicData {
  slug: string;
  title: string;
  description: string;
  comparison2017vs2024: string;
  methodology: string;
  workedExample: string;
  commonErrors: string[];
  financialImpact: string;
  leaseImplications: string;
  notes: string;
  relatedResources?: string[];
  relatedTools?: string[];
}

// ── Lease Clause Interpretation (/resources/lease-clauses/[clause]) ──

export interface LeaseClauseVariation {
  label: string;
  language: string;
  interpretation: string;
}

export interface LeaseClauseData {
  slug: string;
  title: string;
  description: string;
  variations: LeaseClauseVariation[];
  calculationMethodology: string;
  draftingErrors: string[];
  relevantCases: StateCaseLaw[];
  billingSystemImplications: string;
  notes: string;
  relatedResources?: string[];
  relatedTools?: string[];
}

// ── CAM Expense Category Deep Dives (/resources/expenses/[category]) ──

export interface ExpenseCategoryData {
  slug: string;
  name: string;
  definition: string;
  typicalGlCodes: string[];
  recoverableComponents: string[];
  nonRecoverableComponents: string[];
  commonLeaseLanguage: string;
  allocationMethod: string;
  benchmarksPerSF: {
    office: number | null;
    retail: number | null;
    industrial: number | null;
    source: string;
  };
  commonBillingErrors: string[];
  yoyTrends: string;
  notes: string;
  relatedResources?: string[];
  relatedTools?: string[];
}

// ── Glossary Terms (/glossary/[term]) ──

export interface GlossaryTermData {
  slug: string;
  term: string;
  shortDefinition: string;
  definition: string;
  relatedTerms: string[];
  relatedResources: string[];
  category:
    | "core-concepts"
    | "lease-structures"
    | "calculations"
    | "compliance"
    | "property-management"
    | "financial-analysis";
}

// ── Role-Based CAM Guides (/resources/roles/[role]/cam-guide) ──

export interface RoleData {
  slug: string;
  name: string;
  metaTitle: string;
  metaDescription: string;
  headline: string;
  subheadline: string;
  painPoints: string[];
  typicalWorkflow: string;
  timeOnCam: string;
  commonErrors: string[];
  capveriValue: string;
  timeSavings: string;
  relatedTools: string[];
  relatedResources: string[];
}

// ── Workflow-Based CAM Guides (/resources/workflows/[workflow]) ──

export interface WorkflowStep {
  step: number;
  title: string;
  description: string;
  timeframe: string;
  commonErrors: string[];
}

export interface WorkflowData {
  slug: string;
  name: string;
  metaTitle: string;
  metaDescription: string;
  headline: string;
  subheadline: string;
  overview: string;
  steps: WorkflowStep[];
  timeline: string;
  capveriRole: string;
  relatedResources: string[];
  relatedTools: string[];
}

// ── Calendar/Seasonal CAM Guides (/resources/calendar/[slug]) ──

export interface CalendarKeyDate {
  date: string;
  description: string;
}

export interface CalendarEntryData {
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

// ── Competitor Comparisons (/vs/[slug]) ──

export interface ComparisonStrength {
  heading: string;
  paragraphs: string[];
  callout?: { icon: string; text: string };
}

export interface ComparisonPainPoints {
  heading: string;
  items: { title: string; description: string }[];
}

export interface ComparisonKnownLimitations {
  heading: string;
  intro: string;
  items: { title: string; description: string }[];
}

export interface ComparisonTableColumn {
  key: string;
  label: string;
}

export interface ComparisonData {
  slug: string;
  competitorName: string;
  competitorShortName: string;
  headline: string;
  winnerLabel: string;
  winnerSummary: string;
  bestForCapveri: string;
  bestForCompetitor: string;
  metaTitle: string;
  metaDescription: string;
  datePublished: string;
  dateModified: string;
  competitorDefinition: string;
  capveriDefinition: string;
  introParagraphs: string[];
  strengths: ComparisonStrength;
  painPoints: ComparisonPainPoints;
  knownLimitations?: ComparisonKnownLimitations;
  comparisonTable: {
    columns: ComparisonTableColumn[];
    rows: Record<string, string>[];
  };
  antiIntegration: { heading: string; paragraphs: string[] };
  migration?: { heading: string; paragraphs: string[] };
  faqs: { question: string; answer: string }[];
  relatedComparisons: { slug: string; title: string; description: string }[];
  relatedResources: { href: string; title: string }[];
  ctaHeading: string;
  ctaDescription: string;
}

// ── CAM Calculation Guides (/resources/calculations/[scenario]) ──

export interface CamCalculationVariable {
  name: string;
  symbol: string;
  definition: string;
  example: string;
}

export interface CamCalculationStep {
  step: number;
  title: string;
  description: string;
  formula?: string;
  example: string;
}

export interface CamCalculationData {
  slug: string;
  name: string;
  metaTitle: string;
  metaDescription: string;
  headline: string;
  subheadline: string;
  overview: string;
  formula: string;
  variables: CamCalculationVariable[];
  steps: CamCalculationStep[];
  workedExample: {
    scenario: string;
    inputs: Record<string, string>;
    calculation: string;
    result: string;
  };
  commonMistakes: string[];
  whenToUse: string[];
  relatedCalculations: string[];
  relatedResources: string[];
  relatedTools: string[];
}

// ── Lease Type CAM Guides (/resources/lease-types/[type]/cam-guide) ──

export interface LeaseTypeFormulaBlock {
  label: string;
  formula: string;
  variables: Record<string, string>;
}

export interface LeaseTypeData {
  slug: string;
  name: string;
  abbreviation: string;
  metaTitle: string;
  metaDescription: string;
  headline: string;
  subheadline: string;
  /** One-sentence definition - copy-pasteable into an SOP */
  definition: string;
  whoBearsExpenses: string;
  camIncluded: boolean;
  camNotes: string;
  reconciliationRequired: boolean;
  grossUpApplicable: boolean;
  capApplicable: boolean;
  commonFor: string[];
  landlordRisks: string[];
  commonMistakes: string[];
  formulaBlocks: LeaseTypeFormulaBlock[];
  workedExample: string;
  faqs: { question: string; answer: string }[];
  relatedTools: string[];
  relatedResources: string[];
  lastUpdated: string;
}

// ── CAM Templates (/resources/templates/[slug]) ──

export interface TemplateData {
  slug: string;
  name: string;
  headline: string;
  metaTitle: string;
  metaDescription: string;
  description: string;
  format: "Excel" | "PDF" | "Word" | "Online";
  sections: string[];
  useCase: string;
  keyFeatures: string[];
  faqs: { q: string; a: string }[];
  relatedTools: string[];
  relatedResources: string[];
  lastUpdated: string;
}

// ── CAM Dispute Guides (/resources/cam-dispute/[type]) ──

export interface CamDisputeStep {
  step: number;
  title: string;
  description: string;
  warnings?: string[];
  tips?: string[];
}

export interface CamDisputeData {
  slug: string;
  name: string;
  metaTitle: string;
  metaDescription: string;
  headline: string;
  subheadline: string;
  overview: string;
  audience: "tenant" | "landlord" | "both";
  whenToUse: string[];
  steps: CamDisputeStep[];
  templateContent?: string;
  commonMistakes: string[];
  faqs: { question: string; answer: string }[];
  relatedResources: string[];
  relatedTools: string[];
}

// -- Competitor Alternative Pages (/alternatives/[slug]) --

export interface AlternativeOption {
  name: string;
  description: string;
  pros: string[];
  cons: string[];
  bestFor: string;
  pricing: string;
}

export interface AlternativeData {
  slug: string;
  competitorName: string;
  metaTitle: string;
  metaDescription: string;
  headline: string;
  subheadline: string;
  datePublished: string;
  dateModified: string;
  introParagraphs: string[];
  whySwitch: { title: string; description: string }[];
  alternatives: AlternativeOption[];
  comparisonTable: {
    columns: { key: string; label: string }[];
    rows: Record<string, string>[];
  };
  capveriPitch: { heading: string; paragraphs: string[] };
  faqs: { question: string; answer: string }[];
  relatedComparisons: { slug: string; title: string }[];
  relatedResources: { href: string; title: string }[];
  ctaHeading: string;
  ctaDescription: string;
}

// -- Solution / Use-Case Pages (/solutions/[slug]) --

export interface SolutionData {
  slug: string;
  name: string;
  metaTitle: string;
  metaDescription: string;
  headline: string;
  subheadline: string;
  datePublished: string;
  dateModified: string;
  problem: { heading: string; paragraphs: string[] };
  solution: { heading: string; paragraphs: string[] };
  features: { icon: string; title: string; description: string }[];
  metrics: { value: string; label: string }[];
  howItWorks: { step: number; title: string; description: string }[];
  faqs: { question: string; answer: string }[];
  relatedSolutions: { slug: string; title: string }[];
  relatedResources: { href: string; title: string }[];
  relatedTools: string[];
  ctaHeading: string;
  ctaDescription: string;
}

// -- Integration Partner Pages (/integrations/[slug]) --

export interface IntegrationStep {
  step: number;
  title: string;
  description: string;
}

export interface IntegrationData {
  slug: string;
  softwareName: string;
  metaTitle: string;
  metaDescription: string;
  headline: string;
  subheadline: string;
  datePublished: string;
  dateModified: string;
  introParagraphs: string[];
  exportSteps: IntegrationStep[];
  whatCapVeriFinds: { title: string; description: string }[];
  timeSavings: { before: string; after: string; metric: string };
  faqs: { question: string; answer: string }[];
  relatedIntegrations: { slug: string; title: string }[];
  relatedResources: { href: string; title: string }[];
  ctaHeading: string;
  ctaDescription: string;
}

// -- Migration/Switch Guides (/switch/[slug]) --

export interface SwitchStep {
  step: number;
  title: string;
  description: string;
  timeEstimate: string;
}

export interface SwitchData {
  slug: string;
  fromName: string;
  metaTitle: string;
  metaDescription: string;
  headline: string;
  subheadline: string;
  datePublished: string;
  dateModified: string;
  introParagraphs: string[];
  whySwitch: { title: string; description: string }[];
  migrationSteps: SwitchStep[];
  totalTime: string;
  whatChanges: string[];
  whatStays: string[];
  faqs: { question: string; answer: string }[];
  relatedResources: { href: string; title: string }[];
  ctaHeading: string;
  ctaDescription: string;
}

export interface PersonaData {
  slug: string;
  name: string;
  role: string;
  metaTitle: string;
  metaDescription: string;
  headline: string;
  subheadline: string;
  datePublished: string;
  dateModified: string;
  problem: { heading: string; paragraphs: string[] };
  solution: { heading: string; paragraphs: string[] };
  features: { icon: string; title: string; description: string }[];
  metrics: { value: string; label: string }[];
  howItWorks: { step: number; title: string; description: string }[];
  faqs: { question: string; answer: string }[];
  relatedPersonas: { slug: string; title: string }[];
  relatedResources: { href: string; title: string }[];
  relatedTools: string[];
  ctaHeading: string;
  ctaDescription: string;
}

/**
 * Shape of each entry in marketing/data/videos.json. Keep this in sync with that
 * file and with the generated frontend type in frontend/src/generated/videos.ts
 * (emitted by scripts/generate-videos.mjs). If videos.json gains a field, update
 * all three.
 */
export interface VideoData {
  slug: string;
  youtubeId: string;
  title: string;
  shortLabel: string;
  description: string;
  stage: string;
  durationSeconds: number;
  uploadDate: string;
  thumbnailUrl: string;
  placements: string[];
}
