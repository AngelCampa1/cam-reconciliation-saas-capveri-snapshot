import type { RentRollUnit } from "./parser";

export type RentRollImportInput = {
  organizationId: string;
  propertyName: string;
  addressLine1: string;
  city: string;
  state: string;
  postalCode: string;
  units: RentRollUnit[];
};

export type RentRollImportResult =
  | {
      state: "created";
      propertyId: string;
      propertyName: string;
      unitsCreated: number;
      leasesCreated: number;
    }
  | { state: "failed"; message: string };

export type RentRollRepository = {
  hasFullAccess(organizationId: string): Promise<boolean>;
  importRentRoll(input: RentRollImportInput): Promise<RentRollImportResult>;
};

export function isUniqueConstraintError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();

  return message.includes("unique") || message.includes("duplicate");
}
