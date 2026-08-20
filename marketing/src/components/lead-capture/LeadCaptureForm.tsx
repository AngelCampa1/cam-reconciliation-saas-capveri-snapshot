"use client";

import { useState, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, AlertCircle } from "lucide-react";
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

const resourceDeliveryCopy = "We'll send the download link to your inbox.";

const fullSchema = z.object({
  first_name: z.string().min(1, "First name is required").max(100, "Too long"),
  work_email: z.string().email("Please enter a valid work email"),
  company: z.string().optional(),
});

const emailOnlySchema = z.object({
  work_email: z.string().email("Please enter a valid work email"),
});

type FullFormData = z.infer<typeof fullSchema>;
type EmailOnlyFormData = z.infer<typeof emailOnlySchema>;
type LeadFormData = FullFormData | EmailOnlyFormData;

const contentDownloadOperation = "marketing.lead-capture.content-download";

function captureContentDownloadApiFailure(response: Response) {
  if (response.status < 500) return;

  captureMarketingException(
    new Error(`Lead capture API failed with status ${response.status}`),
    {
      operation: contentDownloadOperation,
      path: "/api/v1/leads/content-download",
    },
  );
}

function captureContentDownloadFetchFailure(error: unknown) {
  if (isExpectedBrowserTransportError(error)) return;

  captureMarketingException(
    error instanceof Error ? error : new Error(String(error)),
    {
      operation: contentDownloadOperation,
      path: "/api/v1/leads/content-download",
    },
  );
}

export interface LeadCaptureFormProps {
  assetSlug: string;
  ctaLabel?: string;
  onSuccess: () => void;
  source?: string;
  emailOnly?: boolean;
}

export function LeadCaptureForm({
  assetSlug,
  ctaLabel = "Download Free Calculator",
  onSuccess,
  source,
  emailOnly = false,
}: LeadCaptureFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [companyWebsite, setCompanyWebsite] = useState("");
  const [hasStarted, setHasStarted] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LeadFormData>({
    resolver: zodResolver(emailOnly ? emailOnlySchema : fullSchema),
  });

  const baseTrackingProps = useMemo(
    () => ({
      form_type: emailOnly ? "lead_capture_email_only" : "lead_capture",
      location: source || "content_download",
      source: source || "content_download",
      asset_slug: assetSlug,
      slug: assetSlug,
      lead_type: "content_download",
      turnstile_configured: isTurnstileConfigured(),
    }),
    [assetSlug, emailOnly, source],
  );

  const getTrackingProps = (email?: string) => ({
    ...baseTrackingProps,
    turnstile_configured: isTurnstileConfigured(),
    ...(email && getEmailDomain(email)
      ? { email_domain: getEmailDomain(email) }
      : {}),
  });

  useEffect(() => {
    trackMarketingEvent("lead_form_view", baseTrackingProps);
  }, [baseTrackingProps]);

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

  const onSubmit = async (data: LeadFormData) => {
    setIsSubmitting(true);
    setSubmitError(null);
    trackMarketingEvent(
      "form_submit_attempted",
      getTrackingProps(data.work_email),
    );

    if (isTurnstileConfigured() && !turnstileToken) {
      setSubmitError("Please complete the verification challenge.");
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
      const body: Record<string, string | undefined> = {
        email: data.work_email,
        asset_slug: assetSlug,
        source: source,
        company_website: companyWebsite || undefined,
        turnstile_token: turnstileToken,
      };

      if (!emailOnly) {
        const full = data as FullFormData;
        body.first_name = full.first_name;
        body.company = full.company || undefined;
      }

      const response = await fetch(
        marketingApiUrl("/api/v1/leads/content-download"),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );

      if (!response.ok) {
        const responseBody = await response.json().catch(() => ({}));
        captureContentDownloadApiFailure(response);
        if (response.status === 429) {
          setSubmitError(
            (responseBody as { detail?: string }).detail ||
              "You already requested this. Check your inbox.",
          );
        } else {
          setSubmitError(
            (responseBody as { detail?: string }).detail ||
              "Something went wrong. Please try again.",
          );
        }
        trackMarketingEvent("form_submit_failed", {
          ...getTrackingProps(data.work_email),
          error_type: response.status === 429 ? "rate_limit" : "api_error",
          status_bucket: getStatusBucket(response.status),
        });
        return;
      }

      identifyMarketingLead(data.work_email, {
        lead_type: "content_download",
        asset_slug: assetSlug,
        source: source || "content_download",
      });
      onSuccess();
    } catch (err) {
      captureContentDownloadFetchFailure(err);
      setSubmitError(
        "Network error. Please check your connection and try again.",
      );
      trackMarketingEvent("form_submit_failed", {
        ...getTrackingProps(data.work_email),
        error_type: "network",
        status_bucket: "network",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit, onInvalid)}
      onFocusCapture={trackFormStarted}
      className="space-y-4"
      noValidate
    >
      <HoneypotField value={companyWebsite} onChange={setCompanyWebsite} />

      {!emailOnly && (
        <div className="space-y-1.5">
          <Label htmlFor="first_name">First name</Label>
          <Input
            id="first_name"
            type="text"
            placeholder="Jane"
            autoComplete="given-name"
            className="h-11"
            {...register("first_name")}
            aria-invalid={!!(errors as { first_name?: unknown }).first_name}
            aria-describedby={
              (errors as { first_name?: unknown }).first_name
                ? "first_name_error"
                : undefined
            }
          />
          {(errors as { first_name?: { message?: string } }).first_name && (
            <p
              id="first_name_error"
              role="alert"
              className="text-sm text-destructive-strong"
            >
              {
                (errors as { first_name?: { message?: string } }).first_name
                  ?.message
              }
            </p>
          )}
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="work_email" className={emailOnly ? "sr-only" : ""}>
          {emailOnly ? "Your work email" : "Work email"}
        </Label>
        <Input
          id="work_email"
          type="email"
          placeholder={
            emailOnly ? "you@yourcompany.com" : "jane@yourcompany.com"
          }
          autoComplete="email"
          inputMode="email"
          className="h-11"
          {...register("work_email")}
          aria-invalid={!!errors.work_email}
          aria-describedby={errors.work_email ? "work_email_error" : undefined}
        />
        {errors.work_email && (
          <p
            id="work_email_error"
            role="alert"
            className="text-sm text-destructive-strong"
          >
            {errors.work_email.message}
          </p>
        )}
      </div>

      {!emailOnly && (
        <div className="space-y-1.5">
          <Label htmlFor="company">
            Company{" "}
            <span className="text-muted-foreground text-xs">(optional)</span>
          </Label>
          <Input
            id="company"
            type="text"
            placeholder="Acme Property Management"
            autoComplete="organization"
            className="h-11"
            {...register("company")}
          />
        </div>
      )}

      {submitError && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive-strong"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{submitError}</span>
        </div>
      )}

      <TurnstileWidget
        onVerify={setTurnstileToken}
        onExpire={() => setTurnstileToken("")}
        className="mb-2"
      />

      <Button
        type="submit"
        className={
          emailOnly
            ? "w-full min-h-[44px] rounded-full"
            : "w-full sm:w-auto min-h-[44px] rounded-full"
        }
        disabled={isSubmitting}
      >
        {isSubmitting && (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
        )}
        {ctaLabel}
      </Button>

      {!emailOnly && (
        <p className="text-center text-xs text-muted-foreground">
          {resourceDeliveryCopy}
        </p>
      )}
    </form>
  );
}
