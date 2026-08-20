import Decimal from "decimal.js";
import { Hono } from "hono";
import { PostgresPortfolioRepository } from "../adapters/db/portfolio";
import { createDirectPostgresExecutor } from "../adapters/db/postgres";
import type {
  PortfolioDataset,
  PortfolioRepository,
} from "../domain/portfolio/repository";
import type { AppEnv } from "../env";
import {
  authMiddleware,
  type AuthMiddlewareOptions,
  type AuthVariables,
} from "../middleware/auth";
import { errorResponse, HttpError } from "./errors";

type RouteBindings = { Bindings: AppEnv; Variables: AuthVariables };

export type PortfolioRouteDependencies = {
  repository?: PortfolioRepository;
  auth?: AuthMiddlewareOptions;
};

export function createPortfolioRoutes(
  dependencies: PortfolioRouteDependencies = {},
): Hono<RouteBindings> {
  const app = new Hono<RouteBindings>();

  app.onError((error, c) => errorResponse(c, error));
  app.use("/portfolio/*", authMiddleware(dependencies.auth));

  app.get("/portfolio/summary", async (c) => {
    requireLandlord(c.get("auth").actor.party);
    const dataset = await resolveRepository(
      c.env,
      dependencies,
    ).loadPortfolioDataset(c.get("auth").actor.organizationId);

    return c.json(calculatePortfolioSummary(dataset));
  });

  return app;
}

function calculatePortfolioSummary(dataset: PortfolioDataset) {
  if (
    dataset.properties.length === 0 ||
    dataset.finalizedSnapshots.length === 0
  ) {
    return emptyPortfolioSummary();
  }

  const years = new Set<number>();
  for (const snapshot of dataset.finalizedSnapshots) {
    const year = parseYear(snapshot.period_start_date);
    if (year !== null) {
      years.add(year);
    }
  }

  if (years.size === 0) {
    return emptyPortfolioSummary();
  }

  const mostRecentYear = Math.max(...years);
  const propertyNames = new Map(
    dataset.properties.map((property) => [property.id, property.name]),
  );
  const totalRecoveryAllYears = dataset.finalizedSnapshots.reduce(
    (total, snapshot) => total.plus(moneyOrZero(snapshot.total_recovery)),
    new Decimal(0),
  );
  const recoverableByProperty = new Map<string, Decimal>();
  for (const snapshot of dataset.finalizedSnapshots) {
    if (parseYear(snapshot.period_start_date) !== mostRecentYear) {
      continue;
    }
    recoverableByProperty.set(
      snapshot.property_id,
      (recoverableByProperty.get(snapshot.property_id) ?? new Decimal(0)).plus(
        moneyOrZero(snapshot.total_recovery),
      ),
    );
  }

  const billedByProperty = new Map<string, Decimal>();
  for (const billed of dataset.billedRows) {
    if (parseYear(billed.period_start_date) !== mostRecentYear) {
      continue;
    }
    billedByProperty.set(
      billed.property_id,
      (billedByProperty.get(billed.property_id) ?? new Decimal(0)).plus(
        moneyOrZero(billed.billed_amount),
      ),
    );
  }

  const hasBillingData = billedByProperty.size > 0;
  const properties = [...recoverableByProperty.entries()]
    .map(([propertyId, totalRecoverable]) => {
      const totalBilled = billedByProperty.get(propertyId) ?? new Decimal(0);
      const leakage = totalRecoverable.minus(totalBilled);

      return {
        property_id: propertyId,
        property_name: propertyNames.get(propertyId) ?? "",
        total_recoverable: totalRecoverable.toFixed(),
        total_billed: totalBilled.toFixed(),
        leakage: leakage.toFixed(),
        recovery_rate:
          hasBillingData && totalRecoverable.gt(0)
            ? totalBilled.div(totalRecoverable).times(100).toNumber()
            : null,
      };
    })
    .sort((left, right) =>
      moneyOrZero(right.leakage).cmp(moneyOrZero(left.leakage)),
    );
  const totalRecoverableCam = properties.reduce(
    (total, property) => total.plus(moneyOrZero(property.total_recoverable)),
    new Decimal(0),
  );
  const totalLeakage = properties.reduce((total, property) => {
    const leakage = moneyOrZero(property.leakage);

    return leakage.gt(0) ? total.plus(leakage) : total;
  }, new Decimal(0));
  const totalBilled = properties.reduce(
    (total, property) => total.plus(moneyOrZero(property.total_billed)),
    new Decimal(0),
  );

  return {
    period_year: mostRecentYear,
    total_recoverable_cam: totalRecoverableCam.toFixed(),
    total_leakage: totalLeakage.toFixed(),
    recovery_rate:
      hasBillingData && totalRecoverableCam.gt(0)
        ? totalBilled.div(totalRecoverableCam).times(100).toNumber()
        : null,
    properties_with_leakage: properties.filter((property) =>
      moneyOrZero(property.leakage).gt(0),
    ).length,
    has_billing_data: hasBillingData,
    total_recovery_all_years: totalRecoveryAllYears.toFixed(),
    properties,
  };
}

function emptyPortfolioSummary() {
  return {
    period_year: null,
    total_recoverable_cam: "0",
    total_leakage: "0",
    recovery_rate: null,
    properties_with_leakage: 0,
    has_billing_data: false,
    total_recovery_all_years: "0",
    properties: [],
  };
}

function parseYear(value: string | null): number | null {
  if (!value || value.length < 4) {
    return null;
  }

  const year = Number.parseInt(value.slice(0, 4), 10);

  return Number.isNaN(year) ? null : year;
}

function moneyOrZero(value: string): Decimal {
  try {
    return new Decimal(value);
  } catch {
    return new Decimal(0);
  }
}

function requireLandlord(party: AuthVariables["auth"]["actor"]["party"]): void {
  if (party === "landlord") {
    return;
  }

  throw new HttpError(
    403,
    "insufficient_permissions",
    "Insufficient permissions",
  );
}

function resolveRepository(
  env: AppEnv,
  dependencies: PortfolioRouteDependencies,
): PortfolioRepository {
  return (
    dependencies.repository ??
    new PostgresPortfolioRepository(createDirectPostgresExecutor(env))
  );
}
