"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, MailX, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { publicKnowledge } from "@/generated/public-knowledge";
import { marketingApiUrl } from "@/lib/api";
import { buildSiteUrl } from "@/lib/site";

type UiState = "idle" | "loading" | "success" | "error";

function UnsubscribeForm() {
  const searchParams = useSearchParams();
  const e = searchParams.get("e");
  const t = searchParams.get("t");
  const hasValidParams = Boolean(e && t);

  const [state, setState] = useState<UiState>(
    hasValidParams ? "idle" : "error",
  );
  const [errorMessage, setErrorMessage] = useState<string>(
    hasValidParams
      ? `This unsubscribe link is invalid or has already been used. If you're still receiving emails, contact ${publicKnowledge.contacts.byId.unsubscribe.email}.`
      : `This unsubscribe link is invalid or expired. If you're still receiving emails, contact ${publicKnowledge.contacts.byId.unsubscribe.email}.`,
  );

  async function handleUnsubscribe() {
    if (!e || !t) return;

    setState("loading");
    try {
      const res = await fetch(
        marketingApiUrl(
          `/api/v1/leads/unsubscribe?e=${encodeURIComponent(e)}&t=${encodeURIComponent(t)}`,
        ),
        { method: "POST" },
      );

      if (res.ok) {
        setState("success");
      } else {
        setErrorMessage(
          `This unsubscribe link is invalid or has already been used. If you're still receiving emails, contact ${publicKnowledge.contacts.byId.unsubscribe.email}.`,
        );
        setState("error");
      }
    } catch {
      setErrorMessage(
        `Something went wrong. Please try again or contact ${publicKnowledge.contacts.byId.unsubscribe.email}.`,
      );
      setState("error");
    }
  }

  return (
    <div className="max-w-lg mx-auto py-20 pb-24 px-4 sm:px-6 text-center">
      {state === "idle" && (
        <>
          <div className="flex justify-center mb-6">
            <MailX className="h-14 w-14 text-muted-foreground" />
          </div>
          <h1 className="text-3xl font-bold mb-4">Unsubscribe</h1>
          <p className="text-muted-foreground mb-8">
            Click the button below to unsubscribe your email address from
            CapVeri marketing emails. This action cannot be undone.
          </p>
          <Button
            size="lg"
            variant="destructive"
            onClick={handleUnsubscribe}
            className="w-full sm:w-auto"
          >
            Confirm Unsubscribe
          </Button>
        </>
      )}

      {state === "loading" && (
        <>
          <div className="flex justify-center mb-6">
            <Loader2 className="h-14 w-14 text-muted-foreground animate-spin" />
          </div>
          <h1 className="text-3xl font-bold mb-4">Processing…</h1>
          <p className="text-muted-foreground">
            Removing you from our mailing list.
          </p>
        </>
      )}

      {state === "success" && (
        <>
          <div className="flex justify-center mb-6">
            <CheckCircle2 className="h-14 w-14 text-green-500" />
          </div>
          <h1 className="text-3xl font-bold mb-4">
            You&apos;ve been unsubscribed
          </h1>
          <p className="text-muted-foreground mb-8">
            You won&apos;t receive further marketing emails from CapVeri.
          </p>
          <a
            href={buildSiteUrl("/")}
            className="text-primary underline underline-offset-4 hover:text-primary/80 transition-colors"
          >
            Return to CapVeri.com
          </a>
        </>
      )}

      {state === "error" && (
        <>
          <div className="flex justify-center mb-6">
            <AlertCircle className="h-14 w-14 text-destructive" />
          </div>
          <h1 className="text-3xl font-bold mb-4">Link unavailable</h1>
          <p className="text-muted-foreground">{errorMessage}</p>
        </>
      )}
    </div>
  );
}

export function UnsubscribeClient() {
  return (
    <Suspense
      fallback={
        <div className="max-w-lg mx-auto py-20 pb-24 px-4 sm:px-6 text-center">
          <Loader2 className="h-14 w-14 text-muted-foreground animate-spin mx-auto mb-6" />
          <p className="text-muted-foreground">Loading…</p>
        </div>
      }
    >
      <UnsubscribeForm />
    </Suspense>
  );
}
