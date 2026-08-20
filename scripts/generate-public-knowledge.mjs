import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const checkOnly = process.argv.includes("--check");

function requireWorkspaceDependency(packageName) {
  const packageJsonPath = require.resolve(`${packageName}/package.json`, {
    paths: [
      repoRoot,
      path.join(repoRoot, "marketing"),
      path.join(repoRoot, "frontend"),
    ],
  });
  return require(path.dirname(packageJsonPath));
}

const tsModule = requireWorkspaceDependency("typescript");
const prettier = requireWorkspaceDependency("prettier");

const sourceDir = path.join(repoRoot, "knowledge", "source");
const generatedDir = path.join(repoRoot, "knowledge", "generated");
const frontendGeneratedDir = path.join(
  repoRoot,
  "frontend",
  "src",
  "generated",
);
const marketingGeneratedDir = path.join(
  repoRoot,
  "marketing",
  "src",
  "generated",
);

function loadSourceModule(relativePath) {
  const absolutePath = path.join(sourceDir, relativePath);
  const source = fs.readFileSync(absolutePath, "utf8");
  const js = tsModule.transpileModule(source, {
    compilerOptions: {
      module: tsModule.ModuleKind.CommonJS,
      target: tsModule.ScriptTarget.ES2022,
    },
    fileName: absolutePath,
  }).outputText;
  const module = { exports: {} };
  const sandbox = {
    module,
    exports: module.exports,
    require: (id) => {
      if (id.startsWith("./")) return {};
      return require(id);
    },
  };
  vm.runInNewContext(js, sandbox, { filename: absolutePath });
  return module.exports;
}

function formatMoney(value) {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

function discountAndRoundUp(value, discountPercent) {
  return Math.ceil(value * (1 - discountPercent / 100));
}

function formatUnitBands(tier) {
  return (tier.unitPricingBands ?? [])
    .map((band) => {
      const rangeLabel =
        band.maxUnits == null
          ? `${band.minUnits}+`
          : `${band.minUnits}-${band.maxUnits}`;
      return `${rangeLabel} units: $${formatMoney(band.pricePerUnitAnnual)} per extra unit/year`;
    })
    .join("; ");
}

function buildPricing(planTiers, ctasById = {}) {
  const trialDays = planTiers.trialDays;
  const promos = planTiers.promos ?? [];
  const activePromo =
    promos.find((p) => p.enabled !== false) ?? promos[0] ?? null;
  const launchOffer = activePromo
    ? {
        checkoutParam: activePromo.checkoutParam,
        code: activePromo.code,
        label: activePromo.label,
        discountPercent: activePromo.discountPercent ?? 0,
        type: activePromo.type,
        endsAt: activePromo.endsAt ?? null,
        endsAtDisplay: activePromo.endsAtDisplay ?? null,
        terms: activePromo.terms ?? `${activePromo.label}.`,
        perks: activePromo.perks ?? [],
        phases: [
          {
            code: activePromo.code,
            label: activePromo.label,
            discountPercent: activePromo.discountPercent ?? 0,
            maxRedemptions: activePromo.maxRedemptions ?? 0,
          },
        ],
      }
    : null;
  const launchOfferMaxRedemptions =
    launchOffer?.phases?.[0]?.maxRedemptions ?? 300;
  const launchOfferTerms = launchOffer ? `${launchOffer.label}.` : "";
  const launchOfferEndsLabel = launchOffer?.endsAtDisplay
    ? `Offer ends ${launchOffer.endsAtDisplay}.`
    : null;
  // Year-qualified deadline for machine-readable artifacts (pricing.md/txt, notes)
  // where an unambiguous date matters more than matching the on-page short form.
  const launchOfferEndsLabelFull =
    launchOffer?.endsAtDisplay && launchOffer?.endsAt
      ? `Offer ends ${launchOffer.endsAtDisplay}, ${new Date(launchOffer.endsAt).getUTCFullYear()}.`
      : null;
  const tiers = planTiers.tiers.map((tier) => {
    const launchAnnual =
      tier.baseAnnual != null
        ? discountAndRoundUp(tier.baseAnnual, launchOffer.discountPercent)
        : null;
    const annualLabel =
      launchAnnual == null
        ? "Custom"
        : `starts at $${formatMoney(launchAnnual)}/year with ${launchOffer.code}`;
    const primaryCta = ctasById[tier.primaryCtaId] ?? null;
    return {
      ...tier,
      launchAnnual,
      primaryCta,
      display: {
        annualLabel,
        limit:
          tier.maxUnits == null
            ? `Minimum subscription includes up to ${tier.includedUnits} active rentable units`
            : `Up to ${tier.maxUnits} active rentable units`,
        schemaPrice: launchAnnual == null ? null : launchAnnual.toFixed(2),
        listAnnualLabel:
          tier.baseAnnual == null
            ? "Custom"
            : `starts at $${formatMoney(tier.baseAnnual)}/year`,
        unitBandLabel: formatUnitBands(tier),
      },
    };
  });
  const tierById = Object.fromEntries(tiers.map((tier) => [tier.id, tier]));
  const selfServeTiers = tiers;
  const tierNames = selfServeTiers.map((tier) => tier.name);
  const tierAnnualList = selfServeTiers
    .map(
      (tier) =>
        `${tier.name} ${tier.display.annualLabel}; list price ${tier.display.listAnnualLabel} for up to ${tier.includedUnits} rentable units`,
    )
    .join(". ");
  const tierLimits = selfServeTiers
    .map((tier) =>
      tier.maxUnits == null
        ? `${tier.name}: ${tier.display.limit}; ${tier.display.unitBandLabel}`
        : `${tier.name}: ${tier.maxUnits} active rentable units`,
    )
    .join(", ");
  const enterpriseThreshold = planTiers.enterpriseThreshold.summary;
  const launchOfferLabel = `${launchOffer.code}: ${launchOffer.label}`;

  const pricingFaqs = [
    {
      question: "Is there a free trial?",
      answer: `Yes. Reconcile includes a ${trialDays}-day free trial. No credit card is required to start. Add annual billing before the trial ends to keep access.`,
    },
    {
      question: "How much does CapVeri cost?",
      answer: `With ${launchOffer.code}: ${tierAnnualList}. ${enterpriseThreshold}`,
    },
    {
      question: "How many rentable units can I add?",
      answer: `${tierLimits}. The annual price is calculated from the unit count selected during signup.`,
    },
    {
      question: "What's included?",
      answer:
        "Reconcile includes GL import, lease setup, CAM reconciliation, exception summaries, portfolio dashboards, cap tracking, exports, tenant portal workflows, and audit support tools.",
    },
    {
      question: "Can I change my unit count?",
      answer: `Yes. ${tierNames.join(", ")} pricing is based on active rentable units. Update your unit count when your portfolio changes so the subscription matches your portfolio.`,
    },
    {
      question: "What happens after the trial ends?",
      answer:
        "If you add annual billing before the trial ends, your selected package continues. If no payment method is on file, access pauses until billing is added.",
    },
    {
      question: "What file formats do you accept?",
      answer:
        "CSV and Excel files from any property management system: Yardi, MRI, AppFolio, RealPage, or anything that exports spreadsheets. No API integrations, no IT setup calls.",
    },
    {
      question: "Can I see the price before I buy?",
      answer: `Yes. ${enterpriseThreshold} Enter your rentable unit count on the pricing page to see the annual price before checkout.`,
    },
    {
      question: "How is this different from Yardi or MRI?",
      answer:
        "Yardi and MRI are property management systems. CapVeri is an export-based verification layer for CAM reconciliation: export GL, rent roll, and lease data, upload it, map lease terms, run deterministic checks, and export tenant-ready support. No API integration, IT project, or ERP replacement.",
    },
    {
      question: "Can I cancel anytime?",
      answer:
        "Yes. Cancel from your account settings at any time and your subscription ends at the close of the current billing cycle. During the free trial, canceling stops all future charges immediately.",
    },
    {
      question: "What happens after my first paid invoice?",
      answer:
        "Your annual Reconcile subscription starts after the free trial if billing is added. You have a 30-day money-back guarantee on your first paid invoice.",
    },
    {
      question: "How does the money-back guarantee work?",
      answer:
        "Not happy after your first paid invoice? Request a refund from billing within 30 days. We refund that invoice and cancel the subscription.",
    },
    {
      question: "Is my GL data sent to a third-party AI?",
      answer:
        "Financial calculations are deterministic. AI-assisted extraction is advisory and focused on lease-term review before values are used in reconciliation workflows.",
    },
    {
      question: "Is there a setup fee or implementation project?",
      answer:
        "No. There is no setup fee, consultant, or IT involvement. Upload ERP exports and lease files, confirm mappings and lease inputs, then run the reconciliation workflow.",
    },
  ];

  const schemaOffers = [
    {
      "@type": "Offer",
      name: `${trialDays}-Day Free Trial`,
      price: "0",
      priceCurrency: "USD",
      description: `Full access for ${trialDays} days. No credit card required. Add billing before the trial ends to keep access.`,
    },
    ...tiers.map((tier) => {
      const offer = {
        "@type": "Offer",
        name: tier.name,
        description: `${tier.description} ${tier.name} ${tier.display.annualLabel}. List price ${tier.display.listAnnualLabel}. ${tier.display.unitBandLabel}`,
        priceCurrency: "USD",
      };
      if (tier.display.schemaPrice !== null) {
        offer.price = tier.display.schemaPrice;
      }
      return offer;
    }),
  ];

  const schemaOffersByTier = Object.fromEntries(
    tiers.map((tier) => {
      const offer = {
        "@type": "Offer",
        name: tier.name,
        description: `${tier.description} ${tier.name} ${tier.display.annualLabel}. List price ${tier.display.listAnnualLabel}. ${tier.display.unitBandLabel}`,
        priceCurrency: "USD",
      };
      if (tier.display.schemaPrice !== null) {
        offer.price = tier.display.schemaPrice;
      }
      return [tier.id, offer];
    }),
  );

  const pricingSummary = `${tierAnnualList}. ${enterpriseThreshold}`;

  return {
    model: planTiers.model,
    lastUpdated: planTiers.lastUpdated,
    trialDays,
    launchOffer,
    promos,
    enterpriseThreshold: planTiers.enterpriseThreshold,
    tiers,
    features: planTiers.features,
    pricingFaqs,
    schemaOffers,
    schemaOffersByTier,
    display: {
      selfServeSummary: `${tierById.reconcile.name} ${tierById.reconcile.display.annualLabel}. List price ${tierById.reconcile.display.listAnnualLabel} for up to ${tierById.reconcile.includedUnits} rentable units. ${tierById.reconcile.display.unitBandLabel}. ${launchOfferTerms}`,
      enterpriseThreshold,
      trialLabel: `${trialDays}-day free trial`,
      trialTitleLabel: `${trialDays}-Day Free Trial`,
      trialCopy: `${trialDays}-day free trial. No credit card required to start. Add annual billing before the trial ends to keep access.`,
      launchOfferLabel,
      launchOfferTerms,
      launchOfferEndsLabel,
      launchOfferEndsLabelFull,
      annualSummary: `${tierAnnualList}. ${launchOfferTerms}`,
      tierPriceLabels: Object.fromEntries(
        tiers.map((tier) => [tier.id, tier.display.annualLabel]),
      ),
      tierAnnualPriceLabels: Object.fromEntries(
        tiers.map((tier) => [tier.id, tier.display.annualLabel]),
      ),
    },
  };
}

function buildLandingFaqs(landingFaqs, pricing) {
  return landingFaqs.map((faq) => {
    if (faq.id === "landing-trial") {
      return {
        ...faq,
        answer: `${pricing.trialDays}-day free trial. No credit card required to start. Add annual billing before the trial ends to keep access.`,
      };
    }
    if (faq.id === "landing-pricing") {
      const selfServeTiers = pricing.tiers.filter(
        (tier) => tier.baseAnnual !== null,
      );
      return {
        ...faq,
        answer: `${pricing.display.annualSummary} It applies only to subscriptions. List prices are ${selfServeTiers
          .map((tier) => `${tier.name}: ${tier.display.listAnnualLabel}`)
          .join(", ")}. ${pricing.enterpriseThreshold.summary}`,
      };
    }
    return faq;
  });
}

function sanitizePublicText(value) {
  return value
    .replace(/Ã¢â‚¬â€|\u2014|\u2013/g, "-")
    .replace(/Ã¢â‚¬â„¢|â€™/g, "'")
    .replace(/Ã¢â‚¬Å“|â€œ/g, '"')
    .replace(/Ã¢â‚¬Â|â€/g, '"')
    .replace(/Ã¢â‚¬Â¦|â€¦/g, "...")
    .replace(/AI-powered lease reading/g, "AI-assisted lease extraction")
    .replace(
      /Our document-reader providers are configured so API inputs are not retained for model training where zero-data-retention is available\. Lease PDFs and extracted lease text are processed for structured extraction and then discarded according to provider policy\./g,
      "Customer data is not used to train models. Lease PDFs and extracted lease text are processed for structured extraction under product data-handling controls, and users review extracted values before financial use.",
    )
    .replace(
      /The only data processed by AI is OCR text extracted from uploaded lease PDF documents - and that's covered by the zero-data-retention agreement\./g,
      "AI-assisted processing is limited to OCR text extracted from uploaded lease PDF documents for lease-term review.",
    )
    .replace(
      /The only data processed by AI is OCR text extracted from uploaded lease PDF documents, and that's covered by the zero-data-retention agreement\./g,
      "AI-assisted processing is limited to OCR text extracted from uploaded lease PDF documents for lease-term review.",
    )
    .replace(/zero-data-retention agreement/g, "data-handling controls")
    .replace(/zero-data-retention/g, "data-handling")
    .replace(/fully BOMA 2024 compliant/g, "BOMA 2024 aligned")
    .replace(
      /BOMA 2024 compliant calculations/g,
      "BOMA 2024 aligned calculation workflows",
    )
    .replace(
      /BOMA-compliant calculations/g,
      "BOMA-aligned calculation workflows",
    )
    .replace(/TLS 1\.3 encryption/g, "encryption")
    .replace(/AES-256 encryption/g, "encryption")
    .replace(
      /One tenant can never see another tenant's data, even through a software bug\./g,
      "Customer records remain separated by organization.",
    )
    .replace(/Custom SLA/g, "Custom support terms")
    .replace(/white-glove onboarding/g, "onboarding support")
    .replace(
      /customer data is not used to train models/gi,
      "AI-assisted extraction remains advisory and human-reviewed",
    )
    .replace(
      /AI GL analysis \+ CapEx screening/g,
      "GL narrative review + CapEx screening",
    );
}

function sanitizePublicKnowledge(value) {
  if (typeof value === "string") return sanitizePublicText(value);
  if (Array.isArray(value)) return value.map(sanitizePublicKnowledge);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        sanitizePublicKnowledge(item),
      ]),
    );
  }
  return value;
}

function resolveKnowledgeTokens(value, pricing) {
  if (typeof value === "string") {
    return value
      .replaceAll("{{pricing.trialCopy}}", pricing.display.trialCopy)
      .replaceAll("{{pricing.trialLabel}}", pricing.display.trialLabel)
      .replaceAll("{{pricing.trialDays}}", String(pricing.trialDays));
  }
  if (Array.isArray(value)) {
    return value.map((item) => resolveKnowledgeTokens(item, pricing));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        resolveKnowledgeTokens(item, pricing),
      ]),
    );
  }
  return value;
}

function buildKnowledge() {
  const product = loadSourceModule("product.ts");
  const appHelp = loadSourceModule("app-help.ts");
  const marketingFaqs = loadSourceModule("marketing-faqs.ts");
  const planTiers = JSON.parse(
    fs.readFileSync(path.join(repoRoot, "plan-tiers.json"), "utf8"),
  );

  const contactsById = Object.fromEntries(
    product.publicContacts.map((contact) => [contact.id, contact]),
  );
  const ctasById = Object.fromEntries(
    product.publicCtas.map((cta) => [cta.id, cta]),
  );
  const pricing = buildPricing(planTiers, ctasById);
  const claimsById = Object.fromEntries(
    product.publicClaims.map((claim) => [claim.id, claim]),
  );
  const structuredData = {
    organization: {
      "@context": "https://schema.org",
      "@type": "Organization",
      "@id": `${product.companyProfile.siteUrl}/#organization`,
      name: product.companyProfile.name,
      legalName: product.companyProfile.legalName,
      url: product.companyProfile.siteUrl,
      logo: `${product.companyProfile.siteUrl}${product.companyProfile.logoPath}`,
      description: product.companyProfile.description,
      sameAs: product.companyProfile.sameAs,
      foundingDate: product.companyProfile.foundingDate,
      contactPoint: product.publicContacts.map((contact) => ({
        "@type": "ContactPoint",
        contactType: contact.label,
        email: contact.email,
      })),
    },
    softwareApplication: {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: product.companyProfile.name,
      applicationCategory: "BusinessApplication",
      applicationSubCategory: "CRE Financial Operations Software",
      operatingSystem: "Web",
      dateModified: "2026-03-27",
      description: product.companyProfile.description,
      offers: pricing.schemaOffers.map((offer) => ({
        ...offer,
        availability: "https://schema.org/InStock",
        url: `${product.companyProfile.siteUrl}/pricing`,
      })),
    },
    pricingOffers: pricing.schemaOffers.map((offer) => ({
      ...offer,
      availability: "https://schema.org/InStock",
      url: `${product.companyProfile.siteUrl}/pricing`,
    })),
  };
  const marketingInfra = {
    llms: {
      siteUrl: product.companyProfile.siteUrl,
      condensedDescription: product.companyProfile.publicDescription,
      fullDescription:
        "CapVeri helps property managers and landlords verify year-end CAM reconciliations without replacing Yardi, MRI, AppFolio, or RealPage.",
    },
    pricingArtifacts: {
      trialCopy: pricing.display.trialCopy,
      notes: [
        `Reconcile includes a ${pricing.trialDays}-day free trial. No credit card is required to start. Use ${pricing.launchOffer.code} for ${pricing.display.launchOfferTerms}${
          pricing.display.launchOfferEndsLabelFull
            ? ` ${pricing.display.launchOfferEndsLabelFull}`
            : ""
        }`,
        pricing.display.enterpriseThreshold,
        product.publicClaims.find(
          (claim) => claim.id === "money-back-guarantee",
        )?.wording,
        product.publicClaims.find((claim) => claim.id === "erp-export-workflow")
          ?.wording,
      ].filter(Boolean),
    },
  };
  const appHelpAssistant = {
    routeHelp: appHelp.routeHelp,
    defaultRouteTopicIds: appHelp.defaultRouteTopicIds,
    topics: appHelp.appHelpTopics,
    glossary: appHelp.glossaryTerms,
    fieldHelp: appHelp.fieldHelp,
    escalation: product.contactEscalations,
    contacts: product.publicContacts,
    guardrails: product.assistantGuardrails.filter((guardrail) =>
      ["public-safe-only", "ai-claims", "compliance-claims"].includes(
        guardrail.id,
      ),
    ),
  };

  const salesAssistant = {
    productFacts: product.productFacts,
    pricing,
    contacts: product.publicContacts,
    competitors: product.competitorPositioning,
    qualificationPrompts: [
      "Which ERP or accounting system exports your GL and rent roll today?",
      "How many rentable units or buildings are in scope?",
      "Are you trying to verify annual CAM close, prepare tenant packets, or reduce dispute risk?",
      "What rentable unit count should the pricing calculator use?",
    ],
    objections: product.competitorPositioning.map((item) => ({
      id: item.id,
      objection: `We already use ${item.name}.`,
      response: item.objectionResponse,
    })),
    ctas: product.publicCtas,
    escalation: product.contactEscalations,
    guardrails: product.assistantGuardrails,
  };

  const knowledge = {
    schemaVersion: 1,
    productName: "CapVeri",
    sources: product.knowledgeSources,
    company: product.companyProfile,
    contacts: {
      items: product.publicContacts,
      byId: contactsById,
    },
    ctas: {
      items: product.publicCtas,
      byId: ctasById,
    },
    claims: {
      items: product.publicClaims,
      byId: claimsById,
    },
    support: {
      contacts: product.publicContacts,
      escalation: product.contactEscalations,
    },
    marketingInfra,
    resources: {
      facts: product.resourceFacts,
    },
    structuredData,
    productFacts: product.productFacts,
    pricing,
    publicMessaging: product.publicMessaging,
    marketing: {
      landingFaqs: buildLandingFaqs(product.landingFaqs, pricing),
      faqCategories: marketingFaqs.marketingFaqCategories,
      competitors: product.competitorPositioning,
      contactEscalations: product.contactEscalations,
      guardrails: product.assistantGuardrails,
    },
    appHelp: {
      topics: appHelp.appHelpTopics,
      guides: appHelp.appHelpGuides,
      categories: [
        ...new Set(appHelp.appHelpTopics.map((topic) => topic.category)),
      ],
      glossary: appHelp.glossaryTerms,
      faqs: appHelp.appHelpFaqs,
      fieldHelp: appHelp.fieldHelp,
      routeHelp: appHelp.routeHelp,
      defaultRouteTopicIds: appHelp.defaultRouteTopicIds,
    },
    salesAssistant,
    appHelpAssistant,
    featureDomains: product.featureDomains,
    productFeatures: product.productFeatures,
    seoFeatureList: product.seoFeatureList,
  };
  return sanitizePublicKnowledge(resolveKnowledgeTokens(knowledge, pricing));
}

function tsContent(knowledge, options = {}) {
  const includeJsonPayload = options.includeJsonPayload === true;
  return `/* AUTO-GENERATED by scripts/generate-public-knowledge.mjs - edit knowledge/source/*.ts or plan-tiers.json instead */

export type PublicKnowledge = typeof publicKnowledge;

export const publicKnowledge = ${JSON.stringify(knowledge, null, 2)} as const;
${
  includeJsonPayload
    ? `\nexport const PUBLIC_KNOWLEDGE_JSON = ${JSON.stringify(
        JSON.stringify(knowledge),
      )};\n`
    : ""
}

export default publicKnowledge;
`;
}

async function formatTypeScript(content, filePath) {
  const config = (await prettier.resolveConfig(filePath)) ?? {};
  return prettier.format(content, {
    ...config,
    filepath: filePath,
    parser: "typescript",
  });
}

function writeOrCheck(filePath, content) {
  if (checkOnly) {
    if (!fs.existsSync(filePath)) {
      throw new Error(
        `Missing generated file: ${path.relative(repoRoot, filePath)}`,
      );
    }
    const current = fs.readFileSync(filePath, "utf8");
    if (current !== content) {
      throw new Error(
        `Generated file is stale: ${path.relative(repoRoot, filePath)}`,
      );
    }
    return;
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

const knowledge = buildKnowledge();
const json = `${JSON.stringify(knowledge, null, 2)}\n`;
const rootTsPath = path.join(generatedDir, "public-knowledge.ts");
const backendJsonPath = path.join(
  repoRoot,
  "backend",
  "app",
  "generated",
  "public-knowledge.json",
);
// The Cloudflare backend serves the AI-CS signed app-context from this copy. It is a
// generator output (not a hand-synced file) so AI-CS knowledge can never drift stale.
const cloudflareBackendJsonPath = path.join(
  repoRoot,
  "cloudflare-backend",
  "src",
  "generated",
  "public-knowledge.json",
);
const frontendTsPath = path.join(frontendGeneratedDir, "public-knowledge.ts");
const marketingTsPath = path.join(marketingGeneratedDir, "public-knowledge.ts");
const tsOutput = await formatTypeScript(
  tsContent(knowledge, { includeJsonPayload: true }),
  rootTsPath,
);
const frontendRuntimeTsOutput = await formatTypeScript(
  tsContent(knowledge),
  frontendTsPath,
);
const marketingRuntimeTsOutput = await formatTypeScript(
  tsContent(knowledge),
  marketingTsPath,
);

writeOrCheck(path.join(generatedDir, "public-knowledge.json"), json);
writeOrCheck(backendJsonPath, json);
writeOrCheck(cloudflareBackendJsonPath, json);
writeOrCheck(rootTsPath, tsOutput);
writeOrCheck(frontendTsPath, frontendRuntimeTsOutput);
writeOrCheck(marketingTsPath, marketingRuntimeTsOutput);

console.log(
  checkOnly
    ? "Generated public knowledge artifacts are current."
    : "Generated public knowledge artifacts.",
);
