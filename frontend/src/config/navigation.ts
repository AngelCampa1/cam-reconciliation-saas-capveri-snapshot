import {
  ArrowLeftRight,
  BarChart3,
  Building2,
  Calculator,
  FileText,
  HelpCircle,
  Home,
  Landmark,
  Layers3,
  MessageSquare,
  MessageSquareWarning,
  PieChart,
  Shield,
  Settings,
  TrendingUp,
  Upload,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { UserRole, type UserRole as UserRoleType } from '@/types/enums'

/**
 * Navigation item definition for sidebar navigation.
 * Supports nested children for expandable sections.
 */
export interface NavItemConfig {
  /** Unique identifier for the nav item */
  id: string
  /** Display label */
  label: string
  /** Lucide icon component */
  icon: LucideIcon
  /** Navigation path/URL */
  href: string
  /** Child navigation items for nested/expandable sections */
  children?: NavItemConfig[]
  /** Only these roles can see this item (if empty, all roles can see) */
  requiredRoles?: UserRoleType[]
  /** These roles cannot see this item */
  hideForRoles?: UserRoleType[]
}

/**
 * Main navigation items - core application features
 */
export const mainNavigation: NavItemConfig[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: Home,
    // The authenticated dashboard is served at /dashboard ('/' only redirects
    // there). Using '/' here meant the sidebar's active-state match
    // (pathname === href || startsWith(href + '/')) never fired on /dashboard,
    // so Dashboard never got its active styling or aria-current. Match the real
    // route — consistent with the bottom-nav config, which already uses it.
    href: '/dashboard',
  },
  {
    id: 'portfolio',
    label: 'Portfolio',
    icon: Building2,
    href: '/portfolio',
    children: [
      {
        id: 'portfolio-overview',
        label: 'Overview',
        icon: Building2,
        href: '/portfolio',
      },
      {
        id: 'portfolio-pipeline',
        label: 'Pipeline',
        icon: TrendingUp,
        href: '/portfolio/pipeline',
      },
    ],
  },
  {
    id: 'properties',
    label: 'Properties',
    icon: Landmark,
    href: '/properties',
  },
  {
    id: 'reconciliations',
    label: 'Reconciliations',
    icon: Calculator,
    href: '/reconciliations',
  },
  {
    id: 'pools',
    label: 'Expense Pools',
    icon: Layers3,
    href: '/pools',
  },
  {
    id: 'analysis',
    label: 'Analysis',
    icon: BarChart3,
    href: '/analysis/year-over-year',
    children: [
      {
        id: 'analysis-yoy',
        label: 'Year-over-Year',
        icon: BarChart3,
        href: '/analysis/year-over-year',
      },
      {
        id: 'analysis-trends',
        label: 'Trends',
        icon: PieChart,
        href: '/analysis/trends',
      },
      {
        id: 'analysis-compare',
        label: 'Compare systems',
        icon: ArrowLeftRight,
        href: '/compare',
      },
    ],
  },
  {
    id: 'documents',
    label: 'Documents',
    icon: Upload,
    href: '/ingestion',
    children: [
      {
        id: 'documents-upload-gl',
        label: 'Upload GL',
        icon: Upload,
        href: '/ingestion',
      },
      {
        id: 'documents-upload-lease',
        label: 'Upload Leases',
        icon: FileText,
        href: '/leases/upload',
      },
      {
        id: 'documents-extractions',
        label: 'Extractions',
        icon: FileText,
        href: '/extractions',
      },
      {
        id: 'documents-upload-rent-roll',
        label: 'Upload Rent Roll',
        icon: Users,
        href: '/rent-roll/upload',
        requiredRoles: [UserRole.OWNER, UserRole.ADMIN],
      },
    ],
  },
  {
    id: 'disputes',
    label: 'Disputes',
    icon: MessageSquareWarning,
    href: '/disputes',
  },
  {
    id: 'tax-protest',
    label: 'Tax Protest',
    icon: Shield,
    href: '/tax-protest',
  },
  {
    id: 'help',
    label: 'Help',
    icon: HelpCircle,
    href: '/help',
  },
]

/**
 * Secondary navigation items - settings and team management
 */
export const secondaryNavigation: NavItemConfig[] = [
  {
    id: 'settings',
    label: 'Settings',
    icon: Settings,
    href: '/settings/profile',
    children: [
      {
        id: 'settings-profile',
        label: 'Profile',
        icon: Settings,
        href: '/settings/profile',
      },
      {
        id: 'settings-organization',
        label: 'Organization',
        icon: Building2,
        href: '/settings/organization',
        requiredRoles: [UserRole.OWNER, UserRole.ADMIN],
      },
      {
        id: 'settings-team',
        label: 'Team Members',
        icon: Users,
        href: '/settings/team',
        requiredRoles: [UserRole.OWNER, UserRole.ADMIN],
      },
      {
        id: 'settings-billing',
        label: 'Billing',
        icon: FileText,
        href: '/settings/billing',
      },
    ],
  },
  {
    id: 'admin',
    label: 'Admin',
    icon: MessageSquare,
    href: '/admin/feedback',
    requiredRoles: [UserRole.OWNER, UserRole.ADMIN],
    children: [
      {
        id: 'admin-feedback',
        label: 'Feedback',
        icon: MessageSquare,
        href: '/admin/feedback',
        requiredRoles: [UserRole.OWNER, UserRole.ADMIN],
      },
    ],
  },
]

/**
 * Get all navigation items (main + secondary)
 */
export function getAllNavigation(): NavItemConfig[] {
  return [...mainNavigation, ...secondaryNavigation]
}

/**
 * Find a navigation item by ID (searches recursively through children)
 */
export function findNavItemById(
  id: string,
  items: NavItemConfig[] = getAllNavigation()
): NavItemConfig | undefined {
  for (const item of items) {
    if (item.id === id) {
      return item
    }
    if (item.children) {
      const found = findNavItemById(id, item.children)
      if (found) {
        return found
      }
    }
  }
  return undefined
}

/**
 * Find a navigation item by href path (searches recursively through children)
 */
export function findNavItemByHref(
  href: string,
  items: NavItemConfig[] = getAllNavigation()
): NavItemConfig | undefined {
  for (const item of items) {
    if (item.href === href) {
      return item
    }
    if (item.children) {
      const found = findNavItemByHref(href, item.children)
      if (found) {
        return found
      }
    }
  }
  return undefined
}
