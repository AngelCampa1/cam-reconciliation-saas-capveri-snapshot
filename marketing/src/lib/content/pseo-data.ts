import fs from "fs/promises";
import path from "path";
import { publicKnowledge } from "@/generated/public-knowledge";
import type {
  StateComplianceData,
  MetroMarketData,
  PropertyTypeData,
  SoftwareConfigData,
  BomaTopicData,
  LeaseClauseData,
  ExpenseCategoryData,
  GlossaryTermData,
  ComparisonData,
  RoleData,
  WorkflowData,
  CalendarEntryData,
  CamCalculationData,
  CamDisputeData,
  LeaseTypeData,
  TemplateData,
  AlternativeData,
  SolutionData,
  PersonaData,
  IntegrationData,
  SwitchData,
  VideoData,
} from "./pseo-types";

const DATA_DIR = path.join(process.cwd(), "data");

const CONTENT_TOKENS: Record<string, string> = {
  "{{pricing.selfServeSummary}}":
    publicKnowledge.pricing.display.selfServeSummary,
  "{{pricing.annualSummary}}": publicKnowledge.pricing.display.annualSummary,
  "{{pricing.trialCopy}}": publicKnowledge.pricing.display.trialCopy,
  "{{pricing.trialLabel}}": publicKnowledge.pricing.display.trialLabel,
  "{{pricing.launchOfferTerms}}":
    publicKnowledge.pricing.display.launchOfferTerms,
};

function resolveContentTokens<T>(value: T): T {
  if (typeof value === "string") {
    let resolved: string = value;
    for (const [token, replacement] of Object.entries(CONTENT_TOKENS)) {
      resolved = resolved.replaceAll(token, replacement);
    }
    return resolved as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => resolveContentTokens(item)) as T;
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        resolveContentTokens(item),
      ]),
    ) as T;
  }

  return value;
}

async function loadJsonData<T>(filename: string): Promise<T> {
  const filePath = path.join(DATA_DIR, filename);
  const raw = await fs.readFile(filePath, "utf8");
  return resolveContentTokens(JSON.parse(raw) as T);
}

export async function getDataFileLastUpdated(
  filename: string,
): Promise<string> {
  try {
    const data = await loadJsonData<{ lastUpdated?: string }>(filename);
    return data?.lastUpdated ?? new Date().toISOString().split("T")[0];
  } catch {
    return new Date().toISOString().split("T")[0];
  }
}

// ── State Compliance ──

interface StatesFile {
  lastUpdated: string;
  states: StateComplianceData[];
}

export async function getAllStates(): Promise<StateComplianceData[]> {
  try {
    const data = await loadJsonData<StatesFile>("states.json");
    return data.states;
  } catch {
    return [];
  }
}

export async function getState(
  slug: string,
): Promise<StateComplianceData | null> {
  const states = await getAllStates();
  return states.find((s) => s.slug === slug) ?? null;
}

// ── Metro Markets ──

interface MetrosFile {
  lastUpdated: string;
  metros: MetroMarketData[];
}

export async function getAllMetros(): Promise<MetroMarketData[]> {
  try {
    const data = await loadJsonData<MetrosFile>("metros.json");
    return data.metros;
  } catch {
    return [];
  }
}

export async function getMetro(slug: string): Promise<MetroMarketData | null> {
  const metros = await getAllMetros();
  return metros.find((m) => m.slug === slug) ?? null;
}

// ── Property Types ──

interface PropertyTypesFile {
  lastUpdated: string;
  propertyTypes: PropertyTypeData[];
}

export async function getAllPropertyTypes(): Promise<PropertyTypeData[]> {
  try {
    const data = await loadJsonData<PropertyTypesFile>("property-types.json");
    return data.propertyTypes;
  } catch {
    return [];
  }
}

export async function getPropertyType(
  slug: string,
): Promise<PropertyTypeData | null> {
  const types = await getAllPropertyTypes();
  return types.find((t) => t.slug === slug) ?? null;
}

// ── Software Config ──

interface SoftwareFile {
  lastUpdated: string;
  software: SoftwareConfigData[];
}

export async function getAllSoftware(): Promise<SoftwareConfigData[]> {
  try {
    const data = await loadJsonData<SoftwareFile>("software.json");
    return data.software;
  } catch {
    return [];
  }
}

export async function getSoftware(
  slug: string,
): Promise<SoftwareConfigData | null> {
  const software = await getAllSoftware();
  return software.find((s) => s.slug === slug) ?? null;
}

// ── BOMA Topics ──

interface BomaFile {
  lastUpdated: string;
  topics: BomaTopicData[];
}

export async function getAllBomaTopics(): Promise<BomaTopicData[]> {
  try {
    const data = await loadJsonData<BomaFile>("boma-topics.json");
    return data.topics;
  } catch {
    return [];
  }
}

export async function getBomaTopic(
  slug: string,
): Promise<BomaTopicData | null> {
  const topics = await getAllBomaTopics();
  return topics.find((t) => t.slug === slug) ?? null;
}

// ── Lease Clauses ──

interface LeaseClausesFile {
  lastUpdated: string;
  clauses: LeaseClauseData[];
}

export async function getAllLeaseClauses(): Promise<LeaseClauseData[]> {
  try {
    const data = await loadJsonData<LeaseClausesFile>("lease-clauses.json");
    return data.clauses;
  } catch {
    return [];
  }
}

export async function getLeaseClause(
  slug: string,
): Promise<LeaseClauseData | null> {
  const clauses = await getAllLeaseClauses();
  return clauses.find((c) => c.slug === slug) ?? null;
}

// ── Expense Categories ──

interface ExpensesFile {
  lastUpdated: string;
  categories: ExpenseCategoryData[];
}

export async function getAllExpenseCategories(): Promise<
  ExpenseCategoryData[]
> {
  try {
    const data = await loadJsonData<ExpensesFile>("expenses.json");
    return data.categories;
  } catch {
    return [];
  }
}

export async function getExpenseCategory(
  slug: string,
): Promise<ExpenseCategoryData | null> {
  const categories = await getAllExpenseCategories();
  return categories.find((c) => c.slug === slug) ?? null;
}

// ── Glossary Terms ──

interface GlossaryFile {
  lastUpdated: string;
  terms: GlossaryTermData[];
}

export async function getAllGlossaryTerms(): Promise<GlossaryTermData[]> {
  try {
    const data = await loadJsonData<GlossaryFile>("glossary-terms.json");
    return data.terms;
  } catch {
    return [];
  }
}

export async function getGlossaryTerm(
  slug: string,
): Promise<GlossaryTermData | null> {
  const terms = await getAllGlossaryTerms();
  return terms.find((t) => t.slug === slug) ?? null;
}

// ── REIT Benchmarks (research/reit-benchmarks.json) ──

interface ReitBenchmarkData {
  medianOpexPerSF: number | null;
  opexRangePerSF: {
    low?: number;
    high?: number;
    openAir?: { low: number; high: number };
    groceryAnchored?: { low: number; high: number };
    enclosedMall?: { low: number; high: number };
    mixedUse?: { low: number; high: number };
    note?: string;
  };
  averageOccupancy2025: number;
  typicalRecoveryRatio: string;
  typicalRecoveryRatioNote: string;
}

interface ReitBenchmarksFile {
  lastUpdated: string;
  industryBenchmarks: {
    office: ReitBenchmarkData;
    retail: ReitBenchmarkData;
    industrial: ReitBenchmarkData;
  };
}

// Maps property type slug → benchmark key (office | retail | industrial)
const PROPERTY_TYPE_TO_BENCHMARK: Record<
  string,
  keyof ReitBenchmarksFile["industryBenchmarks"]
> = {
  "class-a-office": "office",
  "class-b-office": "office",
  "suburban-office": "office",
  "medical-office": "office",
  "neighborhood-retail": "retail",
  "power-center": "retail",
  "lifestyle-center": "retail",
  "strip-mall": "retail",
  "warehouse-distribution": "industrial",
  manufacturing: "industrial",
  "flex-industrial": "industrial",
};

export async function getReitBenchmark(
  propertyTypeSlug: string,
): Promise<ReitBenchmarkData | null> {
  const benchmarkKey = PROPERTY_TYPE_TO_BENCHMARK[propertyTypeSlug];
  if (!benchmarkKey) return null;
  try {
    const data = await loadJsonData<ReitBenchmarksFile>(
      "research/reit-benchmarks.json",
    );
    return data.industryBenchmarks[benchmarkKey] ?? null;
  } catch {
    return null;
  }
}

// ── Competitor Comparisons ──

interface ComparisonsFile {
  lastUpdated: string;
  comparisons: ComparisonData[];
}

export async function getAllComparisons(): Promise<ComparisonData[]> {
  try {
    const data = await loadJsonData<ComparisonsFile>("comparisons.json");
    return data.comparisons;
  } catch {
    return [];
  }
}

export async function getComparison(
  slug: string,
): Promise<ComparisonData | null> {
  const comparisons = await getAllComparisons();
  return comparisons.find((c) => c.slug === slug) ?? null;
}

// ── Roles ──

interface RolesFile {
  lastUpdated: string;
  roles: RoleData[];
}

export async function getAllRoles(): Promise<RoleData[]> {
  try {
    const data = await loadJsonData<RolesFile>("roles.json");
    return data.roles;
  } catch {
    return [];
  }
}

export async function getRole(slug: string): Promise<RoleData | null> {
  const roles = await getAllRoles();
  return roles.find((r) => r.slug === slug) ?? null;
}

// ── Workflows ──

interface WorkflowsFile {
  lastUpdated: string;
  workflows: WorkflowData[];
}

export async function getAllWorkflows(): Promise<WorkflowData[]> {
  try {
    const data = await loadJsonData<WorkflowsFile>("workflows.json");
    return data.workflows;
  } catch {
    return [];
  }
}

export async function getWorkflow(slug: string): Promise<WorkflowData | null> {
  const workflows = await getAllWorkflows();
  return workflows.find((w) => w.slug === slug) ?? null;
}

// ── Calendar Entries ──

interface CalendarFile {
  lastUpdated: string;
  entries: CalendarEntryData[];
}

export async function getAllCalendarEntries(): Promise<CalendarEntryData[]> {
  try {
    const data = await loadJsonData<CalendarFile>("calendar.json");
    return data.entries;
  } catch {
    return [];
  }
}

export async function getCalendarEntry(
  slug: string,
): Promise<CalendarEntryData | null> {
  const entries = await getAllCalendarEntries();
  return entries.find((e) => e.slug === slug) ?? null;
}

// ── CAM Calculations ──

interface CamCalculationsFile {
  lastUpdated: string;
  calculations: CamCalculationData[];
}

export async function getAllCalculations(): Promise<CamCalculationData[]> {
  try {
    const data = await loadJsonData<CamCalculationsFile>(
      "cam-calculations.json",
    );
    return data.calculations;
  } catch {
    return [];
  }
}

export async function getCalculation(
  slug: string,
): Promise<CamCalculationData | null> {
  const calculations = await getAllCalculations();
  return calculations.find((c) => c.slug === slug) ?? null;
}

// ── CAM Dispute Guides ──

interface CamDisputeFile {
  lastUpdated: string;
  disputeContent: CamDisputeData[];
}

export async function getAllDisputeTypes(): Promise<CamDisputeData[]> {
  try {
    const data = await loadJsonData<CamDisputeFile>("cam-dispute.json");
    return data.disputeContent;
  } catch {
    return [];
  }
}

export async function getDisputeType(
  slug: string,
): Promise<CamDisputeData | null> {
  const types = await getAllDisputeTypes();
  return types.find((t) => t.slug === slug) ?? null;
}

// ── Lease Types ──

interface LeaseTypesFile {
  lastUpdated: string;
  leaseTypes: LeaseTypeData[];
}

export async function getAllLeaseTypes(): Promise<LeaseTypeData[]> {
  try {
    const data = await loadJsonData<LeaseTypesFile>("lease-types.json");
    return data.leaseTypes;
  } catch {
    return [];
  }
}

export async function getLeaseType(
  slug: string,
): Promise<LeaseTypeData | null> {
  const types = await getAllLeaseTypes();
  return types.find((t) => t.slug === slug) ?? null;
}

// ── Templates ──

interface TemplatesFile {
  lastUpdated: string;
  templates: TemplateData[];
}

export async function getAllTemplates(): Promise<TemplateData[]> {
  try {
    const data = await loadJsonData<TemplatesFile>("templates.json");
    return data.templates;
  } catch {
    return [];
  }
}

export async function getTemplate(slug: string): Promise<TemplateData | null> {
  const templates = await getAllTemplates();
  return templates.find((t) => t.slug === slug) ?? null;
}

// -- Alternatives --

interface AlternativesFile {
  lastUpdated: string;
  alternatives: AlternativeData[];
}

export async function getAllAlternatives(): Promise<AlternativeData[]> {
  try {
    const data = await loadJsonData<AlternativesFile>("alternatives.json");
    return data.alternatives;
  } catch {
    return [];
  }
}

export async function getAlternative(
  slug: string,
): Promise<AlternativeData | null> {
  const alternatives = await getAllAlternatives();
  return alternatives.find((a) => a.slug === slug) ?? null;
}

// -- Solutions --

interface SolutionsFile {
  lastUpdated: string;
  solutions: SolutionData[];
}

export async function getAllSolutions(): Promise<SolutionData[]> {
  try {
    const data = await loadJsonData<SolutionsFile>("solutions.json");
    return data.solutions;
  } catch {
    return [];
  }
}

export async function getSolution(slug: string): Promise<SolutionData | null> {
  const solutions = await getAllSolutions();
  return solutions.find((s) => s.slug === slug) ?? null;
}

// -- Personas (conversion landing pages: /for/[persona]) --

interface PersonasFile {
  lastUpdated: string;
  personas: PersonaData[];
}

export async function getAllPersonas(): Promise<PersonaData[]> {
  try {
    const data = await loadJsonData<PersonasFile>("personas.json");
    return data.personas;
  } catch {
    return [];
  }
}

export async function getPersona(slug: string): Promise<PersonaData | null> {
  const personas = await getAllPersonas();
  return personas.find((p) => p.slug === slug) ?? null;
}

// -- Integrations --

interface IntegrationsFile {
  lastUpdated: string;
  integrations: IntegrationData[];
}

export async function getAllIntegrations(): Promise<IntegrationData[]> {
  try {
    const data = await loadJsonData<IntegrationsFile>("integrations.json");
    return data.integrations;
  } catch {
    return [];
  }
}

export async function getIntegration(
  slug: string,
): Promise<IntegrationData | null> {
  const integrations = await getAllIntegrations();
  return integrations.find((i) => i.slug === slug) ?? null;
}

// -- Switch Guides --

interface SwitchFile {
  lastUpdated: string;
  guides: SwitchData[];
}

export async function getAllSwitchGuides(): Promise<SwitchData[]> {
  try {
    const data = await loadJsonData<SwitchFile>("switch.json");
    return data.guides;
  } catch {
    return [];
  }
}

export async function getSwitchGuide(slug: string): Promise<SwitchData | null> {
  const guides = await getAllSwitchGuides();
  return guides.find((g) => g.slug === slug) ?? null;
}

// -- Videos --

interface VideosFile {
  lastUpdated: string;
  channelUrl: string;
  videos: VideoData[];
}

export async function getAllVideos(): Promise<VideoData[]> {
  try {
    const data = await loadJsonData<VideosFile>("videos.json");
    return data.videos;
  } catch {
    return [];
  }
}

export async function getVideo(slug: string): Promise<VideoData | null> {
  const videos = await getAllVideos();
  return videos.find((v) => v.slug === slug) ?? null;
}

export async function getVideosForPlacement(
  placement: string,
): Promise<VideoData[]> {
  const videos = await getAllVideos();
  return videos.filter((v) => v.placements.includes(placement));
}

export async function getVideoForPlacement(
  placement: string,
): Promise<VideoData | null> {
  const videos = await getAllVideos();
  return videos.find((v) => v.placements.includes(placement)) ?? null;
}
