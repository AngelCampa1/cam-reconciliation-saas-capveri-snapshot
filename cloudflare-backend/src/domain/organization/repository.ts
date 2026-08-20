export type OrganizationUsage = {
  properties: number;
  users: number;
};

export type OrganizationSettings = {
  timezone: string;
  default_currency: string;
  fiscal_year_end_month: number;
  contact_name: string | null;
  contact_title: string | null;
  contact_company: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  contact_address: string | null;
};

export type OrganizationSettingsResponse = OrganizationSettings & {
  organization_id: string;
};

export type OrganizationSettingsPatch = Partial<OrganizationSettings>;
export type RawOrganizationSettings = Record<string, unknown>;

export type StoredOrganizationSettings = {
  raw: RawOrganizationSettings;
  settings: OrganizationSettings;
};

export type OrganizationRepository = {
  getUsage(organizationId: string): Promise<OrganizationUsage>;
  getSettings(
    organizationId: string,
  ): Promise<StoredOrganizationSettings | null>;
  updateSettings(input: {
    organizationId: string;
    settings: RawOrganizationSettings;
  }): Promise<StoredOrganizationSettings | null>;
};
