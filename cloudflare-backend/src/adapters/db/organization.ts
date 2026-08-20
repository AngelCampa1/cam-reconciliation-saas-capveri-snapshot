import type {
  OrganizationRepository,
  OrganizationSettings,
  RawOrganizationSettings,
  StoredOrganizationSettings,
  OrganizationUsage,
} from "../../domain/organization/repository";
import type { PostgresExecutor } from "./postgres";

type CountRow = {
  properties: string | number | bigint;
  users: string | number | bigint;
};

type SettingsRow = {
  settings: unknown;
};

export class PostgresOrganizationRepository implements OrganizationRepository {
  constructor(private readonly executor: PostgresExecutor) {}

  async getUsage(organizationId: string): Promise<OrganizationUsage> {
    const result = await this.executor.query<CountRow>(
      [
        "select",
        "(select count(*) from properties where organization_id = $1) as properties,",
        "(select count(*) from users where organization_id = $1) as users",
      ].join(" "),
      [organizationId],
    );
    const row = result.rows[0];

    return {
      properties: toCount(row?.properties ?? 0),
      users: toCount(row?.users ?? 0),
    };
  }

  async getSettings(
    organizationId: string,
  ): Promise<StoredOrganizationSettings | null> {
    const result = await this.executor.query<SettingsRow>(
      "select settings from organizations where id = $1",
      [organizationId],
    );
    const row = result.rows[0];

    return row ? toStoredSettings(row.settings) : null;
  }

  async updateSettings(input: {
    organizationId: string;
    settings: RawOrganizationSettings;
  }): Promise<StoredOrganizationSettings | null> {
    const result = await this.executor.query<SettingsRow>(
      [
        "update organizations",
        "set settings = $2",
        "where id = $1",
        "returning settings",
      ].join(" "),
      [input.organizationId, input.settings],
    );
    const row = result.rows[0];

    return row ? toStoredSettings(row.settings) : null;
  }
}

function toStoredSettings(value: unknown): StoredOrganizationSettings {
  const raw = isRecord(value) ? value : {};

  return {
    raw,
    settings: normalizeSettings(raw),
  };
}

function normalizeSettings(value: unknown): OrganizationSettings {
  const settings = isRecord(value) ? value : {};

  return {
    timezone:
      typeof settings.timezone === "string"
        ? settings.timezone
        : "America/New_York",
    default_currency:
      typeof settings.default_currency === "string"
        ? settings.default_currency
        : "USD",
    fiscal_year_end_month:
      typeof settings.fiscal_year_end_month === "number"
        ? settings.fiscal_year_end_month
        : 12,
    contact_name: nullableString(settings.contact_name),
    contact_title: nullableString(settings.contact_title),
    contact_company: nullableString(settings.contact_company),
    contact_phone: nullableString(settings.contact_phone),
    contact_email: nullableString(settings.contact_email),
    contact_address: nullableString(settings.contact_address),
  };
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toCount(value: string | number | bigint): number {
  if (typeof value === "bigint") {
    return Number(value);
  }

  if (typeof value === "number") {
    return value;
  }

  return Number.parseInt(value, 10);
}
