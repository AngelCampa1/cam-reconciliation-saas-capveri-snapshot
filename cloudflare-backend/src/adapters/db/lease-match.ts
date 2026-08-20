export function normalizeTenantMatchValue(value: string | null): string | null {
  const normalized = value
    ?.trim()
    .toLowerCase()
    .replace(/&/gu, " and ")
    .replace(/[^a-z0-9]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();

  const withoutSuffix = normalized?.replace(
    /\s+(llc|ltd|limited|inc|incorporated|corp|corporation|lp|llp|pllc)$/u,
    "",
  );

  return withoutSuffix && withoutSuffix.length > 0 ? withoutSuffix : null;
}

export function normalizeSuiteMatchValue(value: string | null): string | null {
  const normalized = value
    ?.trim()
    .toLowerCase()
    .replace(/^(suite|ste|unit|space|#)\s*/u, "")
    .replace(/[^a-z0-9]+/gu, "")
    .trim();

  return normalized && normalized.length > 0 ? normalized : null;
}
