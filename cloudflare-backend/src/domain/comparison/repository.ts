import type {
  ComparisonResult,
  ComparisonSource,
  ExplicitCharge,
  StoredComparisonRun,
  StoredComparisonRunSummary,
} from "./model";

export type ComparisonRunInput = {
  organizationId: string;
  propertyId: string;
  periodStart: string;
  periodEnd: string;
  tolerance: string;
  includeDrafts: boolean;
};

export type ExplicitComparisonInput = ComparisonRunInput & {
  charges: ExplicitCharge[];
};

export type PersistComparisonRunInput = ComparisonRunInput & {
  userId: string;
  charges?: ExplicitCharge[] | null;
};

export type ListComparisonRunsInput = {
  organizationId: string;
  propertyId: string;
  limit: number;
  offset: number;
};

export type GetComparisonRunInput = {
  organizationId: string;
  runId: string;
};

export type SaveComparisonRunInput = {
  organizationId: string;
  userId: string;
  source: ComparisonSource;
  result: ComparisonResult;
};

export type ComparisonRepository = {
  compareActualBilled(input: ComparisonRunInput): Promise<ComparisonResult>;
  compareExplicit(input: ExplicitComparisonInput): Promise<ComparisonResult>;
  createRun(input: PersistComparisonRunInput): Promise<StoredComparisonRun>;
  listRuns(
    input: ListComparisonRunsInput,
  ): Promise<StoredComparisonRunSummary[]>;
  getRun(input: GetComparisonRunInput): Promise<StoredComparisonRun | null>;
};
