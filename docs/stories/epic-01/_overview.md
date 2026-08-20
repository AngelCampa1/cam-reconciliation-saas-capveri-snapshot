# Epic 1: Design System & UI Foundation - Overview

## Purpose and Business Value

Establish consistent, polished UI components before building features. UX quality starts here.

A design system ensures visual consistency, reduces decision fatigue, and speeds up development. By establishing tokens, components, and patterns upfront, every subsequent UI story inherits quality.

## Delivers

- Tailwind CSS with custom design tokens
- Shadcn/UI components customized for CapVeri brand
- Layout shell (sidebar, header, content area)
- Core UI patterns (forms, tables, modals, toasts)
- Loading and error states
- Accessibility standards (WCAG 2.1 AA)

## Dependencies

- Epic 0 (frontend environment must be configured)

## Stories

| ID | Title | Estimated Hours | Status |
|----|-------|----------------|--------|
| 1.1 | Install and Configure Tailwind | 2 | pending |
| 1.2 | Define Design Tokens | 3 | pending |
| 1.3 | Install Shadcn/UI | 2 | pending |
| 1.4 | Customize Shadcn Theme | 3 | pending |
| 1.5 | Create Application Shell | 4 | pending |
| 1.6 | Create Sidebar Navigation | 3 | pending |
| 1.7 | Create Page Header Component | 2 | pending |
| 1.8 | Create Form Components | 4 | pending |
| 1.9 | Create Data Table Component | 4 | pending |
| 1.10 | Create Modal/Dialog Component | 2 | pending |
| 1.11 | Create Toast Notification System | 2 | pending |
| 1.12 | Create Loading States | 2 | pending |
| 1.13 | Create Error Boundary | 2 | pending |
| 1.14 | Create Empty States | 2 | pending |

**Total Estimated Hours: 37**

## Epic Completion Checklist

When all stories are complete, verify:

- [ ] All Shadcn components render correctly
- [ ] Design tokens applied consistently (no hardcoded colors)
- [ ] Layout responsive at all breakpoints
- [ ] Accessibility audit passes (keyboard nav, focus states)
- [ ] Loading and error states implemented

## CLAUDE.md Additions

After completing this epic, add the following to `CLAUDE.md`:

### Design System Rules

**Colors**
- All colors must use design token CSS variables
- NO hardcoded hex values (use `bg-primary`, `text-error`, etc.)
- Use semantic colors for their purpose (error for errors, success for success)

**Components**
- Use Shadcn/UI components from `@/components/ui/`
- Do NOT install other UI libraries (no MUI, Chakra, etc.)
- Extend existing components rather than creating duplicates

**Accessibility**
- All new UI must pass WCAG 2.1 AA
- All interactive elements must have visible focus states
- All images must have alt text
- Use semantic HTML (proper heading hierarchy, landmarks)

**Spacing**
- Use Tailwind spacing scale (4px grid)
- Consistent padding: `p-4` for cards, `p-6` for page sections
- Consistent gaps: `gap-4` for form fields, `gap-6` for sections
