export interface ForRoleMenuItem {
  href: string;
  label: string;
  description: string;
}

// Static nav mirror of marketing/data/personas.json. Keep slugs and labels in
// sync with that data file when personas are added or renamed.
export const forRoleMenuItems: ForRoleMenuItem[] = [
  {
    href: "/for/property-controller",
    label: "Property Controller",
    description: "Check every building before you send.",
  },
  {
    href: "/for/cfo-financial-controller",
    label: "CFO / Controller",
    description: "See leakage and audit risk in one view.",
  },
  {
    href: "/for/lease-administrator",
    label: "Lease Administrator",
    description: "Match the math to every lease.",
  },
  {
    href: "/for/property-accountant",
    label: "Property Accountant",
    description: "Catch GL coding errors before close.",
  },
  {
    href: "/for/asset-manager",
    label: "Asset Manager",
    description: "Find CAM leakage that cuts NOI.",
  },
  {
    href: "/for/director-property-management",
    label: "Director of PM",
    description: "Give your team one CAM process.",
  },
];
