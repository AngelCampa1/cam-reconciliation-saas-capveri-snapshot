"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, AlertCircle, Lock } from "lucide-react";
import {
  getEmailDomain,
  getStatusBucket,
  identifyMarketingLead,
  trackMarketingEvent,
} from "@/lib/posthog";
import { marketingApiUrl } from "@/lib/api";
import {
  TurnstileWidget,
  isTurnstileConfigured,
} from "@/components/TurnstileWidget";
import { HoneypotField } from "@/components/HoneypotField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  captureMarketingException,
  isExpectedBrowserTransportError,
} from "@/lib/sentry";

const resourceDeliveryCopy = "We'll send the resource to your inbox.";

const unlockSchema = z.object({
  first_name: z.string().min(1, "First name is required").max(100, "Too long"),
  work_email: z.string().email("Please enter a valid work email"),
});

type UnlockFormData = z.infer<typeof unlockSchema>;

export interface CalculatorUnlockGateProps {
  slug: string;
  onUnlock: () => void;
  source?: string;
  /** Line shown above the unlock button. Tailor it to what the tool reveals. */
  lockMessage?: string;
  /** Button label for opening and submitting the form. */
  unlockLabel?: string;
}

const DEFAULT_LOCK_MESSAGE =
  "Enter your email to see revenue and asset value projections.";
const DEFAULT_UNLOCK_LABEL = "See Financial Projections";
const calculatorUnlockOperation = "marketing.lead-capture.calculator-unlock";

function captureCalculatorUnlockApiFailure(response: Response) {
  if (response.status < 500) return;

  captureMarketingException(
    new Error(`Calculator unlock API failed with status ${response.status}`),
    {
      operation: calculatorUnlockOperation,
      path: "/api/v1/leads/calculator-unlock",
    },
  );
}

function captureCalculatorUnlockFetchFailure(error: unknown) {
  if (isExpectedBrowserTransportError(error)) return;

  captureMarketingException(
    error instanceof Error ? error : new Error(String(error)),
    {
      operation: calculatorUnlockOperation,
      path: "/api/v1/leads/calculator-unlock",
    },
  );
}

function readUnlockState(storageKey: string): boolean {
  try {
    return localStorage.getItem(storageKey) === "true";
  } catch {
    return false;
  }
}

function writeUnlockState(storageKey: string): void {
  try {
    localStorage.setItem(storageKey, "true");
  } catch {
    return;
  }
}

export function CalculatorUnlockGate({
  slug,
  onUnlock,
  source,
  lockMessage = DEFAULT_LOCK_MESSAGE,
  unlockLabel = DEFAULT_UNLOCK_LABEL,
}: CalculatorUnlockGateProps) {
  const [showForm, setShowForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [companyWebsite, setCompanyWebsite] = useState("");
  const [hasStarted, setHasStarted] = useState(false);
  const storageKey = `capveri_calculator_unlocked:${slug}`;

  // Auto-unlock returning visitors who already submitted
  useEffect(() => {
    if (readUnlockState(storageKey)) {
      onUnlock();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]); // runs once per calculator slug

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<UnlockFormData>({
    resolver: zodResolver(unlockSchema),
  });

  const getTrackingProps = (email?: string) => ({
    form_type: "calculator_unlock",
    location: "calculator_unlock_gate",
    source: source || "calculator_unlock",
    asset_slug: slug,
    slug,
    lead_type: "calculator_unlock",
    turnstile_configured: isTurnstileConfigured(),
    ...(email && getEmailDomain(email)
      ? { email_domain: getEmailDomain(email) }
      : {}),
  });

  const trackFormStarted = () => {
    if (hasStarted) return;
    setHasStarted(true);
    trackMarketingEvent("form_started", getTrackingProps());
  };

  const onInvalid = () => {
    trackMarketingEvent("form_submit_attempted", getTrackingProps());
    trackMarketingEvent("form_submit_failed", {
      ...getTrackingProps(),
      error_type: "validation",
      status_bucket: "client",
    });
  };

  const onSubmit = async (data: UnlockFormData) => {
    setIsSubmitting(true);
    setError(null);
    trackMarketingEvent(
      "form_submit_attempted",
      getTrackingProps(data.work_email),
    );

    if (isTurnstileConfigured() && !turnstileToken) {
      setError("Please complete the verification challenge.");
      trackMarketingEvent(
        "turnstile_required_missing",
        getTrackingProps(data.work_email),
      );
      trackMarketingEvent("form_submit_failed", {
        ...getTrackingProps(data.work_email),
        error_type: "turnstile_missing",
        status_bucket: "client",
      });
      setIsSubmitting(false);
      return;
    }

    try {
      const res = await fetch(
        marketingApiUrl("/api/v1/leads/calculator-unlock"),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            first_name: data.first_name,
            email: data.work_email,
            slug,
            source,
            company_website: companyWebsite || undefined,
            turnstile_token: turnstileToken,
          }),
        },
      );

      if (res.status === 429) {
        writeUnlockState(storageKey);
        onUnlock();
        return;
      }

      if (!res.ok) {
        captureCalculatorUnlockApiFailure(res);
        setError("Something went wrong. Please try again.");
        trackMarketingEvent("form_submit_failed", {
          ...getTrackingProps(data.work_email),
          error_type: "api_error",
          status_bucket: getStatusBucket(res.status),
        });
        return;
      }

      writeUnlockState(storageKey);
      identifyMarketingLead(data.work_email, {
        lead_type: "calculator_unlock",
        asset_slug: slug,
        source: source || "calculator_unlock",
      });
      onUnlock();
    } catch (err) {
      captureCalculatorUnlockFetchFailure(err);
      setError("Network error. Please check your connection and try again.");
      trackMarketingEvent("form_submit_failed", {
        ...getTrackingProps(data.work_email),
        error_type: "network",
        status_bucket: "network",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!showForm) {
    return (
      <div className="text-center space-y-3 py-4">
        <div className="flex items-center justify-center gap-2 text-muted-foreground">
          <Lock className="h-4 w-4" />
          <p className="text-base sm:text-sm">{lockMessage}</p>
        </div>
        <Button
          className="w-full sm:w-auto min-h-[44px]"
          onClick={() => {
            setShowForm(true);
            trackMarketingEvent("tool_lead_gate_opened", {
              slug,
              source: source || "calculator_unlock",
            });
            trackMarketingEvent("lead_form_view", { slug });
          }}
        >
          {unlockLabel}
        </Button>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit, onInvalid)}
      onFocusCapture={trackFormStarted}
      className="space-y-4"
      noValidate
    >
      <HoneypotField value={companyWebsite} onChange={setCompanyWebsite} />

      <div className="space-y-1.5">
        <Label htmlFor="unlock_first_name">First name</Label>
        <Input
          id="unlock_first_name"
          type="text"
          placeholder="Jane"
          autoComplete="given-name"
          className="h-11"
          {...register("first_name")}
          aria-invalid={!!errors.first_name}
          aria-describedby={
            errors.first_name ? "unlock_first_name_error" : undefined
          }
        />
        {errors.first_name && (
          <p
            id="unlock_first_name_error"
            role="alert"
            className="text-sm text-destructive-strong"
          >
            {errors.first_name.message}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="unlock_work_email">Work email</Label>
        <Input
          id="unlock_work_email"
          type="email"
          placeholder="jane@yourcompany.com"
          autoComplete="email"
          inputMode="email"
          className="h-11"
          {...register("work_email")}
          aria-invalid={!!errors.work_email}
          aria-describedby={
            errors.work_email ? "unlock_work_email_error" : undefined
          }
        />
        {errors.work_email && (
          <p
            id="unlock_work_email_error"
            role="alert"
            className="text-sm text-destructive-strong"
          >
            {errors.work_email.message}
          </p>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive-strong">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <TurnstileWidget
        onVerify={setTurnstileToken}
        onExpire={() => setTurnstileToken("")}
        className="mb-2"
      />

      <Button
        type="submit"
        className="w-full sm:w-auto min-h-[44px]"
        disabled={isSubmitting}
      >
        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {unlockLabel}
      </Button>

      <p className="text-center text-xs text-muted-foreground">
        {resourceDeliveryCopy}
      </p>
    </form>
  );
}
