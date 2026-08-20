import { describe, expect, it } from "vitest";
import {
  buildCapBankLedger,
  type FinalizedSnapshotRow,
  type LeaseCapProfile,
} from "../domain/reconciliation/cap-bank-ledger";

const PROFILE: LeaseCapProfile = {
  leaseId: "44444444-4444-4444-8444-444444444444",
  tenantName: "Acme",
  capType: "cumulative",
  capRate: "0.05",
  capFixedAmount: null,
  baseYearAmount: "10000.00",
};

describe("buildCapBankLedger — Date-typed snapshot columns", () => {
  it("normalizes period dates and finalized_at that decoded as Date objects", () => {
    // A bare postgres `date`/`timestamp` decodes to a JS Date. parseDate must
    // normalize it — otherwise `.slice()` throws in production.
    const snapshots: FinalizedSnapshotRow[] = [
      {
        id: "snap-1",
        tenant_share_before_cap: "10500.00",
        period_start_date: new Date("2024-01-01T00:00:00Z"),
        period_end_date: new Date("2024-12-31T00:00:00Z"),
        finalized_at: new Date("2025-01-15T12:30:00Z"),
      },
    ];

    const ledger = buildCapBankLedger(PROFILE, snapshots);

    expect(ledger.entries).toHaveLength(1);
    expect(ledger.entries[0]?.period_start).toBe("2024-01-01");
    expect(ledger.entries[0]?.period_end).toBe("2024-12-31");
    expect(ledger.entries[0]?.finalized_at).toBe("2025-01-15T12:30:00.000Z");
  });

  it("still handles plain string date columns (::text-cast path)", () => {
    const snapshots: FinalizedSnapshotRow[] = [
      {
        id: "snap-1",
        tenant_share_before_cap: "10500.00",
        period_start_date: "2024-01-01",
        period_end_date: "2024-12-31",
        finalized_at: "2025-01-15T12:30:00.000Z",
      },
    ];

    const ledger = buildCapBankLedger(PROFILE, snapshots);

    expect(ledger.entries[0]?.period_start).toBe("2024-01-01");
    expect(ledger.entries[0]?.finalized_at).toBe("2025-01-15T12:30:00.000Z");
  });
});
