// Maps the internal lease-field keys to plain, reader-friendly labels.
// Lives in its own server-safe module so both the server page and the
// client tab component can import it (a "use client" module cannot export
// functions that a server component calls during render).
const FIELD_LABELS: Record<string, string> = {
  base_year: "Base year",
  base_year_amount: "Base year amount",
  gross_up_base_year: "Gross-up base year",
  pro_rata_share: "Pro-rata share",
  cap_type: "Cap type",
  cap_rate: "Cap rate",
  admin_fee_percentage: "Admin fee",
  excluded_pools: "Excluded pools",
  accounting_basis: "Accounting basis",
};

export function fieldLabel(field: string): string {
  return (
    FIELD_LABELS[field] ??
    field
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ")
  );
}
