export type PortfolioPropertyRecord = {
  id: string;
  name: string;
};

export type PortfolioSnapshotRecord = {
  property_id: string;
  total_recovery: string;
  period_start_date: string | null;
};

export type PortfolioBilledRecord = {
  property_id: string;
  billed_amount: string;
  period_start_date: string | null;
};

export type PortfolioDataset = {
  properties: PortfolioPropertyRecord[];
  finalizedSnapshots: PortfolioSnapshotRecord[];
  billedRows: PortfolioBilledRecord[];
};

export type PortfolioRepository = {
  loadPortfolioDataset(organizationId: string): Promise<PortfolioDataset>;
};
