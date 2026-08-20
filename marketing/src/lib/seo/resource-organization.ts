export interface ResourceHubLink {
  label: string;
  href: string;
  description?: string;
}

export interface ResourceMegamenuPillar extends ResourceHubLink {
  id: ResourceHubId;
}

export type ResourceHubId =
  | "cam-guides"
  | "tools-calculators"
  | "compliance-leases"
  | "solutions"
  | "blog-research";

export const resourceMegamenuHubs: ResourceMegamenuPillar[] = [
  {
    id: "cam-guides",
    label: "CAM Guides",
    href: "/resources/cam-guides",
    description: "Reconciliation, charges, audits, disputes, and workflows.",
  },
  {
    id: "tools-calculators",
    label: "Tools & Calculators",
    href: "/resources/tools-calculators",
    description:
      "Gross-up, pro-rata, cap calculators, and statement templates.",
  },
  {
    id: "compliance-leases",
    label: "Compliance & Leases",
    href: "/resources/compliance-leases",
    description:
      "State requirements, BOMA standards, lease types, and expenses.",
  },
  {
    id: "solutions",
    label: "Solutions",
    href: "/resources/solutions",
    description: "Portfolio fit, ROI analysis, case studies, and role guides.",
  },
  {
    id: "blog-research",
    label: "Blog & Research",
    href: "/resources/blog-research",
    description: "CAM analysis, glossary, integrations, and industry sources.",
  },
];

export const resourcesMegamenuPillars = resourceMegamenuHubs;

export function getResourceHub(id: ResourceHubId): ResourceMegamenuPillar {
  return resourceMegamenuHubs.find((hub) => hub.id === id)!;
}
