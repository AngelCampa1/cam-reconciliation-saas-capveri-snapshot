export type AlertItem = {
  id: string;
  type: "warning" | "info" | "action";
  title: string;
  description: string;
  href: string;
  count?: number | null;
};

export type PropertySummary = {
  id: string;
  name: string;
  unit_count: number;
  last_reconciliation: string | null;
};

export type ActivityItem = {
  id: string;
  type: "property" | "lease" | "upload";
  title: string;
  description: string;
  timestamp: string;
  href: string;
};

export type DashboardSummary = {
  property_count: number;
  unit_count: number;
  lease_count: number;
  gl_entry_count: number;
  pending_reconciliations: number;
  pending_verifications: number;
  recent_properties: PropertySummary[];
  recent_activity: ActivityItem[];
  total_recovery_finalized: string;
  alerts: AlertItem[];
};

export type LeakageSummaryResponse = {
  total_recovery_opportunity: string;
  properties_with_leakage: number;
  total_underbill_exposure: string;
  total_overbill_exposure: string;
  total_billing_exposure: string;
  properties_with_underbill: number;
  properties_with_overbill: number;
  properties_with_billing_exposure: number;
  has_billing_data: boolean;
  draft_recovery: string;
  draft_property_count: number;
};

export type PlanSelectionResponse = {
  plan_id: string | null;
  billing_period: "annual" | null;
  unit_count: number | null;
  building_count: number | null;
  selected_at: string | null;
  checkout_required: boolean;
  has_active_access: boolean;
  has_paused_subscription: boolean;
  subscription_status: string | null;
  trial_days_remaining: number | null;
};

export type BootstrapRepository = {
  getDashboardSummary(organizationId: string): Promise<DashboardSummary>;
  getLeakageSummary(organizationId: string): Promise<LeakageSummaryResponse>;
  getPlanSelection(organizationId: string): Promise<PlanSelectionResponse>;
};
