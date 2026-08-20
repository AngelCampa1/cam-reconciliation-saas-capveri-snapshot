# Story T5.2: Details Step

## Story Info
- **Epic**: T5 — Audit Wizard
- **Estimated Hours**: 6
- **Dependencies**: T5.1 (Upload Step), T1.4 (PATCH endpoint)
- **Status**: `pending`

## User Story
As a commercial tenant, I want to provide my email and select an audit tier so that I can receive my audit report and choose the level of analysis I need.

## Acceptance Criteria
- Email field is required and validated (RFC 5322 format)
- Property name, tenant name, and suite number are optional text fields
- Three tier options displayed as selectable cards: Standard ($49), Detailed ($99, default), Expert ($199)
- Detailed tier ($99) is pre-selected by default
- Each tier card shows: name, price, and bullet list of included features
- "Continue to Payment" button is disabled until email is valid
- Submitting the form calls `PATCH /api/v1/tenant-audits/{token}` with email, tier, and optional fields
- On success, advances to the checkout step
- Form preserves values if user navigates back from checkout (loaded from audit record)
- Inline validation errors for email format

## Technical Specifications

### Tier Configuration

```typescript
// marketing-tenant/src/lib/audit-tiers.ts

export type AuditTier = "standard" | "detailed" | "expert";

export interface TierConfig {
  id: AuditTier;
  name: string;
  price: number;
  description: string;
  features: string[];
  badge?: string;
}

export const AUDIT_TIERS: TierConfig[] = [
  {
    id: "standard",
    name: "Standard",
    price: 49,
    description: "Quick check for obvious errors",
    features: [
      "Executive summary",
      "Top-level overcharge detection",
      "Total discrepancy amount",
      "Confidence score",
    ],
  },
  {
    id: "detailed",
    name: "Detailed",
    price: 99,
    description: "Line-by-line analysis with calculations",
    badge: "Most Popular",
    features: [
      "Everything in Standard",
      "Line-item discrepancy breakdown",
      "Detailed findings per category",
      "Calculation trace & methodology",
      "Severity ratings",
    ],
  },
  {
    id: "expert",
    name: "Expert",
    price: 199,
    description: "Comprehensive audit with dispute support",
    features: [
      "Everything in Detailed",
      "Lease clause cross-references",
      "Industry benchmark comparisons",
      "Dispute letter draft",
      "Recommended next steps",
    ],
  },
];
```

### TierSelector Component

```typescript
// marketing-tenant/src/components/audit/TierSelector.tsx
"use client";

import { AUDIT_TIERS, type AuditTier } from "@/lib/audit-tiers";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

interface TierSelectorProps {
  selected: AuditTier;
  onSelect: (tier: AuditTier) => void;
}

export function TierSelector({ selected, onSelect }: TierSelectorProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {AUDIT_TIERS.map((tier) => {
        const isSelected = selected === tier.id;
        return (
          <button
            key={tier.id}
            type="button"
            onClick={() => onSelect(tier.id)}
            className={cn(
              "relative flex flex-col rounded-lg border-2 p-4 text-left transition-colors",
              isSelected
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/50",
            )}
            aria-pressed={isSelected}
          >
            {tier.badge && (
              <span className="absolute -top-2.5 left-3 rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
                {tier.badge}
              </span>
            )}

            <div className="mb-3">
              <p className="font-semibold">{tier.name}</p>
              <p className="text-2xl font-bold">
                ${tier.price}
                <span className="text-sm font-normal text-muted-foreground">
                  {" "}
                  one-time
                </span>
              </p>
            </div>

            <p className="mb-3 text-sm text-muted-foreground">
              {tier.description}
            </p>

            <ul className="space-y-1.5">
              {tier.features.map((feature) => (
                <li key={feature} className="flex items-start gap-2 text-sm">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                  {feature}
                </li>
              ))}
            </ul>
          </button>
        );
      })}
    </div>
  );
}
```

### DetailsStep Component

```typescript
// marketing-tenant/src/components/audit/DetailsStep.tsx
"use client";

import { useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TierSelector } from "./TierSelector";
import { useUpdateAudit } from "@/hooks/use-tenant-audit";
import type { AuditTier } from "@/lib/audit-tiers";
import type { TenantAudit } from "@/types/tenant-audit";

const emailSchema = z.string().email("Please enter a valid email address");

interface DetailsStepProps {
  audit: TenantAudit;
}

export function DetailsStep({ audit }: DetailsStepProps) {
  const [email, setEmail] = useState(audit.email ?? "");
  const [propertyName, setPropertyName] = useState(audit.property_name ?? "");
  const [tenantName, setTenantName] = useState(audit.tenant_name ?? "");
  const [suiteNumber, setSuiteNumber] = useState(audit.suite_number ?? "");
  const [tier, setTier] = useState<AuditTier>(audit.tier ?? "detailed");
  const [emailError, setEmailError] = useState<string | null>(null);

  const updateAudit = useUpdateAudit(audit.access_token);

  const validateEmail = (value: string): boolean => {
    const result = emailSchema.safeParse(value);
    if (!result.success) {
      setEmailError(result.error.errors[0].message);
      return false;
    }
    setEmailError(null);
    return true;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateEmail(email)) return;

    updateAudit.mutate({
      email,
      tier,
      property_name: propertyName || undefined,
      tenant_name: tenantName || undefined,
      suite_number: suiteNumber || undefined,
    });
  };

  const isEmailValid = emailSchema.safeParse(email).success;

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-2xl space-y-8">
      <div className="text-center">
        <h2 className="text-2xl font-bold tracking-tight">Audit Details</h2>
        <p className="mt-2 text-muted-foreground">
          Tell us where to send your report and choose your analysis level.
        </p>
      </div>

      {/* Email (required) */}
      <div className="space-y-2">
        <Label htmlFor="email">
          Email Address <span className="text-destructive">*</span>
        </Label>
        <Input
          id="email"
          type="email"
          placeholder="you@company.com"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (emailError) validateEmail(e.target.value);
          }}
          onBlur={() => {
            if (email) validateEmail(email);
          }}
          aria-invalid={emailError ? "true" : undefined}
          aria-describedby={emailError ? "email-error" : undefined}
        />
        {emailError && (
          <p id="email-error" className="text-sm text-destructive" role="alert">
            {emailError}
          </p>
        )}
      </div>

      {/* Optional property fields */}
      <fieldset className="space-y-4">
        <legend className="text-sm font-medium text-muted-foreground">
          Property Information (optional)
        </legend>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="property-name">Property Name</Label>
            <Input
              id="property-name"
              placeholder="e.g., Gateway Plaza"
              value={propertyName}
              onChange={(e) => setPropertyName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="tenant-name">Tenant Name</Label>
            <Input
              id="tenant-name"
              placeholder="e.g., Acme Corp"
              value={tenantName}
              onChange={(e) => setTenantName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="suite-number">Suite Number</Label>
            <Input
              id="suite-number"
              placeholder="e.g., 200"
              value={suiteNumber}
              onChange={(e) => setSuiteNumber(e.target.value)}
            />
          </div>
        </div>
      </fieldset>

      {/* Tier selection */}
      <div className="space-y-3">
        <Label>Select Your Audit Level</Label>
        <TierSelector selected={tier} onSelect={setTier} />
      </div>

      {updateAudit.isError && (
        <p className="text-center text-sm text-destructive" role="alert">
          {updateAudit.error?.message ?? "Failed to save details. Please try again."}
        </p>
      )}

      <Button
        type="submit"
        disabled={!isEmailValid || updateAudit.isPending}
        className="w-full"
        size="lg"
      >
        {updateAudit.isPending ? "Saving..." : "Continue to Payment"}
      </Button>
    </form>
  );
}
```

### API Hook

```typescript
// Additions to marketing-tenant/src/hooks/use-tenant-audit.ts

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { AuditTier } from "@/lib/audit-tiers";

interface UpdateAuditPayload {
  email: string;
  tier: AuditTier;
  property_name?: string;
  tenant_name?: string;
  suite_number?: string;
}

export function useUpdateAudit(accessToken: string) {
  const queryClient = useQueryClient();

  return useMutation<TenantAudit, Error, UpdateAuditPayload>({
    mutationFn: async (payload) => {
      const response = await fetch(
        `${API_BASE}/api/v1/tenant-audits/${accessToken}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );

      if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        throw new Error(
          errorBody?.detail ?? `Failed to update (${response.status})`,
        );
      }

      return response.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["tenant-audit", accessToken], data);
    },
  });
}
```

## Test Cases
- Email field is required -- form submit blocked without it
- Invalid email format shows "Please enter a valid email address"
- Valid email clears the error
- Property name, tenant name, suite number are optional and submittable as empty
- Detailed tier ($99) is pre-selected by default
- Clicking a tier card selects it (aria-pressed="true") and deselects others
- Each tier card displays name, price, description, and feature list
- "Most Popular" badge appears on the Detailed tier
- "Continue to Payment" button is disabled when email is empty or invalid
- "Continue to Payment" button is enabled when email is valid
- Submitting calls `PATCH /api/v1/tenant-audits/{token}` with correct payload
- Form fields are pre-populated from existing audit data (return visit)
- API error displays inline error message
- Loading state shows "Saving..." on submit button

## Definition of Done
- [ ] `TierSelector` renders three tier cards with correct pricing and features
- [ ] Detailed tier pre-selected by default
- [ ] `DetailsStep` form validates email as required field
- [ ] Optional fields (property name, tenant name, suite number) work correctly
- [ ] `PATCH /api/v1/tenant-audits/{token}` called with form data on submit
- [ ] Form pre-populates from existing audit data
- [ ] Error and loading states handled
- [ ] Unit tests for `TierSelector` (selection, accessibility)
- [ ] Unit tests for `DetailsStep` (validation, submit, pre-population)
- [ ] Responsive layout: tier cards stack on mobile, grid on desktop
