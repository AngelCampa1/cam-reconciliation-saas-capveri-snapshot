import publicKnowledgeJson from "../../generated/public-knowledge.json";
import type { StableJsonValue } from "./signing";

const productId = "capveri";

type PublicKnowledge = {
  productName: string;
  company: {
    publicDescription: string;
    appUrl: string;
    siteUrl: string;
  };
  pricing: {
    trialDays: number;
    features: Array<{ label: string; tier?: string }>;
    display: {
      selfServeSummary: string;
      launchOfferTerms: string;
    };
    launchOffer: { code: string };
    tiers: Array<{
      id: string;
      name: string;
      tagline: string;
      includedInTrial?: boolean;
      primaryCta?: { href?: string };
      display: { annualLabel: string; limit: string };
      audience: { who: string; portfolio: string };
    }>;
  };
  sources?: Array<{ id: string }>;
  appHelp: {
    topics: Array<{
      id: string;
      title: string;
      summary: string;
      href?: string;
      primaryAction?: string;
      category?: string;
      ctaLabel?: string;
      steps?: Array<{ title: string; body: string }>;
    }>;
    glossary?: Array<{
      id: string;
      term: string;
      plainDefinition: string;
      domainDefinition?: string;
      example?: string;
      relatedTopicIds?: string[];
    }>;
    faqs?: Array<{
      id: string;
      question: string;
      answer: string;
      topicId?: string;
    }>;
    routeHelp: Array<{
      routePattern: string;
      topicIds: string[];
    }>;
    defaultRouteTopicIds: string[];
  };
  claims: {
    items: Array<{ wording: string }>;
  };
  ctas: {
    items: Array<{ id: string; label: string; href: string; intent: string }>;
  };
};

export type MeetingLink = {
  id: string;
  label: string;
  url: string;
  description: string;
};

export type AiSdrProductContext = {
  productId: string;
  name: string;
  description: string;
  sources: Array<{
    id: string;
    title: string;
    url: string;
    excerpt: string;
  }>;
  plans: Array<{
    id: string;
    name: string;
    price: string;
    annualPrice: string;
    discount: string;
    defaultCadence: "year";
    trialDays: number;
    ctaUrl: string;
    features: string[];
  }>;
  meetingLinks: MeetingLink[];
};

export type AiCsAppContext = {
  assistantId: "ai-cs";
  appId: string;
  appName: string;
  authenticatedOnly: true;
  description: string;
  currentPath: string;
  sources: AiSdrProductContext["sources"];
  navigation: Array<{
    label: string;
    path: string;
    description: string;
  }>;
  workflow: Array<{
    id: string;
    label: string;
    status: "current" | "next";
    path?: string;
  }>;
  meetingLinks: MeetingLink[];
  // Teaching layer: plain-language product knowledge the AI-CS assistant uses to
  // explain the product to first-time users. Kept in lockstep with the Ventora
  // ai-cs contract's AiCsConcept / AiCsHowto / AiCsFaq shapes.
  concepts: Array<{
    term: string;
    plainDefinition: string;
    whyItMatters?: string;
    path?: string;
  }>;
  howtos: Array<{
    id: string;
    goal: string;
    prerequisites?: string[];
    steps: Array<{
      n: number;
      instruction: string;
      screen?: string;
      button?: string;
      path?: string;
    }>;
  }>;
  faqs: Array<{
    question: string;
    answer: string;
    path?: string;
  }>;
};

const publicKnowledge = publicKnowledgeJson as PublicKnowledge;

export function buildMeetingLinks(): MeetingLink[] {
  return [];
}

export function buildAiSdrProductContext(): AiSdrProductContext {
  return {
    productId,
    name: publicKnowledge.productName,
    description: publicKnowledge.company.publicDescription,
    sources: buildPublicContextSources(),
    plans: buildPublicPricingPlans(),
    meetingLinks: buildMeetingLinks(),
  };
}

export function productContextAsStableJson(
  context: AiSdrProductContext,
): StableJsonValue {
  return context as unknown as StableJsonValue;
}

export function buildAiCsAppContext(input: {
  currentPath: string;
}): AiCsAppContext {
  const appHelp = publicKnowledge.appHelp;
  const topicsById = new Map(appHelp.topics.map((topic) => [topic.id, topic]));
  const topicIds = topicIdsForPath(appHelp, input.currentPath);
  const workflow = topicIds.flatMap((topicId, index) => {
    const topic = topicsById.get(topicId);
    if (!topic) {
      return [];
    }

    const workflowTopic: AiCsAppContext["workflow"][number] = {
      id: topic.id,
      label: topic.primaryAction || topic.title,
      status: index === 0 ? "current" : "next",
    };

    if (typeof topic.href === "string" && topic.href.startsWith("/")) {
      workflowTopic.path = topic.href;
    }

    return [workflowTopic];
  });

  return {
    assistantId: "ai-cs",
    appId: productId,
    appName: publicKnowledge.productName,
    authenticatedOnly: true,
    description: publicKnowledge.company.publicDescription,
    currentPath: input.currentPath,
    sources: buildPublicContextSources(),
    navigation: buildNavigation(appHelp),
    workflow,
    meetingLinks: buildMeetingLinks(),
    concepts: buildConcepts(appHelp),
    howtos: buildHowtos(appHelp),
    faqs: buildFaqs(appHelp),
  };
}

export function appContextAsStableJson(
  context: AiCsAppContext,
): StableJsonValue {
  return context as unknown as StableJsonValue;
}

export function sanitizeCurrentPath(currentPath: string | null): string {
  if (!currentPath) {
    return "/";
  }

  let parsed: URL;
  try {
    parsed = new URL(currentPath.trim(), "https://app.capveri.com");
  } catch {
    return "/";
  }

  const printablePath = [...(parsed.pathname || "/")]
    .filter((char) => char >= " " && char !== "\u007f")
    .join("");

  return printablePath.startsWith("/")
    ? printablePath.slice(0, 256) || "/"
    : `/${printablePath}`.slice(0, 256) || "/";
}

function buildPublicPricingPlans(): AiSdrProductContext["plans"] {
  const pricing = publicKnowledge.pricing;
  const appBaseUrl = publicKnowledge.company.appUrl.replace(/\/+$/u, "");

  return pricing.tiers.map((tier) => {
    const tierId = tier.id;
    const ctaPath = tier.primaryCta?.href ?? "/auth/register";
    const ctaParams = new URLSearchParams({
      utm_source: "ai_sdr",
      utm_medium: "assistant",
      utm_campaign: "free_trial",
      utm_content: tierId,
      plan: tierId,
      offer: pricing.launchOffer.code,
    });

    return {
      id: tierId,
      name: tier.name,
      price: tier.display.annualLabel,
      annualPrice: tier.display.annualLabel,
      discount: `${pricing.launchOffer.code}: ${pricing.display.launchOfferTerms}`,
      defaultCadence: "year",
      trialDays: tier.includedInTrial ? pricing.trialDays : 0,
      ctaUrl: `${appBaseUrl}${ctaPath}?${ctaParams.toString()}`,
      // Converged with the marketing SDR endpoint: capability labels first, then
      // prospect-fit positioning (tagline, unit limit, audience, portfolio sizing)
      // so the sales chat gets identical context regardless of which endpoint it
      // fetches. Keep this list in lockstep with marketing route.ts buildContext().
      features: [
        ...pricing.features
          .filter((feature) => feature.tier === tierId)
          .map((feature) => feature.label),
        tier.tagline,
        tier.display.limit,
        `Audience: ${tier.audience.who}`,
        `Portfolio: ${tier.audience.portfolio}`,
      ],
    };
  });
}

function buildPublicContextSources(): AiSdrProductContext["sources"] {
  const company = publicKnowledge.company;
  const siteUrl = company.siteUrl.replace(/\/+$/u, "");
  const pricing = publicKnowledge.pricing;
  const sourceIds = new Set(
    (publicKnowledge.sources ?? []).map((source) => source.id),
  );
  const helpTopics = publicKnowledge.appHelp.topics;
  const claims = publicKnowledge.claims.items;
  const sourceDefs = [
    {
      id: "pricing",
      title: "CapVeri pricing",
      url: `${siteUrl}/pricing`,
      excerpt: pricing.display.selfServeSummary,
      canonicalSourceId: "plan-tiers",
    },
    {
      id: "app-help",
      title: "CapVeri app help",
      url: `${siteUrl}/resources/export-guide`,
      excerpt: helpTopics
        .slice(0, 3)
        .map((topic) => topic.summary)
        .join(" "),
      canonicalSourceId: "app-help",
    },
    {
      id: "compliance-claims",
      title: "CapVeri public compliance claims",
      // /security 404s on the live site (only /.well-known/security.txt
      // exists); /sources is the public compliance + claims page.
      url: `${siteUrl}/sources`,
      excerpt: claims
        .slice(0, 5)
        .map((claim) => claim.wording)
        .join(" "),
      canonicalSourceId: "public-compliance",
    },
  ];

  return sourceDefs
    .filter((source) => sourceIds.has(source.canonicalSourceId))
    .map((source) => ({
      id: source.id,
      title: source.title,
      url: source.url,
      excerpt: source.excerpt,
    }));
}

function buildNavigation(
  appHelp: PublicKnowledge["appHelp"],
): AiCsAppContext["navigation"] {
  const navigation: AiCsAppContext["navigation"] = [];
  const seenPaths = new Set<string>();

  for (const topic of appHelp.topics) {
    if (
      typeof topic.href !== "string" ||
      !topic.href.startsWith("/") ||
      seenPaths.has(topic.href)
    ) {
      continue;
    }

    seenPaths.add(topic.href);
    navigation.push({
      label: topic.title,
      path: topic.href,
      description: topic.summary,
    });
  }

  return navigation;
}

// In-app navigation paths are only forwarded when they are real client routes
// (leading slash). Anything else (external URLs, empty) is dropped so the
// assistant never points a beginner at a path that does not exist.
function inAppPath(href: string | undefined): string | undefined {
  return typeof href === "string" && href.startsWith("/") ? href : undefined;
}

// Plain-language definitions of domain terms, sourced from the help glossary.
// The assistant uses these to explain jargon ("gross-up", "GL", "pro-rata")
// before walking a first-time user through a task.
function buildConcepts(
  appHelp: PublicKnowledge["appHelp"],
): AiCsAppContext["concepts"] {
  const glossary = appHelp.glossary ?? [];
  const topicsById = new Map(appHelp.topics.map((topic) => [topic.id, topic]));

  return glossary.map((entry) => {
    const plainDefinition = entry.example
      ? `${entry.plainDefinition} Example: ${entry.example}`
      : entry.plainDefinition;
    const relatedTopic = (entry.relatedTopicIds ?? [])
      .map((topicId) => topicsById.get(topicId))
      .find((topic) => topic !== undefined && inAppPath(topic.href));

    const concept: AiCsAppContext["concepts"][number] = {
      term: entry.term,
      plainDefinition,
    };

    if (entry.domainDefinition) {
      concept.whyItMatters = entry.domainDefinition;
    }

    const path = inAppPath(relatedTopic?.href);
    if (path) {
      concept.path = path;
    }

    return concept;
  });
}

// Step-by-step walkthroughs of core tasks, sourced from help topics that carry
// ordered steps. Each step names the screen and (on the first step) the button
// the user clicks, so the assistant can guide a beginner through the real UI.
function buildHowtos(
  appHelp: PublicKnowledge["appHelp"],
): AiCsAppContext["howtos"] {
  return appHelp.topics
    .filter((topic) => Array.isArray(topic.steps) && topic.steps.length > 0)
    .map((topic) => {
      const path = inAppPath(topic.href);
      const steps = (topic.steps ?? []).map((step, index) => {
        const howtoStep: AiCsAppContext["howtos"][number]["steps"][number] = {
          n: index + 1,
          instruction: `${step.title}: ${step.body}`,
        };

        howtoStep.screen = topic.title;

        if (index === 0 && topic.ctaLabel) {
          howtoStep.button = topic.ctaLabel;
        }

        if (path) {
          howtoStep.path = path;
        }

        return howtoStep;
      });

      return {
        id: topic.id,
        goal: topic.primaryAction || topic.title,
        steps,
      };
    });
}

// Frequently-asked questions with short, grounded answers, sourced from the
// help FAQ list. Empty until the knowledge source supplies FAQs.
function buildFaqs(
  appHelp: PublicKnowledge["appHelp"],
): AiCsAppContext["faqs"] {
  const faqs = appHelp.faqs ?? [];
  const topicsById = new Map(appHelp.topics.map((topic) => [topic.id, topic]));

  return faqs.map((entry) => {
    const faq: AiCsAppContext["faqs"][number] = {
      question: entry.question,
      answer: entry.answer,
    };

    const path = inAppPath(
      entry.topicId ? topicsById.get(entry.topicId)?.href : undefined,
    );
    if (path) {
      faq.path = path;
    }

    return faq;
  });
}

function topicIdsForPath(
  appHelp: PublicKnowledge["appHelp"],
  currentPath: string,
): string[] {
  const canonicalPath = canonicalHelpPath(currentPath);
  const matchingRoute = appHelp.routeHelp.find(
    (route) =>
      canonicalPath === route.routePattern ||
      canonicalPath.startsWith(`${route.routePattern.replace(/\/+$/u, "")}/`),
  );

  return matchingRoute?.topicIds ?? appHelp.defaultRouteTopicIds;
}

function canonicalHelpPath(currentPath: string): string {
  if (
    currentPath.startsWith("/properties/") &&
    currentPath.includes("/reconciliations")
  ) {
    return "/reconciliation";
  }

  return currentPath;
}
